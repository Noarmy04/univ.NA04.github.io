'use strict';
// Verified undergraduate semester openings: Hanyang's 2026 academic calendar.
// https://econ.hanyang.ac.kr/sub/sub05_01.php?boardid=notice&idx=940&mNum=5&mode=view&sNum=1
window.AcademicWeek={
  defaults:{'2026-1':'2026-03-03','2026-2':'2026-09-01'},
  // Offline fallback only; the server calendar is authoritative when connected.
  terms:[{year:2026,term:'1',startsOn:'2026-03-03',endsOn:'2026-06-22'},{year:2026,term:'2',startsOn:'2026-09-01',endsOn:'2026-12-21'}],
  currentTerm(date){return this.terms.find(t=>date>=t.startsOn&&date<=t.endsOn)||null;},
  matchesTerm(t,period){return !!t&&!!period&&t.year===period.year&&t.term===period.term;},
  allowsReview(r,t,period){return this.matchesTerm(r.offering||t,period)&&r.date>=period.startsOn&&r.date<=period.endsOn;},
  evaluationTimetable(state,period){const active=state.timetables?.find(t=>t.id===state.activeTimetableId),saved=state.timetables?.find(t=>t.id===state.evaluationTimetableId);return [active,saved,...(state.timetables||[])].find(t=>this.matchesTerm(t,period))||null;},
  lastClass(offering,period){
    if(!this.matchesTerm(offering,period)||!Array.isArray(offering.meetings)||!offering.meetings.length)return '';
    const end=this.day(period.endsOn);if(end===null)return '';
    const weekday=(new Date(end*86400000).getUTCDay()+6)%7;
    const dates=offering.meetings.filter(m=>Number.isInteger(m.day)&&m.day>=0&&m.day<7).map(m=>end-(weekday-m.day+7)%7);
    return dates.length?new Date(Math.max(...dates)*86400000).toISOString().slice(0,10):'';
  },
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
