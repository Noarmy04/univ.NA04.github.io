(function(root){
  'use strict';
  const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
  function link(value){
    let u;try{u=new URL(String(value).trim());}catch{throw Error('https://everytime.kr/@... 형식의 공유 링크를 입력해주세요.');}
    if(u.protocol!=='https:'||!['everytime.kr','www.everytime.kr'].includes(u.hostname)||u.port||u.username||u.password||!/^\/@[A-Za-z0-9]{10,80}\/?$/.test(u.pathname))throw Error('에브리타임의 공개 시간표 공유 링크만 사용할 수 있어요.');
    return {identifier:u.pathname.replace(/^\/@|\/$/g,''),url:'https://everytime.kr/'+u.pathname.replace(/^\/|\/$/g,'')};
  }
  function decode(s){return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,x)=>{if(x[0]==='#'){const n=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1));if(!Number.isInteger(n)||n<1||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw Error('올바르지 않은 문자 정보입니다.');return String.fromCodePoint(n);}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x.toLowerCase()];});}
  function attrs(s){const result={};for(const m of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))result[m[1]]=decode(m[2]??m[3]);return result;}
  function value(s,tag){const m=s.match(new RegExp('<'+tag+'\\b([^>]*)\\/?'+'>','i'));return m?attrs(m[1]).value||'':'';}
  const hhmm=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function parseXml(xml){
    if(typeof xml!=='string'||xml.length>200000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('시간표 응답 형식을 확인할 수 없어요.');
    const table=xml.match(/<table\b([^>]*)>([\s\S]*?)<\/table>/i);
    if(!table){if(/<response>\s*-1\s*<\/response>/.test(xml))throw Error('존재하지 않는 공유 링크입니다.');throw Error('공개 시간표를 불러올 수 없어요. 링크와 공개 설정을 확인해주세요.');}
    const meta=attrs(table[1]);if(meta.status!=='1')throw Error('공개되지 않았거나 비어 있는 시간표입니다.');
    const year=Number(meta.year),term=({'1':'1','2':'2','여름':'summer','겨울':'winter','여름학기':'summer','겨울학기':'winter'})[meta.semester];
    if(!Number.isInteger(year)||year<2000||year>2100||!term)throw Error('시간표의 연도·학기를 확인할 수 없어요.');
    const courses=[];
    for(const m of table[2].matchAll(/<subject\b([^>]*)>([\s\S]*?)<\/subject>/gi)){
      if(courses.length>=60)throw Error('한 번에 60개 강좌까지 가져올 수 있어요.');
      const info=attrs(m[1]),body=m[2],title=value(body,'name').trim(),professor=value(body,'professor').trim(),internal=value(body,'internal'),parts=internal.match(/^(.*)-(\d+)$/);
      if(!title||title.length>60||professor.length>60)throw Error('과목명 또는 교수명을 확인해주세요.');
      const meetings=[];
      for(const time of body.matchAll(/<data\b([^>]*)\/?\s*>/gi)){
        const t=attrs(time[1]),day=Number(t.day),start=Number(t.starttime)*5,end=Number(t.endtime)*5;
        if(!Number.isInteger(day)||day<0||day>6||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>1440||start>=end||start%5||end%5||String(t.place||'').length>500)throw Error('지원하지 않는 수업 시간 정보입니다.');
        meetings.push({day,start:hhmm(start),end:hhmm(end),room:(t.place||'').trim()});
      }
      courses.push({externalId:String(info.id||''),number:parts?.[2]||'',code:parts?.[1]||'',title,professor,room:value(body,'place').slice(0,500),meetings});
    }
    if(!courses.length)throw Error('공유 시간표에 등록된 수업이 없어요.');
    return {year,term,courses};
  }
  function match(course,catalog,source){
    if(source.year!==catalog.year||source.term!==catalog.term)return {selected:'',candidates:[],reason:'다른 학기 자료 · 에타 정보로 추가'};
    const candidates=catalog.courses.filter(c=>norm(c.title)===norm(course.title)&&norm(c.professor)===norm(course.professor));
    const exact=candidates.find(c=>c.number===course.number&&(!course.code||c.code===course.code));
    return {selected:exact?.number||(candidates.length===1?candidates[0].number:''),candidates,reason:exact?'수업번호·과목·교수 일치':candidates.length===1?'과목·교수 일치':candidates.length>1?'분반을 확인해주세요':'에타 정보로 직접 추가'};
  }
  function prepare(state,source,selected,destination,id){
    if(!selected.length)throw Error('가져올 과목을 선택해주세요.');
    const current=state.timetables.find(t=>t.id===state.activeTimetableId);
    if(destination==='current'&&(current.year!==source.year||current.term!==source.term))throw Error('학기가 다릅니다. 새 시간표로 가져오기를 선택해주세요.');
    let name='에타 시간표',n=2;while(state.timetables.some(t=>t.year===source.year&&t.term===source.term&&t.name===name))name='에타 시간표 '+n++;
    let target=destination==='current'?{...current,courseIds:[...current.courseIds]}:{id:id(),year:source.year,term:source.term,name,courseIds:[]};
    const courses=[...state.courses],schedules=[...state.schedules];let skipped=0,added=0;
    for(const row of selected){
      const c=row.source,matched=row.catalog;
      let course=courses.find(v=>matched?v.catalogNumber===matched.number&&norm(v.title)===norm(matched.title)&&norm(v.professor)===norm(matched.professor):norm(v.title)===norm(c.title)&&norm(v.professor)===norm(c.professor)&&v.school==='한양대학교 ERICA');
      if(course&&target.courseIds.includes(course.id)){skipped++;continue;}
      if(!course){course={id:id(),title:matched?.title||c.title,professor:matched?.professor||c.professor||'담당교수 미정',school:'한양대학교 ERICA',department:matched?.category||'',description:[matched?.mode,matched?.notes].filter(Boolean).join(' · '),exams:'',room:c.room,catalogNumber:matched?.number||''};courses.push(course);}
      for(const m of c.meetings){
        if(schedules.some(v=>v.timetableId===target.id&&v.day===m.day&&v.start<m.end&&m.start<v.end))throw Error(`${c.title}: 다른 수업과 시간이 겹칩니다. 선택 과목을 확인해주세요.`);
        schedules.push({...m,id:id(),courseId:course.id,timetableId:target.id});
      }
      target.courseIds.push(course.id);added++;
    }
    if(!added)throw Error('선택한 과목이 이미 이 시간표에 모두 있어요.');
    const timetables=destination==='current'?state.timetables.map(t=>t.id===target.id?target:t):[...state.timetables,target];
    return {state:{...state,courses,schedules,timetables,activeTimetableId:target.id},added,skipped};
  }
  const model={link,parseXml,match,prepare};root.EverytimeModel=model;if(typeof module!=='undefined')module.exports=model;
})(typeof globalThis!=='undefined'?globalThis:this);
