-- Aggregate the whole offering, rather than the latest 100 feed records.
create index if not exists reviews_room_id_idx on na04_private.reviews(room_id);
create function na04_private.course_ratings(courses jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare item jsonb; k text; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from na04_private.reviews where uid=auth.uid() and na04_private.valid_review(payload)) then
    return jsonb_build_object('locked',true,'ratings',jsonb_build_array());
  end if;
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
    left join na04_private.reviews r on r.room_id=room.id and na04_private.valid_review(r.payload)
    group by q.position
  ) select coalesce(jsonb_agg(jsonb_build_object('count',count,'average',average) order by position),'[]') into result from summaries;
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
