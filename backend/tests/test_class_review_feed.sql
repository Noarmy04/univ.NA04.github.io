begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();p jsonb;q jsonb;x jsonb;ownid uuid;otherid uuid;n int;
begin
 insert into auth.users(id,is_anonymous) values(a,true),(b,true),(c,true);
 p:='{"schema":"univ-na04/v2","kind":"review","course":{"school":"class feed QA","title":"QA course","professor":"QA teacher","offering":{"year":2026,"term":"2","number":"A","meetings":[{"day":1,"start":"09:00","end":"11:00"}]}},"review":{"date":"2026-11-10","session":"QA","comment":"allowed same section","overall":4,"understanding":4,"delivery":4,"structure":4}}';
 insert into na04_private.reviews(uid,client_id,payload) values(a,gen_random_uuid(),p) returning id into ownid;
 insert into na04_private.reviews(uid,client_id,payload) values(b,gen_random_uuid(),jsonb_set(p,'{review,date}','"2026-11-03"')) returning id into otherid;
 -- Newer records from unrelated classes must neither leak nor consume the limit.
 for n in 1..101 loop
  q:=jsonb_set(p,'{course,title}',to_jsonb('unrelated '||n));
  insert into na04_private.reviews(uid,client_id,payload) values(b,gen_random_uuid(),q);
 end loop;
 insert into na04_private.reviews(uid,client_id,payload) values
 (b,gen_random_uuid(),jsonb_set(p,'{course,offering,meetings,0,day}','3')),
 (b,gen_random_uuid(),jsonb_set(p,'{course,professor}','"another teacher"')),
 (b,gen_random_uuid(),jsonb_set(p,'{course,offering,year}','2025'));
 perform set_config('request.jwt.claim.sub','',true);x:=public.na04_api('feed','{}');if x->>'locked'<>'true' then raise exception 'anonymous feed unlocked';end if;
 perform set_config('request.jwt.claim.sub',c::text,true);x:=public.na04_api('feed','{}');if x->>'locked'<>'true' then raise exception 'unreviewed feed unlocked';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);x:=public.na04_api('feed','{}');
 if jsonb_typeof(x)<>'array' or jsonb_array_length(x)<>2 or not exists(select 1 from jsonb_array_elements(x) e where e->>'id'=otherid::text) then raise exception 'class filter failed %',x;end if;
 if exists(select 1 from jsonb_array_elements(x) e where e->'payload'->'course' is distinct from p->'course') then raise exception 'other section leaked';end if;
 -- Changing one's class revokes old class access immediately.
 update na04_private.reviews set payload=jsonb_set(p,'{course,title}','"new class"') where id=ownid;
 x:=public.na04_api('feed','{}');if jsonb_array_length(x)<>1 or x->0->>'id'<>ownid::text then raise exception 'stale membership retained';end if;
 if has_function_privilege('authenticated','na04_private.class_review_feed()','execute') then raise exception 'private helper exposed';end if;
end;
$test$;
select '{"classMembershipRequired":true,"otherTimeProfessorTermBlocked":true,"datesMergedWithinClass":true,"filteredBeforeLimit":true,"membershipRevocation":true}'::jsonb as result;
rollback;
