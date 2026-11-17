begin;
create temp table catalog_rating_qa(result jsonb);
create function pg_temp.add_final(u uuid,p jsonb) returns void language plpgsql as $$
declare room uuid;
begin
 insert into na04_private.rooms(room_key) values(na04_private.discussion_key(p)) on conflict(room_key) do update set room_key=excluded.room_key returning id into room;
 insert into na04_private.final_reviews(uid,room_id,payload) values(u,room,p);
end;
$$;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); unreviewed uuid:=gen_random_uuid(); p jsonb; other jsonb; target jsonb; x jsonb;
begin
  insert into auth.users(id,is_anonymous) values(a,true),(b,true),(unreviewed,true);
  p:='{"schema":"univ-na04/v2","kind":"review","course":{"school":"rating QA","title":"rating QA","professor":"QA teacher","offering":{"year":2026,"term":"2","number":"111","meetings":[{"day":1,"start":"09:00","end":"11:00"}]}},"review":{"date":"2026-11-10","session":"QA","comment":"private text must not be returned","overall":5,"understanding":4,"delivery":4,"structure":4}}';
  target:=p->'course';
  perform set_config('request.jwt.claim.sub','',true);x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));if x->>'locked' is distinct from 'false' or x->'ratings'->0->>'count'<>'0' then raise exception 'public empty ratings unavailable'; end if;
  perform set_config('request.jwt.claim.sub',unreviewed::text,true);x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));if x->>'locked' is distinct from 'false' then raise exception 'unreviewed user cannot see ratings'; end if;
  perform pg_temp.add_final(a,p);perform pg_temp.add_final(b,jsonb_set(p,'{review,overall}','3'));
  perform set_config('request.jwt.claim.sub',a::text,true);
  x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));
  if x->'ratings'->0->>'count'<>'2' or (x->'ratings'->0->>'average')::numeric<>4 then raise exception 'mean incorrect %',x; end if;
  perform set_config('request.jwt.claim.sub','',true);x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));if x->'ratings'->0->>'count'<>'2' or (x->'ratings'->0->>'average')::numeric<>4 then raise exception 'public mean unavailable %',x; end if;
  perform set_config('request.jwt.claim.sub',unreviewed::text,true);x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));if x->'ratings'->0->>'count'<>'2' then raise exception 'unreviewed rating unavailable'; end if;
  x:=public.na04_api('feed','{}');if x->>'locked' is distinct from 'true' then raise exception 'rating access unlocked private feedback'; end if;
  x:=public.na04_api('eligibility',jsonb_build_object('reviewId',gen_random_uuid()));if x->>'canParticipate' is distinct from 'false' and not x?'error' then raise exception 'public rating unlocked discussion'; end if;
  x:=public.na04_api('messages',jsonb_build_object('reviewId',gen_random_uuid()));if not x?'error' then raise exception 'unreviewed user read messages'; end if;
  x:=public.na04_api('message',jsonb_build_object('reviewId',gen_random_uuid(),'body','must not post'));if not x?'error' then raise exception 'unreviewed user posted message'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  other:=jsonb_set(jsonb_set(p,'{course,offering,number}','"222"'),'{course,offering,meetings,0,day}','3');
  perform pg_temp.add_final(b,jsonb_set(other,'{review,overall}','2'));
  perform pg_temp.add_final(b,jsonb_set(p,'{course,professor}','"other teacher"'));
  perform pg_temp.add_final(b,jsonb_set(p,'{course,offering,year}','2025'));
  -- Put over 100 unrelated, newer records in the feed: target stats must survive.
  perform pg_temp.add_final(b,jsonb_set(p,'{course,title}',to_jsonb('noise '||n))) from generate_series(1,101) n;
  x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target,other->'course',jsonb_set(target,'{title}','"empty class"'))));
  if x->'ratings'->0->>'count'<>'2' or (x->'ratings'->0->>'average')::numeric<>4 or x->'ratings'->1->>'count'<>'1' or (x->'ratings'->1->>'average')::numeric<>2 then raise exception 'sections, professors or terms merged %',x; end if;
  if x->'ratings'->2->>'count'<>'0' or x->'ratings'->2->'average'<>'null'::jsonb then raise exception 'empty class has fabricated rating %',x; end if;
  if x::text like '%uid%' or x::text like '%teacher%' then raise exception 'rating result exposes raw data %',x; end if;
  perform pg_temp.add_final(unreviewed,jsonb_set(p,'{review,date}','"2026-11-03"'));
  x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(target)));if x->'ratings'->0->>'count'<>'3' or (x->'ratings'->0->>'average')::numeric<>4.3 then raise exception 'week aggregation or rounding failed %',x; end if;
  x:=public.na04_api('ratings',jsonb_build_object('courses',jsonb_build_array(jsonb_set(target,'{offering,meetings}','{}'))));if not x?'error' then raise exception 'bad offering accepted'; end if;
  x:=public.na04_api('ratings',jsonb_build_object('courses',(select jsonb_agg(target) from generate_series(1,61))));if not x?'error' then raise exception 'unbounded batch accepted'; end if;
  if has_function_privilege('authenticated','na04_private.course_ratings(jsonb)','execute') then raise exception 'private helper accessible'; end if;
  insert into catalog_rating_qa values('{"publicRatings":true,"feedbackGatePreserved":true,"discussionGatePreserved":true,"accurateAverage":true,"separateOfferings":true,"finalReviewsOnly":true,"notTruncatedAt100":true,"emptyClassClear":true,"rawDataPrivate":true,"boundedValidatedInput":true}');
end;
$test$;
select result from catalog_rating_qa;
rollback;
