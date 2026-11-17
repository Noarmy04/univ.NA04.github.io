-- Verified regular-semester dates from Hanyang's 2026 undergraduate calendar.
-- https://econ.hanyang.ac.kr/sub/sub05_01.php?boardid=notice&idx=940&mNum=5&mode=view&sNum=1
create table na04_private.academic_terms (
  year integer not null check(year between 2000 and 2100),
  term text not null check(term in ('1','summer','2','winter')),
  starts_on date not null, ends_on date not null check(ends_on>=starts_on),
  primary key(year,term)
);
alter table na04_private.academic_terms enable row level security;
revoke all on na04_private.academic_terms from public,anon,authenticated;
create policy deny_direct_access on na04_private.academic_terms for all to anon,authenticated using(false) with check(false);
insert into na04_private.academic_terms values(2026,'1','2026-03-03','2026-06-22'),(2026,'2','2026-09-01','2026-12-21');

create function na04_private.evaluation_calendar() returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('today',to_char((now() at time zone 'Asia/Seoul')::date,'YYYY-MM-DD'),'term',
    (select jsonb_build_object('year',year,'term',term,'startsOn',to_char(starts_on,'YYYY-MM-DD'),'endsOn',to_char(ends_on,'YYYY-MM-DD'))
     from na04_private.academic_terms where (now() at time zone 'Asia/Seoul')::date between starts_on and ends_on order by starts_on desc limit 1))
$$;
revoke all on function na04_private.evaluation_calendar() from public,anon,authenticated;

create function na04_private.review_in_term(p jsonb,period jsonb,allow_legacy boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
declare o jsonb;
begin
  if period is null or jsonb_typeof(period) is distinct from 'object' or not na04_private.valid_review(p) then return false; end if;
  if p->'review'->>'date'<period->>'startsOn' or p->'review'->>'date'>period->>'endsOn' then return false; end if;
  o:=na04_private.normalize_offering(p->'course'->'offering');
  if o is null then return allow_legacy and not (p->'course'?'offering'); end if;
  return o->>'year'=period->>'year' and o->>'term'=period->>'term';
end;
$$;
revoke all on function na04_private.review_in_term(jsonb,jsonb,boolean) from public,anon,authenticated;

-- Preserve P1 guards and the fixed-room implementation behind a checked gateway.
alter function na04_private.na04_api(text,jsonb) rename to na04_api_core;
revoke all on function na04_private.na04_api_core(text,jsonb) from public,anon,authenticated;
create function na04_private.na04_api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); calendar jsonb; period jsonb; old_payload jsonb; binding jsonb; candidate jsonb; filtered jsonb:='[]';
begin
  calendar:=na04_private.evaluation_calendar();period:=calendar->'term';
  if action='calendar' then return calendar; end if;
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
