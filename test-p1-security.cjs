const assert=require('node:assert/strict');global.window=global;global.ShareModel=require('./share-model.js');require('./academic-week.js');const D=require('./discussion-model.js'),G=require('./review-group-model.js');
const p={schema:'univ-na04/v2',kind:'review',course:{title:'강의',professor:'교수',school:'ERICA'},review:{date:'2026-11-10',term:'2026년 2학기',weekStart:'2026-09-01',session:'기본',comment:'정상 평가',overall:4,understanding:4,delivery:4,structure:4}};
assert(ShareModel.valid(p));
const bad=[];for(const term of [{bad:true},[],null,7]){const x=structuredClone(p);x.review.term=term;bad.push(x);}
for(const [field,value] of [['weekStart',{}],['date','2026-02-30'],['overall','4'],['session',[]]]){const x=structuredClone(p);x.review[field]=value;bad.push(x);}
const malformed=structuredClone(p);malformed.course.offering={year:2026,term:'2',meetings:null};bad.push(malformed);
for(const x of bad)assert.equal(ShareModel.valid(x),false);
const records=[null,{payload:null},...bad.map((payload,i)=>({id:'bad-'+i,payload})),{id:'good',payload:p}];
assert.equal(G.courses(records).length,1);assert.equal(G.courses(records)[0].count,1);
const state={courses:[],reviews:[],schedules:[],activeTimetableId:'t',timetables:[{id:'t',year:2026,term:'2',courseIds:[]}]};
const rooms=D.groups(state,records,{courses:[]},'2026-11-10','강의');assert.equal(rooms.length,1);assert.equal(rooms[0].entries.length,1);
assert.doesNotThrow(()=>D.context(bad[0]));
const html=structuredClone(p);html.review.comment='<img src=x onerror=alert(1)>';assert.equal(ShareModel.valid(html),true); // Text remains data, rendered through textContent.
console.log('P1 frontend checks passed: typed metadata, malformed offerings, corrupt-row isolation and valid legacy reviews.');
