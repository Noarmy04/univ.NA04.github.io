create or replace function na04_private.normalize_offering(o jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare y int; term text; num text; item jsonb; times jsonb;
begin
  if jsonb_typeof(o) is distinct from 'object' then return null; end if;
  y:=(o->>'year')::int; term:=o->>'term'; num:=coalesce(o->>'number','');
  if y is null or y<2000 or y>2100 or term is null or term not in ('1','2','summer','winter') or num!~'^[A-Za-z0-9_-]{0,30}$' or jsonb_typeof(o->'meetings') is distinct from 'array' then return null; end if;
  if jsonb_array_length(o->'meetings')>28 then return null; end if;
  for item in select value from jsonb_array_elements(o->'meetings') loop
    if not coalesce((item->>'day')::int between 0 and 6 and (item->>'start')~'^([01][0-9]|2[0-3]):[0-5][05]$' and (item->>'end')~'^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$' and (item->>'start')<(item->>'end'),false) then return null; end if;
  end loop;
  select coalesce(jsonb_agg(m order by m->>'day',m->>'start',m->>'end'),'[]') into times from (select distinct jsonb_build_object('day',(value->>'day')::int,'start',value->>'start','end',value->>'end') as m from jsonb_array_elements(o->'meetings')) t;
  return jsonb_build_object('year',y,'term',term,'number',num,'meetings',times);
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$$;
create or replace function na04_private.discussion_key(p jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare c jsonb:=p->'course'; o jsonb:=na04_private.normalize_offering(p->'course'->'offering'); y text; term text; identity text;
begin
  if o is null then
    y:=left(coalesce(p->'review'->>'date','2000-01-01'),4);
    term:=case when p->'review'->>'term' like '%여름%' then 'summer' when p->'review'->>'term' like '%겨울%' then 'winter' when p->'review'->>'term' like '%1학기%' then '1' when substring(p->'review'->>'date',6,2)<'07' then '1' else '2' end;
    identity:='unknown';
  else
    y:=o->>'year'; term:=o->>'term';
    if o->>'number'<>'' then identity:='section:'||(o->>'number');
    else
      select 'times:'||string_agg((value->>'day')||':'||(value->>'start')||'-'||(value->>'end'),';' order by value->>'day',value->>'start',value->>'end') into identity from jsonb_array_elements(o->'meetings');
      identity:=coalesce(identity,'unknown');
    end if;
  end if;
  return md5(jsonb_build_array(lower(regexp_replace(c->>'school','[[:space:]]','','g')),lower(regexp_replace(c->>'title','[[:space:]]','','g')),lower(regexp_replace(c->>'professor','[[:space:]]','','g')),y,term,identity)::text);
end;
$$;
revoke all on function na04_private.normalize_offering(jsonb) from public,anon,authenticated;
revoke all on function na04_private.discussion_key(jsonb) from public,anon,authenticated;

-- Group discussion messages by academic offering, preserving all existing messages.
create or replace function na04_private.na04_api(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); result jsonb; p jsonb; rid uuid; body_text text; member na04_private.members%rowtype; binding jsonb; normalized jsonb; synced int:=0;
begin
  if action='sync_offerings' then
    if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
    if jsonb_typeof(args->'bindings') is distinct from 'array' or jsonb_array_length(args->'bindings')>100 then return jsonb_build_object('error','시간표 연결 정보를 확인해주세요.'); end if;
    for binding in select value from jsonb_array_elements(args->'bindings') loop
      if na04_private.normalize_offering(binding->'offering') is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
    end loop;
    perform pg_advisory_xact_lock(hashtextextended(u::text,0));
    for binding in select value from jsonb_array_elements(args->'bindings') loop
      normalized:=na04_private.normalize_offering(binding->'offering');
      update na04_private.reviews set payload=jsonb_set(payload,'{course,offering}',normalized),updated_at=now()
      where uid=u and client_id=(binding->>'clientId')::uuid and payload->'course'->'offering' is distinct from normalized;
      if found then synced:=synced+1; end if;
    end loop;
    return jsonb_build_object('ok',true,'synced',synced);
  end if;
  if action='feed' then
    if u is null or not exists(select 1 from na04_private.reviews where uid=u) then
      return jsonb_build_object('locked',true,'records',jsonb_build_array());
    end if;
    select coalesce(jsonb_agg(t.item order by t.updated_at desc),'[]') into result from
    (select jsonb_build_object('id',id,'payload',payload,'createdAt',created_at,'updatedAt',updated_at) item,updated_at
     from na04_private.reviews order by updated_at desc limit 100) t;
    return result;
  end if;
  if action in ('eligibility','messages','message') then
    if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
    select payload into p from na04_private.reviews where id=(args->>'reviewId')::uuid;
    if p is null then return jsonb_build_object('error','평가를 찾을 수 없습니다.'); end if;
    if not exists (
      select 1 from na04_private.reviews own where own.uid=u
      and na04_private.discussion_key(own.payload)=na04_private.discussion_key(p)
    ) then
      if action='eligibility' then return jsonb_build_object('canParticipate',false); end if;
      return jsonb_build_object('error','이 분반의 수업 평가를 먼저 등록해주세요.');
    end if;
    if action='eligibility' then return jsonb_build_object('canParticipate',true); end if;
  end if;
  if action='messages' then
    select coalesce(jsonb_agg(t.item order by t.id),'[]') into result from
    (select m.id,jsonb_build_object('id',m.id,'alias','익명 '||substr(md5(m.uid::text||na04_private.discussion_key(p)),1,6),'body',m.body,'createdAt',m.created_at) item
     from na04_private.messages m join na04_private.reviews r on r.id=m.review_id
     where na04_private.discussion_key(r.payload)=na04_private.discussion_key(p) order by m.id desc limit 100) t;
    return result;
  end if;
  if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  insert into na04_private.members(uid) values(u) on conflict do nothing;
  select * into member from na04_private.members where uid=u;
  if member.blocked_until>now() then return jsonb_build_object('error','현재 글쓰기 이용이 제한되어 있습니다.'); end if;
  if action='accept' then
    update na04_private.members set accepted_version=1 where uid=u;
    return jsonb_build_object('ok',true);
  end if;
  if action='report' then
    insert into na04_private.reports(uid,message_id) values(u,(args->>'messageId')::bigint) on conflict do nothing;
    return jsonb_build_object('ok',true);
  end if;
  if action not in ('review','message') then return jsonb_build_object('error','지원하지 않는 요청입니다.'); end if;
  if member.last_post>now()-interval '5 seconds' then return jsonb_build_object('error','잠시 후 다시 작성해주세요.'); end if;
  if action='message' and member.accepted_version<1 then return jsonb_build_object('error','대화 참여 안내에 먼저 동의해주세요.'); end if;
  p=args->'payload';
  body_text=case when action='message' then trim(args->>'body') else p->'review'->>'comment' end;
  if body_text is null or char_length(body_text)>(case when action='message' then 1000 else 500 end) or (action='message' and body_text='') then return jsonb_build_object('error','글 길이를 확인해주세요.'); end if;
  if body_text ~* '(씨[[:space:]]*발|시[[:space:]]*발|병[[:space:]]*신|개[[:space:]]*새[[:space:]]*끼|죽여[[:space:]]*버)' then
    update na04_private.members set strikes=strikes+1,
      blocked_until=case when strikes+1>=3 then now()+interval '24 hours' else blocked_until end where uid=u;
    return jsonb_build_object('error','사용할 수 없는 표현이 포함되어 있습니다. 반복 사용 시 글쓰기가 제한됩니다.');
  end if;
  if action='review' then
    if p->>'schema' is distinct from 'univ-na04/v2' or p->>'kind' is distinct from 'review' then return jsonb_build_object('error','평가 형식이 올바르지 않습니다.'); end if;
    if not coalesce((char_length(p->'course'->>'title') between 1 and 60) and (char_length(p->'course'->>'professor') between 1 and 60) and (char_length(p->'course'->>'school') between 1 and 60) and (char_length(p->'review'->>'session') between 1 and 60) and octet_length(p::text)<=12000,false) then return jsonb_build_object('error','과목 정보를 확인해주세요.'); end if;
    if p->'review'->>'date' is null then return jsonb_build_object('error','수업 날짜가 필요합니다.'); end if;
    if (p->'review'->>'date')::date>current_date then return jsonb_build_object('error','미래 수업은 평가할 수 없습니다.'); end if;
    if not coalesce(((p->'review'->>'overall')::int between 1 and 5 and (p->'review'->>'understanding')::int between 1 and 5 and (p->'review'->>'delivery')::int between 1 and 5 and (p->'review'->>'structure')::int between 1 and 5),false) then return jsonb_build_object('error','점수는 1~5점이어야 합니다.'); end if;
    if p->'course' ? 'offering' then
      normalized:=na04_private.normalize_offering(p->'course'->'offering');
      if normalized is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
      p:=jsonb_set(p,'{course,offering}',normalized);
    end if;
    insert into na04_private.reviews(uid,client_id,payload) values(u,(args->>'clientId')::uuid,p)
    on conflict(uid,client_id) do update set payload=excluded.payload,updated_at=now() returning id into rid;
    update na04_private.members set last_post=now() where uid=u;
    return jsonb_build_object('id',rid);
  end if;
  if not exists(select 1 from na04_private.reviews where id=(args->>'reviewId')::uuid) then return jsonb_build_object('error','평가를 찾을 수 없습니다.'); end if;
  insert into na04_private.messages(review_id,uid,body) values((args->>'reviewId')::uuid,u,body_text);
  update na04_private.members set last_post=now() where uid=u;
  return jsonb_build_object('ok',true);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or not_null_violation or foreign_key_violation then
  return jsonb_build_object('error','입력 내용을 확인해주세요.');
end;
$$;


with matches as (
  select r.id, c.value->'offering' offering
  from na04_private.reviews r cross join jsonb_array_elements('[{"title":"오픈소스개발과활용","professor":"구혜란","offering":{"year":2026,"term":"2","number":"25098","meetings":[{"day":3,"start":"09:00","end":"11:00"}]}},{"title":"오픈소스개발과활용","professor":"구혜란","offering":{"year":2026,"term":"2","number":"25153","meetings":[{"day":1,"start":"09:00","end":"11:00"}]}}]'::jsonb) c
  where not (r.payload->'course' ? 'offering')
    and regexp_replace(r.payload->'course'->>'school','[[:space:]]','','g')='한양대학교ERICA'
    and regexp_replace(r.payload->'course'->>'title','[[:space:]]','','g')=c.value->>'title'
    and regexp_replace(r.payload->'course'->>'professor','[[:space:]]','','g')=c.value->>'professor'
    and r.payload->'review'->>'date' between '2026-09-01' and '2026-12-31'
    and exists(select 1 from jsonb_array_elements(c.value->'offering'->'meetings') m where (m->>'day')::int=extract(isodow from (r.payload->'review'->>'date')::date)::int-1)
), unique_matches as (select id from matches group by id having count(*)=1)
update na04_private.reviews r set payload=jsonb_set(r.payload,'{course,offering}',na04_private.normalize_offering(m.offering))
from matches m join unique_matches u on u.id=m.id where r.id=m.id;
