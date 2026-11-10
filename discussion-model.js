(function(root){
  'use strict';
  const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
  function canonicalMeetings(meetings){const result=[];for(const m of [...meetings].sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start)||a.end.localeCompare(b.end))){const last=result.at(-1);if(last&&last.day===m.day&&m.start<=last.end){if(m.end>last.end)last.end=m.end;}else result.push({day:m.day,start:m.start,end:m.end});}return result;}
  function offering(state,course,review=null){
    if(review?.offering)return review.offering;
    const t=state.timetables.find(t=>t.id===(review?.timetableId||state.activeTimetableId))||state.timetables[0];
    const meetings=state.schedules.filter(m=>m.timetableId===t.id&&m.courseId===course.id).map(({day,start,end})=>({day,start,end})).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    return {year:t.year,term:t.term,number:course.catalogNumber||'',meetings};
  }
  function context(payload){
    if(payload.course.offering)return payload.course.offering;
    const date=payload.review?.date||'',term=payload.review?.term||'';
    return {year:Number(date.slice(0,4))||new Date().getFullYear(),term:term.includes('여름')?'summer':term.includes('겨울')?'winter':term.includes('1학기')?'1':Number(date.slice(5,7))<7?'1':'2',number:'',meetings:[]};
  }
  function key(payload){const c=payload.course,o=context(payload);return JSON.stringify([norm(c.school),norm(c.title),norm(c.professor),o.year,o.term,o.meetings.length?'times:'+canonicalMeetings(o.meetings).map(m=>`${m.day}:${m.start}-${m.end}`).join(';'):o.number?'section:'+o.number:'unknown']);}
  function payload(state,c,r=null){return {course:{...c,offering:offering(state,c,r)}};}
  function groups(state,records,catalog,date,query=''){
    const map=new Map(),q=norm(query),active=state.timetables.find(t=>t.id===state.activeTimetableId),own=state.courses.filter(c=>active.courseIds.includes(c.id));
    const add=(p,local=null,entry=null)=>{const k=key(p);let room=map.get(k);if(!room){room={key:k,course:p.course,offering:context(p),local,entries:[]};map.set(k,room);}if(local)room.local=local;if(entry)room.entries.push(entry);return room;};
    for(const c of own)add(payload(state,c),c);
    for(const e of records)if(e.payload.kind==='review')add(e.payload,null,e);
    // The catalogue is only searched when the user enters a query.
    if(q)for(const c of catalog.courses){if(!norm(`${c.title} ${c.professor} ${c.number} ${c.code}`).includes(q))continue;add({course:{title:c.title,professor:c.professor,school:'한양대학교 ERICA',offering:{year:catalog.year,term:catalog.term,number:c.number,meetings:c.meetings.map(({day,start,end})=>({day,start,end}))}}});}
    const day=(new Date(date+'T12:00:00').getDay()+6)%7;
    const rooms=[...map.values()].filter(r=>q?norm(`${r.course.title} ${r.course.professor} ${r.offering.number} ${r.course.school}`).includes(q):!!r.local);
    for(const r of rooms){r.today=r.local?r.offering.meetings.filter(m=>m.day===day).sort((a,b)=>a.start.localeCompare(b.start)):[];r.entries.sort((a,b)=>a.id.localeCompare(b.id));}
    return rooms.sort((a,b)=>{if(a.today.length&&b.today.length)return a.today[0].start.localeCompare(b.today[0].start);if(a.today.length!==b.today.length)return a.today.length?-1:1;if(!!a.local!==!!b.local)return a.local?-1:1;return 0;}).slice(0,q?60:rooms.length);
  }
  const model={norm,offering,context,key,payload,groups};root.DiscussionModel=model;if(typeof module!=='undefined')module.exports=model;
})(typeof globalThis!=='undefined'?globalThis:this);
