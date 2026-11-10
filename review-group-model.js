(function(root){
  'use strict';
  function info(entry){
    const p=entry.payload,r=p.review,o=root.DiscussionModel.context(p);
    const start=root.AcademicWeek.reviewStart(r,{...p.course,offering:o});
    const week=root.AcademicWeek.number(r.date,start);
    // Unknown baselines stay date-specific, rather than merging unrelated weeks.
    return {start,week,label:root.AcademicWeek.label(r.date,start),offering:o,
      key:JSON.stringify([root.DiscussionModel.key(p),start,week===null||week===0?r.date:week])};
  }
  function groups(entries,week=''){
    const map=new Map();
    for(const entry of entries){const meta=info(entry);if(week!==''&&meta.week!==Number(week))continue;
      if(!map.has(meta.key))map.set(meta.key,{...meta,course:entry.payload.course,entries:[]});
      map.get(meta.key).entries.push(entry);
    }
    return [...map.values()];
  }
  function courses(entries,week=''){
    const map=new Map();
    for(const group of groups(entries,week)){
      const key=root.DiscussionModel.key({course:group.course});
      if(!map.has(key))map.set(key,{key,course:group.course,offering:group.offering,weeks:[],count:0});
      const course=map.get(key);course.weeks.push(group);course.count+=group.entries.length;
    }
    for(const course of map.values())course.weeks.sort((a,b)=>(b.week??-1)-(a.week??-1)||b.entries[0].payload.review.date.localeCompare(a.entries[0].payload.review.date));
    return [...map.values()];
  }
  const model={info,groups,courses};root.ReviewGroupModel=model;if(typeof module!=='undefined')module.exports=model;
})(typeof globalThis!=='undefined'?globalThis:this);
