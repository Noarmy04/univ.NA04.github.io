'use strict';
// Verified undergraduate semester openings: Hanyang's 2026 academic calendar.
// https://econ.hanyang.ac.kr/sub/sub05_01.php?boardid=notice&idx=940&mNum=5&mode=view&sNum=1
window.AcademicWeek={
  defaults:{'2026-1':'2026-03-03','2026-2':'2026-09-01'},
  day(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const n=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:null;
  },
  start(t){return t?.weekStart!==undefined?t.weekStart:(this.defaults[`${t?.year}-${t?.term}`]||'');},
  number(date,start){const d=this.day(date),s=this.day(start);return d===null||s===null?null:d<s?0:Math.floor((d-s)/7)+1;},
  label(date,start){const n=this.number(date,start);return n===null?'주차 기준일 미설정':n===0?'개강 전':`${n}주차`;},
  reviewStart(r,c,state){
    if(Object.prototype.hasOwnProperty.call(r,'weekStart'))return r.weekStart;
    const t=state?.timetables?.find(t=>t.id===r.timetableId);
    return this.start(t||c?.offering||r.offering);
  }
};
