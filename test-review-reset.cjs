const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'review-reset.js'),'utf8'),context);
const reset=context.window.NA04ReviewReset;
const old={createdAt:new Date(Date.parse(reset.cutoff)-1000).toISOString(),publicPending:true},legacy={comment:'legacy'},future={createdAt:new Date(Date.parse(reset.cutoff)+1000).toISOString(),comment:'new'};
const courses=[{id:'course'}],schedules=[{id:'meeting'}],timetables=[{id:'term'}];
const state={courses,schedules,timetables,reviews:[old,legacy,future]};const next=reset.apply(state);
assert.equal(next.reviews.length,1);assert.equal(next.reviews[0],future);assert.equal(next.courses,courses);assert.equal(next.schedules,schedules);assert.equal(next.timetables,timetables);assert.equal(state.reviews.length,3);assert.equal(reset.apply(next),next);
const stale={...next,reviews:[...next.reviews,old]};assert.equal(reset.apply(stale).reviews.length,1);
console.log('Review reset passed: old/pending removed; later reviews, courses, and timetables preserved.');
