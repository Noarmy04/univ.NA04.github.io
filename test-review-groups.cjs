const assert=require('node:assert/strict');global.window=global;require('./academic-week.js');require('./discussion-model.js');const M=require('./review-group-model.js');
const record=(id,date='2026-11-10',start='09:00',professor='교수')=>({id,payload:{kind:'review',course:{title:'테스트 강의',professor,school:'ERICA',offering:{year:2026,term:'2',number:id,meetings:[{day:1,start,end:'11:00'}]}},review:{date,session:id,overall:4}}});
const records=[record('a'),record('b','2026-11-11'),record('c','2026-11-03'),record('d','2026-11-10','10:00'),record('e','2026-11-10','09:00','다른 교수')];
const groups=M.groups(records);assert.equal(groups.length,4);assert.equal(groups[0].entries.length,2);assert.equal(groups[0].week,11);assert.equal(M.groups(records,'10').length,1);assert.equal(M.groups(records,'12').length,0);
const custom=record('f');custom.payload.review.weekStart='2026-09-08';assert.equal(M.info(custom).week,10);assert.notEqual(M.info(custom).key,M.info(records[0]).key);
const unknown=[record('x'),record('y','2026-11-11')];unknown.forEach(x=>x.payload.course.offering.year=2027);assert.equal(M.groups(unknown).length,2);assert.equal(M.groups(unknown,'11').length,0);
console.log('Review grouping passed: same class/week merged; weeks, times, professors and custom baselines isolated; week filter and unknown dates safe.');
