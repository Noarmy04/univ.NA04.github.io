-- Apply once in Supabase. Enable Anonymous Sign-Ins in Authentication settings.
create schema if not exists na04_private;
revoke all on schema na04_private from public, anon, authenticated;
create table na04_private.members (
  uid uuid primary key references auth.users(id), accepted_version integer not null default 0,
  strikes integer not null default 0, blocked_until timestamptz, last_post timestamptz
);
create table na04_private.reviews (
  id uuid primary key default gen_random_uuid(), uid uuid not null references auth.users(id), client_id uuid not null,
  payload jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(uid,client_id)
);
create table na04_private.messages (
  id bigint generated always as identity primary key, review_id uuid not null references na04_private.reviews(id),
  uid uuid not null references auth.users(id), body text not null check(char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on na04_private.messages(review_id,id);
create table na04_private.reports (
  uid uuid not null references auth.users(id), message_id bigint not null references na04_private.messages(id),
  created_at timestamptz not null default now(), primary key(uid,message_id)
);
alter table na04_private.members enable row level security;
alter table na04_private.reviews enable row level security;
alter table na04_private.messages enable row level security;
alter table na04_private.reports enable row level security;
create or replace function public.na04_api(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); result jsonb; p jsonb; rid uuid; body_text text; member na04_private.members%rowtype;
begin
  if action='feed' then
    select coalesce(jsonb_agg(t.item order by t.updated_at desc),'[]') into result from
    (select jsonb_build_object('id',id,'payload',payload,'createdAt',created_at,'updatedAt',updated_at) item,updated_at
     from na04_private.reviews order by updated_at desc limit 100) t;
    return result;
  end if;
  if action='messages' then
    select coalesce(jsonb_agg(t.item order by t.id),'[]') into result from
    (select id,jsonb_build_object('id',id,'alias','익명 '||substr(md5(uid::text||review_id::text),1,6),'body',body,'createdAt',created_at) item
     from na04_private.messages where review_id=(args->>'reviewId')::uuid order by id desc limit 100) t;
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
  if body_text is null or char_length(body_text)>case when action='message' then 1000 else 500 end or (action='message' and body_text='') then return jsonb_build_object('error','글 길이를 확인해주세요.'); end if;
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
    insert into na04_private.reviews(uid,client_id,payload) values(u,(args->>'clientId')::uuid,p)
    on conflict(uid,client_id) do update set payload=excluded.payload,updated_at=now() returning id into rid;
    update na04_private.members set last_post=now() where uid=u;
    return jsonb_build_object('id',rid);
  end if;
  if not exists(select 1 from na04_private.reviews where id=(args->>'reviewId')::uuid) then return jsonb_build_object('error','평가를 찾을 수 없습니다.'); end if;
  insert into na04_private.messages(review_id,uid,body) values((args->>'reviewId')::uuid,u,body_text);
  update na04_private.members set last_post=now() where uid=u;
  return jsonb_build_object('ok',true);
exception when invalid_text_representation or datetime_field_overflow or not_null_violation then
  return jsonb_build_object('error','입력 내용을 확인해주세요.');
end;
$$;
revoke all on function public.na04_api(text,jsonb) from public;
grant execute on function public.na04_api(text,jsonb) to anon,authenticated;
-- Moderation: use SQL as the project owner to inspect reports and block a UID.
-- update na04_private.members set blocked_until=now()+interval '7 days' where uid='...';
-- No user identifier, token, email or private profile is returned in public RPC responses.
