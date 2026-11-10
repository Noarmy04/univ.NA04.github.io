'use strict';
if(!Array.isArray(data.schedules))data.schedules=[];
const days=['월','화','수','목','금'];
const colors=['#cb7a6d','#6cae9f','#bba258','#a2bc72','#779bd0','#cf965f','#9583bf'];
const minutes=value=>{const [h,m]=value.split(':').map(Number);return h*60+m;};
function validMeeting(meeting){return Number.isInteger(meeting.day)&&meeting.day>=0&&meeting.day<5&&/^\d{2}:\d{2}$/.test(meeting.start)&&/^\d{2}:\d{2}$/.test(meeting.end)&&minutes(meeting.start)>=480&&minutes(meeting.end)<=1320&&minutes(meeting.start)<minutes(meeting.end)&&minutes(meeting.start)%30===0&&minutes(meeting.end)%30===0;}
const timetableHost=el('div','timetable-host');$('#all-courses').before(timetableHost);
const scheduleDialog=el('dialog');scheduleDialog.id='schedule-dialog';document.body.append(scheduleDialog);let editingSchedule=null;
const tools=el('div','actions timetable-tools');tools.append(button('＋ 시간표에 수업 추가',()=>openSchedule(), 'primary'));timetableHost.before(tools);
$('#courses-page .section-heading h2').textContent='나의 주간 시간표';$('#courses-page .section-heading p').textContent='월요일부터 금요일까지, 수업 시간을 한눈에 확인하세요.';
const listTitle=el('h2','subheading','등록한 과목');$('#all-courses').before(listTitle);
function openSchedule(existing=null,day=0,start='09:00'){
  editingSchedule=existing?.id||null;headingDialog(scheduleDialog,existing?'수업 시간 수정':'시간표에 수업 추가','등록한 과목을 선택하고 요일과 수업 시간을 지정해주세요.');
  if(!data.courses.length){scheduleDialog.append(el('p','','먼저 과목을 등록한 뒤 수업 시간을 추가해주세요.'),button('＋ 과목 등록',()=>{scheduleDialog.close();openCourse();},'primary'));scheduleDialog.showModal();return;}
  const form=el('form');form.innerHTML='<label>과목<select name="courseId" required aria-label="시간표 과목"></select></label><label>요일<select name="day" aria-label="수업 요일"></select></label><div class="form-pair"><label>시작 시간<select name="start" aria-label="시작 시간"></select></label><label>종료 시간<select name="end" aria-label="종료 시간"></select></label></div><label>강의실<input name="room" maxlength="80" placeholder="예: 제2과학기술관 511강의실"></label><p class="form-help">30분 단위로 등록할 수 있어요. 같은 과목의 다른 요일은 시간을 추가해 등록하세요.</p><button class="primary full" type="submit">수업 시간 저장</button>';
  data.courses.forEach(c=>{const option=el('option','',c.title);option.value=c.id;form.elements.courseId.append(option);});days.forEach((name,i)=>{const option=el('option','',name+'요일');option.value=i;form.elements.day.append(option);});
  for(let n=480;n<=1320;n+=30){const value=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;for(const key of ['start','end']){const option=el('option','',value);option.value=value;form.elements[key].append(option);}}
  form.elements.courseId.value=existing?.courseId||data.courses[0].id;form.elements.day.value=existing?.day??day;form.elements.start.value=existing?.start||start;const ending=minutes(start)+60;form.elements.end.value=existing?.end||`${String(Math.floor(ending/60)).padStart(2,'0')}:${String(ending%60).padStart(2,'0')}`;form.elements.room.value=existing?.room||'';
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form);const meeting={id:editingSchedule||crypto.randomUUID(),courseId:f.get('courseId'),day:Number(f.get('day')),start:f.get('start'),end:f.get('end'),room:f.get('room').trim()};if(!validMeeting(meeting)){notify('08:00~22:00 사이에서 종료 시간을 시작보다 늦게 선택해주세요.');return;}if(data.schedules.some(m=>m.id!==editingSchedule&&m.day===meeting.day&&minutes(m.start)<minutes(meeting.end)&&minutes(meeting.start)<minutes(m.end))){notify('이미 등록된 수업 시간과 겹칩니다. 다른 시간을 선택해주세요.');return;}if(save({...data,schedules:editingSchedule?data.schedules.map(m=>m.id===editingSchedule?meeting:m):[...data.schedules,meeting]})){scheduleDialog.close();render();notify('시간표에 수업을 저장했어요.');}};
  scheduleDialog.append(form);if(existing)scheduleDialog.append(button('시간표에서 빼기',()=>{if(save({...data,schedules:data.schedules.filter(m=>m.id!==existing.id)})){scheduleDialog.close();render();notify('시간표에서 뺐어요. 과목과 평가 기록은 유지됩니다.');}}));scheduleDialog.showModal();
}
function renderTimetable(){
  timetableHost.replaceChildren();const schedules=data.schedules.filter(m=>validMeeting(m)&&data.courses.some(c=>c.id===m.courseId));const startHour=Math.min(9,...schedules.map(m=>Math.floor(minutes(m.start)/60)));const endHour=Math.max(18,...schedules.map(m=>Math.ceil(minutes(m.end)/60)));const rows=(endHour-startHour)*2;
  const grid=el('div','timetable');grid.setAttribute('aria-label','요일별 주간 시간표');grid.style.gridTemplateRows=`44px repeat(${rows},42px)`;
  const corner=el('div','time-head','시간');grid.append(corner);days.forEach((name,i)=>{const h=el('div','day-head',name);h.style.gridColumn=i+2;grid.append(h);});
  for(let row=0;row<rows;row++){if(row%2===0){const label=el('div','time-label',String(startHour+row/2).padStart(2,'0')+':00');label.style.gridRow=`${row+2} / span 2`;label.style.gridColumn=1;grid.append(label);}for(let day=0;day<5;day++){const cell=button('',()=>openSchedule(null,day,`${String(startHour+Math.floor(row/2)).padStart(2,'0')}:${row%2?'30':'00'}`),'time-cell');cell.setAttribute('aria-label',`${days[day]}요일 ${startHour+Math.floor(row/2)}시 ${row%2?'30분':'정각'} 수업 추가`);cell.style.gridColumn=day+2;cell.style.gridRow=row+2;grid.append(cell);}}
  schedules.forEach(m=>{const c=data.courses.find(c=>c.id===m.courseId);const block=button('',()=>openSchedule(m),'class-block');block.style.gridColumn=m.day+2;block.style.gridRow=`${(minutes(m.start)-startHour*60)/30+2} / span ${(minutes(m.end)-minutes(m.start))/30}`;block.style.background=colors[data.courses.indexOf(c)%colors.length];block.append(el('strong','',c.title),el('span','',m.room||'강의실 미등록'),el('small','',`${m.start}–${m.end}`));block.setAttribute('aria-label',`${c.title} ${days[m.day]}요일 ${m.start}부터 ${m.end} ${m.room||''} 수정`);grid.append(block);});timetableHost.append(grid);if(!schedules.length)timetableHost.after();
}
const beforeTimetableRender=render;render=function(){beforeTimetableRender();renderTimetable();};
const beforeLayoutRoute=route;route=function(){if(location.hash==='#community')history.replaceState(null,'','#today');beforeLayoutRoute();$('.hero').hidden=location.hash==='#history';};
window.removeEventListener('hashchange',beforeLayoutRoute);window.addEventListener('hashchange',route);
$('#history-order').onchange=renderHistory;
render();route();
