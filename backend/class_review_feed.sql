-- Return only daily reviews from the requester's evaluated, fixed class rooms.
create function na04_private.class_review_feed() returns jsonb
language plpgsql stable set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not exists(select 1 from na04_private.reviews where uid=u and na04_private.valid_review(payload)) then
  return jsonb_build_object('locked',true,'records',jsonb_build_array());
 end if;
 select coalesce(jsonb_agg(t.item order by t.updated_at desc,t.id),'[]') into result from
 (select r.id,r.updated_at,jsonb_build_object('id',r.id,'payload',r.payload,'createdAt',r.created_at,'updatedAt',r.updated_at) item
  from na04_private.reviews r where r.room_id is not null and na04_private.valid_review(r.payload)
  and exists(select 1 from na04_private.reviews own where own.uid=u and own.room_id=r.room_id and na04_private.valid_review(own.payload))
  order by r.updated_at desc,r.id limit 100) t;
 return result;
end;
$$;
revoke all on function na04_private.class_review_feed() from public,anon,authenticated;

create or replace function na04_private.na04_api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); calendar jsonb; period jsonb; old_payload jsonb; binding jsonb; candidate jsonb; filtered jsonb:='[]';
begin
  calendar:=na04_private.evaluation_calendar();period:=calendar->'term';
  if action='calendar' then return calendar; end if;
  if action='feed' then return na04_private.class_review_feed(); end if;
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
