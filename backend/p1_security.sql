-- Apply after canonical_discussion_times.sql. Existing messages are pinned once.
create or replace function na04_private.valid_review(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; r jsonb; k text; d date;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->>'schema' is distinct from 'univ-na04/v2' or p->>'kind' is distinct from 'review' then return false; end if;
  c:=p->'course'; r:=p->'review';
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(r) is distinct from 'object' or octet_length(p::text)>12000 then return false; end if;
  if exists(select 1 from jsonb_object_keys(p) t(k) where t.k not in ('schema','kind','course','review'))
    or exists(select 1 from jsonb_object_keys(c) t(k) where t.k not in ('title','professor','school','department','description','exams','offering'))
    or exists(select 1 from jsonb_object_keys(r) t(k) where t.k not in ('date','term','weekStart','session','comment','overall','understanding','delivery','structure')) then return false; end if;
  foreach k in array array['title','professor','school'] loop
    if jsonb_typeof(c->k) is distinct from 'string' or char_length(c->>k)>60 or btrim(c->>k)='' then return false; end if;
  end loop;
  foreach k in array array['department','description','exams'] loop
    if c ? k and (jsonb_typeof(c->k) is distinct from 'string' or char_length(c->>k)>600) then return false; end if;
  end loop;
  if c ? 'offering' and na04_private.normalize_offering(c->'offering') is null then return false; end if;
  if r ? 'term' and (jsonb_typeof(r->'term') is distinct from 'string' or char_length(r->>'term')>120) then return false; end if;
  if jsonb_typeof(r->'date') is distinct from 'string' or (r->>'date')!~'^\d{4}-\d{2}-\d{2}$' then return false; end if;
  d:=(r->>'date')::date;
  if to_char(d,'YYYY-MM-DD')<>r->>'date' then return false; end if;
  if r ? 'weekStart' then
    if jsonb_typeof(r->'weekStart') is distinct from 'string' then return false; end if;
    if r->>'weekStart'<>'' then
      if (r->>'weekStart')!~'^\d{4}-\d{2}-\d{2}$' or to_char((r->>'weekStart')::date,'YYYY-MM-DD')<>r->>'weekStart' then return false; end if;
    end if;
  end if;
  if jsonb_typeof(r->'session') is distinct from 'string' or char_length(r->>'session')>60 or btrim(r->>'session')=''
    or jsonb_typeof(r->'comment') is distinct from 'string' or char_length(r->>'comment')>500 then return false; end if;
  foreach k in array array['overall','understanding','delivery','structure'] loop
    if jsonb_typeof(r->k) is distinct from 'number' then return false; end if;
    if (r->>k)::numeric not in (1,2,3,4,5) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return false;
end;
$$;
revoke all on function na04_private.valid_review(jsonb) from public,anon,authenticated;

create table na04_private.rooms (
  id uuid primary key default gen_random_uuid(), room_key text not null unique,
  created_at timestamptz not null default now()
);
alter table na04_private.rooms enable row level security;
revoke all on na04_private.rooms from public,anon,authenticated;
create policy deny_direct_access on na04_private.rooms for all to anon,authenticated using(false) with check(false);
alter table na04_private.reviews add column room_id uuid references na04_private.rooms(id);
alter table na04_private.messages add column room_id uuid references na04_private.rooms(id);
insert into na04_private.rooms(room_key) select distinct na04_private.discussion_key(payload) from na04_private.reviews;
update na04_private.reviews r set room_id=room.id from na04_private.rooms room where r.room_id is null and room.room_key=na04_private.discussion_key(r.payload);
update na04_private.messages m set room_id=r.room_id from na04_private.reviews r where m.room_id is null and r.id=m.review_id;
alter table na04_private.reviews alter column room_id set not null;
alter table na04_private.messages alter column room_id set not null;
create index reviews_uid_room_idx on na04_private.reviews(uid,room_id);
create index messages_room_id_id_idx on na04_private.messages(room_id,id);

create or replace function na04_private.bind_review_room() returns trigger
language plpgsql set search_path='' as $$
declare key text;
begin
  key:=na04_private.discussion_key(new.payload);
  insert into na04_private.rooms(room_key) values(key) on conflict(room_key) do nothing;
  select id into new.room_id from na04_private.rooms where room_key=key;
  return new;
end;
$$;
revoke all on function na04_private.bind_review_room() from public,anon,authenticated;
create trigger bind_review_room before insert or update of payload,room_id on na04_private.reviews for each row execute function na04_private.bind_review_room();

create or replace function na04_private.pin_message_room() returns trigger
language plpgsql set search_path='' as $$
declare target uuid;
begin
  if tg_op='UPDATE' then
    if new.room_id is distinct from old.room_id or new.review_id is distinct from old.review_id then raise exception 'Message room is immutable' using errcode='23514'; end if;
  else
    select room_id into target from na04_private.reviews where id=new.review_id for share;
    if new.room_id is not null and new.room_id is distinct from target then raise exception 'Message room does not match review' using errcode='23514'; end if;
    new.room_id:=target;
  end if;
  return new;
end;
$$;
revoke all on function na04_private.pin_message_room() from public,anon,authenticated;
create trigger pin_message_room before insert or update on na04_private.messages for each row execute function na04_private.pin_message_room();

create or replace function na04_private.na04_api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; p jsonb; rid uuid; target_room uuid; body_text text; member na04_private.members%rowtype; binding jsonb; normalized jsonb; synced int:=0;
begin
  if jsonb_typeof(args) is distinct from 'object' then return jsonb_build_object('error','입력 형식을 확인해주세요.'); end if;
  if action='sync_offerings' then
    if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
    if jsonb_typeof(args->'bindings') is distinct from 'array' then return jsonb_build_object('error','시간표 연결 정보를 확인해주세요.'); end if;
    if jsonb_array_length(args->'bindings')>100 then return jsonb_build_object('error','시간표 연결 정보를 확인해주세요.'); end if;
    for binding in select value from jsonb_array_elements(args->'bindings') loop
      if na04_private.normalize_offering(binding->'offering') is null then return jsonb_build_object('error','분반 정보를 확인해주세요.'); end if;
    end loop;
    perform pg_advisory_xact_lock(hashtextextended(u::text,0));
    for binding in select value from jsonb_array_elements(args->'bindings') loop
      normalized:=na04_private.normalize_offering(binding->'offering');
      -- The review's membership may change; existing message rooms never change.
      update na04_private.reviews set payload=jsonb_set(payload,'{course,offering}',normalized),updated_at=now()
      where uid=u and client_id=(binding->>'clientId')::uuid and payload->'course'->'offering' is distinct from normalized;
      if found then synced:=synced+1; end if;
    end loop;
    return jsonb_build_object('ok',true,'synced',synced);
  end if;
  if action='feed' then
    if u is null or not exists(select 1 from na04_private.reviews where uid=u and na04_private.valid_review(payload)) then return jsonb_build_object('locked',true,'records',jsonb_build_array()); end if;
    select coalesce(jsonb_agg(t.item order by t.updated_at desc),'[]') into result from
      (select jsonb_build_object('id',id,'payload',payload,'createdAt',created_at,'updatedAt',updated_at) item,updated_at
       from na04_private.reviews where na04_private.valid_review(payload) order by updated_at desc limit 100) t;
    return result;
  end if;
  if action in ('eligibility','messages','message') then
    if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
    select payload,room_id into p,target_room from na04_private.reviews where id=(args->>'reviewId')::uuid for share;
    if p is null or not na04_private.valid_review(p) then return jsonb_build_object('error','평가를 찾을 수 없습니다.'); end if;
    if not exists(select 1 from na04_private.reviews own where own.uid=u and own.room_id=target_room and na04_private.valid_review(own.payload)) then
      if action='eligibility' then return jsonb_build_object('canParticipate',false); end if;
      return jsonb_build_object('error','이 분반의 수업 평가를 먼저 등록해주세요.');
    end if;
    if action='eligibility' then return jsonb_build_object('canParticipate',true); end if;
  end if;
  if action='messages' then
    select coalesce(jsonb_agg(t.item order by t.id),'[]') into result from
      (select m.id,jsonb_build_object('id',m.id,'alias','익명 '||substr(md5(m.uid::text||target_room::text),1,6),'body',m.body,'createdAt',m.created_at) item
       from na04_private.messages m where m.room_id=target_room order by m.id desc limit 100) t;
    return result;
  end if;
  if u is null then return jsonb_build_object('error','익명 연결이 필요합니다.'); end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  insert into na04_private.members(uid) values(u) on conflict do nothing;
  select * into member from na04_private.members where uid=u;
  if member.blocked_until>now() then return jsonb_build_object('error','현재 글쓰기 이용이 제한되어 있습니다.'); end if;
  if action='accept' then update na04_private.members set accepted_version=1 where uid=u;return jsonb_build_object('ok',true); end if;
  if action='report' then insert into na04_private.reports(uid,message_id) values(u,(args->>'messageId')::bigint) on conflict do nothing;return jsonb_build_object('ok',true); end if;
  if action not in ('review','message') then return jsonb_build_object('error','지원하지 않는 요청입니다.'); end if;
  if member.last_post>now()-interval '5 seconds' then return jsonb_build_object('error','잠시 후 다시 작성해주세요.'); end if;
  if action='message' and member.accepted_version<1 then return jsonb_build_object('error','대화 참여 안내에 먼저 동의해주세요.'); end if;
  p:=args->'payload';
  if action='review' and not na04_private.valid_review(p) then return jsonb_build_object('error','평가 형식과 입력 내용을 확인해주세요.'); end if;
  if action='message' and jsonb_typeof(args->'body') is distinct from 'string' then return jsonb_build_object('error','대화 내용을 확인해주세요.'); end if;
  body_text:=case when action='message' then trim(args->>'body') else p->'review'->>'comment' end;
  if body_text is null or char_length(body_text)>(case when action='message' then 1000 else 500 end) or (action='message' and body_text='') then return jsonb_build_object('error','글 길이를 확인해주세요.'); end if;
  if body_text ~* '(씨[[:space:]]*발|시[[:space:]]*발|병[[:space:]]*신|개[[:space:]]*새[[:space:]]*끼|죽여[[:space:]]*버)' then
    update na04_private.members set strikes=strikes+1,blocked_until=case when strikes+1>=3 then now()+interval '24 hours' else blocked_until end where uid=u;
    return jsonb_build_object('error','사용할 수 없는 표현이 포함되어 있습니다. 반복 사용 시 글쓰기가 제한됩니다.');
  end if;
  if action='review' then
    if (p->'review'->>'date')::date>current_date then return jsonb_build_object('error','미래 수업은 평가할 수 없습니다.'); end if;
    if p->'course' ? 'offering' then p:=jsonb_set(p,'{course,offering}',na04_private.normalize_offering(p->'course'->'offering')); end if;
    insert into na04_private.reviews(uid,client_id,payload) values(u,(args->>'clientId')::uuid,p)
    on conflict(uid,client_id) do update set payload=excluded.payload,updated_at=now() returning id into rid;
    update na04_private.members set last_post=now() where uid=u;return jsonb_build_object('id',rid);
  end if;
  insert into na04_private.messages(review_id,room_id,uid,body) values((args->>'reviewId')::uuid,target_room,u,body_text);
  update na04_private.members set last_post=now() where uid=u;return jsonb_build_object('ok',true);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or not_null_violation or foreign_key_violation then return jsonb_build_object('error','입력 내용을 확인해주세요.');
end;
$$;
revoke all on function na04_private.na04_api(text,jsonb) from public;
grant execute on function na04_private.na04_api(text,jsonb) to anon,authenticated;
