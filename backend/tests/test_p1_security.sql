-- Synthetic fixtures only; every change is rolled back.
begin;
create temp table p1_qa_results(result jsonb);
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); ca uuid:=gen_random_uuid(); ra uuid; rb uuid; rc uuid; poison uuid;
  old_room uuid; new_room uuid; mid bigint; p jsonb; other jsonb; x jsonb; invalid jsonb;
begin
  insert into auth.users(id,is_anonymous) values(a,true),(b,true),(c,true),(d,true);
  p:='{"schema":"univ-na04/v2","kind":"review","course":{"school":"P1 QA","title":"P1 subject","professor":"P1 teacher","offering":{"year":2026,"term":"2","number":"111","meetings":[{"day":1,"start":"09:00","end":"11:00"}]}},"review":{"date":"2026-11-10","term":"2026년 2학기","weekStart":"2026-09-01","session":"QA","comment":"valid","overall":4,"understanding":4,"delivery":4,"structure":4}}';
  if not na04_private.valid_review(p) then raise exception 'valid review rejected'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(p,'{review,term}','{}'),jsonb_set(p,'{review,term}','null'),jsonb_set(p,'{review,weekStart}','[]'),
    jsonb_set(p,'{review,date}','"2026-02-30"'),jsonb_set(p,'{review,overall}','"4"'),jsonb_set(p,'{course,description}','{}'),
    jsonb_set(p,'{course,offering,meetings}','{}'),jsonb_set(p,'{review,session}','"   "'),jsonb_set(p,'{review,unexpected}','"private field"')
  )) loop
    if na04_private.valid_review(invalid) then raise exception 'malformed payload accepted %',invalid; end if;
    x:=public.na04_api('review',jsonb_build_object('clientId',gen_random_uuid(),'payload',invalid));
    if not x ? 'error' then raise exception 'RPC accepted malformed payload %',x; end if;
  end loop;
  x:=public.na04_api('review',jsonb_build_object('clientId',ca,'payload',p));ra:=(x->>'id')::uuid;
  if ra is null then raise exception 'first review failed %',x; end if;
  select room_id into old_room from na04_private.reviews where id=ra;
  perform set_config('request.jwt.claim.sub',b::text,true);
  x:=public.na04_api('review',jsonb_build_object('clientId',gen_random_uuid(),'payload',jsonb_set(p,'{review,date}','"2026-11-03"')));rb:=(x->>'id')::uuid;
  if rb is null or (select room_id from na04_private.reviews where id=rb) is distinct from old_room then raise exception 'same class got another room'; end if;
  perform public.na04_api('accept','{}');update na04_private.members set last_post=null where uid=b;
  x:=public.na04_api('message',jsonb_build_object('reviewId',ra,'body','P1 private original-room message'));
  if x->>'ok' is distinct from 'true' then raise exception 'message failed %',x; end if;
  select id into mid from na04_private.messages where review_id=ra and uid=b;
  other:=jsonb_set(jsonb_set(p,'{course,offering,number}','"222"'),'{course,offering,meetings,0,day}','3');
  perform set_config('request.jwt.claim.sub',c::text,true);
  x:=public.na04_api('review',jsonb_build_object('clientId',gen_random_uuid(),'payload',other));rc:=(x->>'id')::uuid;
  if rc is null then raise exception 'other class review failed %',x; end if;
  select room_id into new_room from na04_private.reviews where id=rc;
  if new_room=old_room then raise exception 'different classes merged'; end if;
  x:=public.na04_api('messages',jsonb_build_object('reviewId',ra));if not x ? 'error' then raise exception 'other class could read original room'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);update na04_private.members set last_post=null where uid=a;
  x:=public.na04_api('review',jsonb_build_object('clientId',ca,'payload',other));
  if x->>'id' is distinct from ra::text or (select room_id from na04_private.reviews where id=ra) is distinct from new_room then raise exception 'review edit failed %',x; end if;
  if (select room_id from na04_private.messages where id=mid) is distinct from old_room then raise exception 'review edit moved existing message'; end if;
  perform set_config('request.jwt.claim.sub',c::text,true);
  x:=public.na04_api('messages',jsonb_build_object('reviewId',rc));if jsonb_array_length(x)<>0 then raise exception 'old message leaked into new room %',x; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  x:=public.na04_api('messages',jsonb_build_object('reviewId',rb));if jsonb_array_length(x)<>1 or x->0->>'body'<>'P1 private original-room message' then raise exception 'original room lost message %',x; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  x:=public.na04_api('messages',jsonb_build_object('reviewId',rb));if not x ? 'error' then raise exception 'changed membership still reads old room'; end if;
  x:=public.na04_api('sync_offerings',jsonb_build_object('bindings',jsonb_build_array(jsonb_build_object('clientId',ca,'offering',p->'course'->'offering'))));
  if x->>'synced' is distinct from '1' then raise exception 'sync failed %',x; end if;
  x:=public.na04_api('sync_offerings',jsonb_build_object('bindings',jsonb_build_array(jsonb_build_object('clientId',ca,'offering',other->'course'->'offering'))));
  if (select room_id from na04_private.messages where id=mid) is distinct from old_room then raise exception 'sync moved message'; end if;
  begin
    update na04_private.messages set room_id=new_room where id=mid;
    raise exception 'message room update was allowed';
  exception when check_violation then null; end;
  -- A corrupt legacy row cannot unlock the feed or poison the returned list.
  insert into na04_private.reviews(uid,client_id,payload) values(d,gen_random_uuid(),jsonb_set(p #- '{course,offering}','{review,term}','{}')) returning id into poison;
  x:=public.na04_api('feed','{}');
  if jsonb_typeof(x)<>'array' or exists(select 1 from jsonb_array_elements(x) r where r->>'id'=poison::text) then raise exception 'invalid legacy row returned by feed'; end if;
  perform set_config('request.jwt.claim.sub',d::text,true);x:=public.na04_api('feed','{}');if x->>'locked' is distinct from 'true' then raise exception 'invalid-only review unlocked feed'; end if;
  if has_table_privilege('anon','na04_private.rooms','SELECT') or has_table_privilege('authenticated','na04_private.rooms','SELECT') then raise exception 'room table directly accessible'; end if;
  insert into p1_qa_results values('{"strictPayloadValidation":true,"badLegacyRecordIsolated":true,"sameClassSameRoom":true,"differentClassBlocked":true,"reviewEditCannotMoveMessages":true,"syncCannotMoveMessages":true,"originalMessagesPreserved":true,"messageRoomImmutable":true,"roomsPrivate":true}');
end;
$test$;
select result from p1_qa_results;
rollback;
