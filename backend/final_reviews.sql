-- Final evaluations are separate from daily reviews and never unlock discussion rooms.
create table na04_private.final_reviews (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references na04_private.rooms(id),
  payload jsonb not null check(na04_private.valid_review(payload)),
  updated_at timestamptz not null default now(),
  unique(uid,room_id)
);
create index final_reviews_room_idx on na04_private.final_reviews(room_id);
alter table na04_private.final_reviews enable row level security;
revoke all on na04_private.final_reviews from public,anon,authenticated;
create policy deny_direct_access on na04_private.final_reviews for all to anon,authenticated using(false) with check(false);

create function na04_private.final_class_date(offering jsonb,ends_on date) returns date
language sql immutable set search_path='' as $$
  select max(ends_on-((extract(isodow from ends_on)::int-1-(m->>'day')::int+7)%7))
  from jsonb_array_elements(offering->'meetings') m
$$;
revoke all on function na04_private.final_class_date(jsonb,date) from public,anon,authenticated;

create function na04_private.final_review_api(action text,args jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare u uuid:=auth.uid(); c jsonb:=args->'course'; p jsonb; o jsonb; period na04_private.academic_terms%rowtype;
  last_day date; today date:=(now() at time zone 'Asia/Seoul')::date; room uuid; existing jsonb; member na04_private.members%rowtype;
begin
  if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
  p:=jsonb_build_object('schema','univ-na04/v2','kind','review','course',c,'review',jsonb_build_object('date',today::text,'session','최종평가','comment','','overall',3,'understanding',3,'delivery',3,'structure',3));
  if not na04_private.valid_review(p) then return jsonb_build_object('error','강좌 정보를 확인해주세요.'); end if;
  o:=na04_private.normalize_offering(c->'offering');
  if o is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
  select * into period from na04_private.academic_terms where year=(o->>'year')::int and term=o->>'term';
  if not found then return jsonb_build_object('error','등록된 학기 일정이 없습니다.'); end if;
  last_day:=na04_private.final_class_date(o,period.ends_on);
  select id into room from na04_private.rooms where room_key=na04_private.discussion_key(jsonb_build_object('course',c));
  select payload into existing from na04_private.final_reviews where uid=u and room_id=room;
  if action='final_status' then return jsonb_build_object('lastDate',last_day,'endsOn',period.ends_on,'today',today,'canSubmit',last_day is not null and today between greatest(last_day,period.starts_on) and period.ends_on,'review',existing->'review'); end if;
  if last_day is null or today<greatest(last_day,period.starts_on) or today>period.ends_on then return jsonb_build_object('error','마지막 정규 수업일부터 학기 종료일까지만 최종평가를 작성·수정할 수 있습니다.'); end if;
  if args->'noticeAccepted' is distinct from 'true'::jsonb then return jsonb_build_object('error','최종평가 공개 안내를 확인해주세요.'); end if;
  p:=jsonb_build_object('schema','univ-na04/v2','kind','review','course',jsonb_set(c,'{offering}',o),'review',args->'review');
  if not na04_private.valid_review(p) or btrim(p->'review'->>'comment')='' or p->'review'->>'date'<>last_day::text or p->'review'->>'session'<>'최종평가' then return jsonb_build_object('error','최종평가 점수와 한줄평을 확인해주세요.'); end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  insert into na04_private.members(uid) values(u) on conflict do nothing;
  select * into member from na04_private.members where uid=u;
  if member.blocked_until>now() then return jsonb_build_object('error','현재 글쓰기 이용이 제한되어 있습니다.'); end if;
  if member.last_post>now()-interval '5 seconds' then return jsonb_build_object('error','잠시 후 다시 작성해주세요.'); end if;
  if p->'review'->>'comment' ~* '(씨[[:space:]]*발|시[[:space:]]*발|병[[:space:]]*신|개[[:space:]]*새[[:space:]]*끼|죽여[[:space:]]*버)' then
    update na04_private.members set strikes=strikes+1,blocked_until=case when strikes+1>=3 then now()+interval '24 hours' else blocked_until end where uid=u;
    return jsonb_build_object('error','사용할 수 없는 표현이 포함되어 있습니다. 반복 사용 시 글쓰기가 제한됩니다.');
  end if;
  insert into na04_private.rooms(room_key) values(na04_private.discussion_key(p)) on conflict(room_key) do update set room_key=excluded.room_key returning id into room;
  insert into na04_private.final_reviews(uid,room_id,payload) values(u,room,p) on conflict(uid,room_id) do update set payload=excluded.payload,updated_at=now();
  update na04_private.members set last_post=now() where uid=u;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function na04_private.final_review_api(text,jsonb) from public,anon,authenticated;

create or replace function na04_private.course_ratings(courses jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare item jsonb; k text; result jsonb;
begin
  if jsonb_typeof(courses) is distinct from 'array' then return jsonb_build_object('error','강좌 목록을 확인해주세요.'); end if;
  if jsonb_array_length(courses)>60 or octet_length(courses::text)>200000 then return jsonb_build_object('error','한 번에 60개 강좌까지 조회할 수 있습니다.'); end if;
  for item in select value from jsonb_array_elements(courses) loop
    if jsonb_typeof(item) is distinct from 'object' then return jsonb_build_object('error','강좌 정보를 확인해주세요.'); end if;
    foreach k in array array['title','professor','school'] loop
      if jsonb_typeof(item->k) is distinct from 'string' or char_length(item->>k)>60 or btrim(item->>k)='' then return jsonb_build_object('error','강좌 정보를 확인해주세요.'); end if;
    end loop;
    if na04_private.normalize_offering(item->'offering') is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
  end loop;
  with requested as (
    select ordinality as position,na04_private.discussion_key(jsonb_build_object('course',value)) as room_key
    from jsonb_array_elements(courses) with ordinality
  ), summaries as (
    select q.position,count(r.id) as count,round(avg((r.payload->'review'->>'overall')::numeric),1) as average
    from requested q left join na04_private.rooms room on room.room_key=q.room_key
    left join na04_private.final_reviews r on r.room_id=room.id and na04_private.valid_review(r.payload)
    group by q.position
  ) select coalesce(jsonb_agg(jsonb_build_object('count',count,'average',average,'comments',(select coalesce(jsonb_agg(comment order by updated_at desc,id),'[]') from (select f.payload->'review'->>'comment' as comment,f.updated_at,f.id from na04_private.final_reviews f join na04_private.rooms rm on rm.id=f.room_id where rm.room_key=(select room_key from requested where position=summaries.position) and na04_private.valid_review(f.payload) order by f.updated_at desc,f.id limit 10) recent)) order by position),'[]') into result from summaries;
  return jsonb_build_object('locked',false,'ratings',result);
end;
$$;
revoke all on function na04_private.course_ratings(jsonb) from public,anon,authenticated;

create or replace function na04_private.na04_api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); calendar jsonb; period jsonb; old_payload jsonb; binding jsonb; candidate jsonb; filtered jsonb:='[]';
begin
  calendar:=na04_private.evaluation_calendar();period:=calendar->'term';
  if action='calendar' then return calendar; end if;
  if action='ratings' then return na04_private.course_ratings(args->'courses'); end if;
  if action in ('final_status','final_review') then return na04_private.final_review_api(action,args); end if;
  if action='review' and u is not null then
    perform pg_advisory_xact_lock(hashtextextended(u::text,0));
    if not na04_private.review_in_term(args->'payload',period) then return jsonb_build_object('error','현재 학기의 과목과 수업 날짜만 평가할 수 있습니다.'); end if;
    select payload into old_payload from na04_private.reviews where uid=u and client_id=(args->>'clientId')::uuid;
    if old_payload is not null and not na04_private.review_in_term(old_payload,period,true) then return jsonb_build_object('error','지난 학기의 평가는 수정할 수 없습니다.'); end if;
  end if;
  if action='sync_offerings' and u is not null then
    if jsonb_typeof(args->'bindings') is distinct from 'array' then return jsonb_build_object('error','시간표 연결 정보를 확인해주세요.'); end if;
    if jsonb_array_length(args->'bindings')>100 then return jsonb_build_object('error','시간표 연결 정보를 확인해주세요.'); end if;
    perform pg_advisory_xact_lock(hashtextextended(u::text,0));
    for binding in select value from jsonb_array_elements(args->'bindings') loop
      if na04_private.normalize_offering(binding->'offering') is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
      old_payload:=null;
      select payload into old_payload from na04_private.reviews where uid=u and client_id=(binding->>'clientId')::uuid;
      candidate:=jsonb_set(old_payload,'{course,offering}',binding->'offering');
      if na04_private.review_in_term(old_payload,period,true) and na04_private.review_in_term(candidate,period) then filtered:=filtered||jsonb_build_array(binding); end if;
    end loop;
    args:=jsonb_build_object('bindings',filtered);
  end if;
  -- Keep the existing future-date check consistent with the Korean calendar.
  perform set_config('TimeZone','Asia/Seoul',true);
  return na04_private.na04_api_core(action,args);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','입력 내용을 확인해주세요.');
end;
$$;
revoke all on function na04_private.na04_api(text,jsonb) from public;
grant execute on function na04_private.na04_api(text,jsonb) to anon,authenticated;
