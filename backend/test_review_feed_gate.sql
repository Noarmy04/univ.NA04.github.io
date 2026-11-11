-- All fixtures are rolled back. No real evaluation data is changed.
begin;
create temp table feed_gate_test_results(result jsonb);
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); x jsonb; p jsonb; rid uuid;
begin
  insert into auth.users(id,is_anonymous) values(a,true),(b,true);
  perform set_config('request.jwt.claim.sub','',true);
  x:=public.na04_api('feed','{}');
  if x->>'locked' is distinct from 'true' or x->'records' <> '[]'::jsonb then raise exception 'unauthenticated feed exposed'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  p:='{"schema":"univ-na04/v2","kind":"review","course":{"school":"QA campus","title":"QA source course","professor":"QA professor","offering":{"year":2026,"term":"2","number":"111","meetings":[{"day":1,"start":"09:00","end":"11:00"}]}},"review":{"date":"2026-11-10","session":"QA","comment":"QA private test content","overall":4,"understanding":4,"delivery":4,"structure":4}}';
  x:=public.na04_api('review',jsonb_build_object('clientId',gen_random_uuid(),'payload',p));
  if x ? 'error' then raise exception 'fixture review failed %',x; end if;
  rid:=(x->>'id')::uuid;
  perform set_config('request.jwt.claim.sub',b::text,true);
  x:=public.na04_api('feed','{}');
  if x->>'locked' is distinct from 'true' or x::text like '%QA private test content%' then raise exception 'unreviewed user read evaluation'; end if;
  perform public.na04_api('accept','{}');
  x:=public.na04_api('feed','{}');
  if x->>'locked' is distinct from 'true' then raise exception 'notice acceptance bypassed review gate'; end if;
  x:=public.na04_api('review',jsonb_build_object('clientId',gen_random_uuid(),'payload',jsonb_set(p,'{course,title}','"QA other course"')));
  if x ? 'error' then raise exception 'second review failed %',x; end if;
  x:=public.na04_api('feed','{}');
  if jsonb_typeof(x)<>'array' or not exists(select 1 from jsonb_array_elements(x) item where item->>'id'=rid::text) then raise exception 'reviewed user cannot read feed'; end if;
  if exists(select 1 from jsonb_array_elements(x) item where item ? 'uid' or item ? 'email') then raise exception 'feed contains identities'; end if;
  x:=public.na04_api('eligibility',jsonb_build_object('reviewId',rid));
  if x->>'canParticipate' is distinct from 'false' then raise exception 'discussion same-course restriction regressed'; end if;
  insert into feed_gate_test_results values('{"unauthenticatedBlocked":true,"unreviewedBlocked":true,"noticeCannotBypass":true,"reviewedAllowed":true,"identityPrivate":true,"discussionCourseGatePreserved":true}');
end $test$;
select result from feed_gate_test_results;
rollback;
