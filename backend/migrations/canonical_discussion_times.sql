create or replace function na04_private.normalize_offering(o jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare y int; term text; num text; item jsonb; times jsonb:='[]'; previous jsonb; last_index int;
begin
  if jsonb_typeof(o) is distinct from 'object' then return null; end if;
  y:=(o->>'year')::int; term:=o->>'term'; num:=coalesce(o->>'number','');
  if y is null or y<2000 or y>2100 or term is null or term not in ('1','2','summer','winter') or num!~'^[A-Za-z0-9_-]{0,30}$' or jsonb_typeof(o->'meetings') is distinct from 'array' then return null; end if;
  if jsonb_array_length(o->'meetings')>28 then return null; end if;
  for item in select value from jsonb_array_elements(o->'meetings') loop
    if not coalesce((item->>'day')::int between 0 and 6 and (item->>'start')~'^([01][0-9]|2[0-3]):[0-5][05]$' and (item->>'end')~'^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$' and (item->>'start')<(item->>'end'),false) then return null; end if;
  end loop;
  for item in select m from (select distinct jsonb_build_object('day',(value->>'day')::int,'start',value->>'start','end',value->>'end') as m from jsonb_array_elements(o->'meetings')) t order by m->>'day',m->>'start',m->>'end' loop
    last_index:=jsonb_array_length(times)-1; previous:=times->last_index;
    if last_index>=0 and previous->>'day'=item->>'day' and item->>'start'<=previous->>'end' then
      times:=jsonb_set(times,array[last_index::text,'end'],to_jsonb(greatest(previous->>'end',item->>'end')));
    else times:=times||jsonb_build_array(item); end if;
  end loop;
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
    if jsonb_array_length(o->'meetings')>0 then
      select 'times:'||string_agg((value->>'day')||':'||(value->>'start')||'-'||(value->>'end'),';' order by value->>'day',value->>'start',value->>'end') into identity from jsonb_array_elements(o->'meetings');
    elsif o->>'number'<>'' then identity:='section:'||(o->>'number');
    else identity:='unknown';
    end if;
  end if;
  return md5(jsonb_build_array(lower(regexp_replace(c->>'school','[[:space:]]','','g')),lower(regexp_replace(c->>'title','[[:space:]]','','g')),lower(regexp_replace(c->>'professor','[[:space:]]','','g')),y,term,identity)::text);
end;
$$;
revoke all on function na04_private.normalize_offering(jsonb) from public,anon,authenticated;
revoke all on function na04_private.discussion_key(jsonb) from public,anon,authenticated;
