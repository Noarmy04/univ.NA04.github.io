(function(root){
  'use strict';
  const repo='Noarmy04/univ.NA04.github.io';
  const text=(v,max)=>typeof v==='string'&&v.length<=max;
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const optionalText=(v,max)=>v===undefined||text(v,max);
  const date=v=>text(v,10)&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  function validOffering(o){return object(o)&&Number.isInteger(o.year)&&o.year>=2000&&o.year<=2100&&['1','2','summer','winter'].includes(o.term)&&text(o.number??'',30)&&/^[A-Za-z0-9_-]*$/.test(o.number??'')&&Array.isArray(o.meetings)&&o.meetings.length<=28&&o.meetings.every(m=>object(m)&&Number.isInteger(m.day)&&m.day>=0&&m.day<=6&&/^([01][0-9]|2[0-3]):[0-5][05]$/.test(m.start)&&/^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$/.test(m.end)&&typeof m.start==='string'&&typeof m.end==='string'&&m.start<m.end);}
  function valid(p){
    if(!object(p)||p.schema!=='univ-na04/v2'||!['course','review'].includes(p.kind))return false;
    const c=p.course;
    if(!object(c)||!['title','professor','school'].every(k=>text(c[k],60)&&c[k].trim())||!['department','description','exams'].every(k=>optionalText(c[k],600))||(c.offering!==undefined&&!validOffering(c.offering)))return false;
    if(p.kind==='course')return true;
    const r=p.review;
    return object(r)&&date(r.date)&&optionalText(r.term,120)&&(r.weekStart===undefined||r.weekStart===''||date(r.weekStart))&&text(r.session,60)&&!!r.session.trim()&&text(r.comment,500)&&['overall','understanding','delivery','structure'].every(k=>Number.isInteger(r[k])&&r[k]>=1&&r[k]<=5);
  }
  function parse(issue){
    if(issue.pull_request||issue.state!=='open'||typeof issue.body!=='string'||issue.body.length>15000)return null;
    const m=issue.body.match(/<!-- univ-na04:v2 -->\s*```json\r?\n([\s\S]*?)\r?\n```/);
    try{const payload=JSON.parse(m?.[1]||'');if(!valid(payload))return null;return {payload,number:issue.number,author:issue.user?.login||'학생',updatedAt:issue.updated_at,url:`https://github.com/${repo}/issues/${Number(issue.number)}`};}catch{return null;}
  }
  const courseKey=c=>JSON.stringify([c.school,c.title,c.professor].map(s=>s.trim().normalize('NFC').toLowerCase()));
  function draft(payload){if(!valid(payload))throw Error('공유할 내용을 확인해주세요.');const body=`수업 경험과 정보를 학생들과 공유합니다.\n\n학교: ${payload.course.school}\n과목: ${payload.course.title}\n교수님: ${payload.course.professor}\n${payload.kind==='review'?`수업 날짜: ${payload.review.date} / 세션: ${payload.review.session}`:'수업 방식과 시험 정보'}\n\n아래 데이터는 사이트의 공유 화면에 표시됩니다. 수정할 때 형식을 유지해주세요.\n\n<!-- univ-na04:v2 -->\n\`\`\`json\n${JSON.stringify(payload,null,2)}\n\`\`\`\n`;
    return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(`[${payload.kind==='review'?'수업 평가':'과목 정보'}] ${payload.course.title}${payload.review?' · '+payload.review.date+' · '+payload.review.session:''}`)}&body=${encodeURIComponent(body)}`;
  }
  const model={repo,valid,validOffering,parse,courseKey,draft};if(typeof module!=='undefined')module.exports=model;else root.ShareModel=model;
})(typeof globalThis!=='undefined'?globalThis:this);
