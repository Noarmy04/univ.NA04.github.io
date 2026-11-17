(function(root){
  'use strict';
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
  const courseKey=c=>JSON.stringify([c.school,c.title,c.professor].map(s=>s.trim().normalize('NFC').toLowerCase()));
  const model={valid,validOffering,courseKey};if(typeof module!=='undefined')module.exports=model;else root.ShareModel=model;
})(typeof globalThis!=='undefined'?globalThis:this);
