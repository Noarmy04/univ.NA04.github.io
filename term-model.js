'use strict';
window.TimetableModel={
  terms:{'1':'1학기',summer:'여름학기','2':'2학기',winter:'겨울학기'},
  migrate(state,year,term){
    if(Array.isArray(state.timetables)&&state.timetables.length){
      if(!state.timetables.some(t=>t.id===state.activeTimetableId))state.activeTimetableId=state.timetables[0].id;
      return state;
    }
    const id=crypto.randomUUID();
    state.timetables=[{id,year,term,name:'기본 시간표',courseIds:[...new Set((state.schedules||[]).map(m=>m.courseId))]}];
    state.activeTimetableId=id;
    state.schedules=(state.schedules||[]).map(m=>({...m,timetableId:id}));
    state.reviews=state.reviews.map(r=>({...r,timetableId:id}));
    return state;
  },
  active(state){return state.timetables.find(t=>t.id===state.activeTimetableId)||state.timetables[0];},
  courses(state){const t=this.active(state);return state.courses.filter(c=>t.courseIds.includes(c.id));},
  meetings(state){return state.schedules.filter(m=>m.timetableId===state.activeTimetableId);},
  meetingsOn(state,date){
    const value=new Date(date+'T12:00:00');if(Number.isNaN(value.getTime()))return [];
    const day=(value.getDay()+6)%7;
    return this.meetings(state).filter(m=>m.day===day).sort((a,b)=>a.start.localeCompare(b.start));
  },
  evaluationCourses(state,date){
    const starts=new Map();for(const m of this.meetingsOn(state,date))if(!starts.has(m.courseId))starts.set(m.courseId,m.start);
    return this.courses(state).sort((a,b)=>{
      const x=starts.get(a.id),y=starts.get(b.id);
      if(x&&y)return x.localeCompare(y);
      return x?-1:y?1:0;
    });
  },
  overlaps(a,b){return a.day===b.day&&a.start<b.end&&b.start<a.end;},
  mergeMeetings(meetings){
    const result=[];
    for(const m of [...meetings].sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start))){
      const last=result.at(-1);
      if(last&&last.day===m.day&&last.room===m.room&&last.end>=m.start){if(m.end>last.end)last.end=m.end;}
      else result.push({...m});
    }
    return result;
  }
};
