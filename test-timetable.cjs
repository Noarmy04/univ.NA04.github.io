const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},crypto:require('node:crypto').webcrypto};vm.createContext(context);
for(const f of ['term-model.js','catalog.js',...fs.readdirSync(require('node:path').join(__dirname,'catalog')).sort().map(f=>'catalog/'+f)])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,f),'utf8'),context);
const model=context.window.TimetableModel,catalog=context.window.NA04_CATALOG;
const state={courses:[{id:'a'},{id:'b'}],reviews:[{courseId:'b',comment:'keep'}],schedules:[{id:'m',courseId:'a',day:1,start:'13:00',end:'14:30',room:'511'}]};
model.migrate(state,2026,'2');const first=state.activeTimetableId;
assert.equal(model.courses(state).length,1);assert.equal(model.courses(state)[0].id,'a');assert.equal(state.courses.length,2);assert.equal(state.reviews[0].comment,'keep');assert.equal(state.reviews[0].timetableId,first);assert.equal(model.meetings(state).length,1);
state.timetables.push({id:'summer',year:2026,term:'summer',name:'B',courseIds:['b']});state.activeTimetableId='summer';assert.equal(model.courses(state)[0].id,'b');assert.equal(model.meetings(state).length,0);model.migrate(state,2027,'1');assert.equal(state.timetables.length,2);assert.equal(state.reviews[0].timetableId,first);
state.activeTimetableId=first;assert.equal(model.meetings(state).length,1);
assert.equal(model.overlaps({day:1,start:'13:00',end:'14:30'},{day:1,start:'14:30',end:'16:00'}),false);assert.equal(model.overlaps({day:1,start:'13:00',end:'14:30'},{day:1,start:'14:00',end:'16:00'}),true);
assert.equal(catalog.courses.length,2156);assert.equal(new Set(catalog.courses.map(c=>c.number)).size,2156);
const hci=catalog.courses.find(c=>c.number==='24096');assert.equal(hci.professor,'고민삼');assert.equal(hci.meetings.length,2);assert.ok(hci.room.includes('511'));
let internalConflicts=0;for(const c of catalog.courses){assert.ok(c.title);const meetings=model.mergeMeetings(c.meetings);for(let i=0;i<meetings.length;i++)for(let j=i+1;j<meetings.length;j++)if(model.overlaps(meetings[i],meetings[j]))internalConflicts++;}
console.log(JSON.stringify({checks:'passed',courses:catalog.courses.length,internalConflicts}));
