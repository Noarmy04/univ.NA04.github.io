'use strict';
const terms=TimetableModel.terms;
TimetableModel.migrate(data,new Date().getFullYear(),new Date().getMonth()<6?'1':'2');if(!storageFailed)save(data);
const days=['월','화','수','목','금','토','일'];
const colors=['#b66558','#438876','#a18333','#708e42','#527eb8','#b77940','#7c66a8'];
const minutes=v=>{const [h,m]=v.split(':').map(Number);return h*60+m;};
function validMeeting(m){return Number.isInteger(m.day)&&m.day>=0&&m.day<7&&/^\d{2}:\d{2}$/.test(m.start)&&/^\d{2}:\d{2}$/.test(m.end)&&minutes(m.start)>=0&&minutes(m.end)<=1440&&minutes(m.start)<minutes(m.end)&&minutes(m.start)%5===0&&minutes(m.end)%5===0;}
function activeTimetable(){return TimetableModel.active(data);}
function timetableLabel(t=activeTimetable()){return `${t.year}년 ${terms[t.term]} · ${t.name}`;}
function getScheduleCourses(){return TimetableModel.courses(data);}
function evaluationTimetable(){return AcademicWeek.evaluationTimetable(data,currentEvaluationTerm());}
function evaluationState(){const t=evaluationTimetable();return t?{...data,activeTimetableId:t.id}:null;}
function getEvaluationCourses(){const state=evaluationState();return state?TimetableModel.evaluationCourses(state,selectedDate()):[];}
function openTodayReview(id){const t=evaluationTimetable();if(!t){notify(evaluationProblem());return;}if(data.activeTimetableId!==t.id)changeVersion(t.id);openReview(id);}
function openTodayCourse(){const period=currentEvaluationTerm();if(!period){notify('현재 평가 가능한 학기 정보가 없습니다.');return;}let t=evaluationTimetable();if(!t){t={id:crypto.randomUUID(),year:period.year,term:period.term,name:'기본 시간표',courseIds:[]};if(!save({...data,timetables:[...data.timetables,t]}))return;}changeVersion(t.id);openCatalog();}
function canReviewCourse(id){return getScheduleCourses().some(c=>c.id===id);}
const timetableHost=el('div','timetable-host');$('#all-courses').before(timetableHost);
const scheduleDialog=el('dialog');scheduleDialog.id='schedule-dialog';document.body.append(scheduleDialog);
const versionDialog=el('dialog');document.body.append(versionDialog);
const catalogDialog=el('dialog','wide-dialog');catalogDialog.id='catalog-dialog';document.body.append(catalogDialog);
const tools=el('div','actions timetable-tools'),versionSelect=el('select'),versionField=el('label','version-field','시간표 버전');versionSelect.setAttribute('aria-label','내 시간표 선택');versionField.append(versionSelect);tools.append(versionField,button('＋ 새 시간표',()=>openVersion()),button('버전 정보 수정',()=>openVersion(activeTimetable())));timetableHost.before(tools);
const todayVersion=el('div','active-version');$('#today-page .filter-row').before(todayVersion);
const courseListTitle=el('h2','subheading','이 시간표의 과목');$('#all-courses').before(courseListTitle);
$('#courses-page .section-heading p').textContent='학기와 버전을 선택하고 수업을 구성하세요. 이 시간표의 과목만 평가할 수 있어요.';
function changeVersion(id){const t=data.timetables.find(t=>t.id===id),evaluationTimetableId=AcademicWeek.matchesTerm(t,currentEvaluationTerm())?id:data.evaluationTimetableId;if(save({...data,activeTimetableId:id,evaluationTimetableId})){render();route();}}
versionSelect.onchange=()=>changeVersion(versionSelect.value);
function openVersion(existing=null){
  headingDialog(versionDialog,existing?'시간표 정보 수정':'새 학기·버전 만들기','시간표마다 과목과 수업 시간이 따로 저장됩니다.');
  const f=el('form');f.innerHTML='<div class="form-pair"><label>연도<input name="year" type="number" min="2000" max="2100" required></label><label>학기<select name="term"><option value="1">1학기</option><option value="summer">여름학기</option><option value="2">2학기</option><option value="winter">겨울학기</option></select></label></div><label>버전 이름<input name="name" maxlength="40" required placeholder="예: 기본 시간표 / 대안 시간표"></label><label>주차 기준일 (개강일)<input name="weekStart" type="date"></label><p class="form-help">기준일부터 7일씩 1주차, 2주차로 계산합니다. 휴일도 포함합니다. 2026년 정규학기는 공식 개강일을 기본 적용하며, 다른 학기는 직접 설정해주세요.</p><p class="form-help">같은 학기에도 여러 시간표를 만들 수 있어요. 새 시간표는 비어 있는 상태로 시작합니다.</p><button class="primary full" type="submit">시간표 저장</button>';
  f.elements.year.value=existing?.year||activeTimetable().year;f.elements.term.value=existing?.term||activeTimetable().term;f.elements.name.value=existing?.name||'';f.elements.weekStart.value=AcademicWeek.start(existing||activeTimetable());const resetWeek=()=>{f.elements.weekStart.value=AcademicWeek.start({weekStart:f.elements.weekStart.value,year:Number(f.elements.year.value),term:f.elements.term.value});};f.elements.year.onchange=resetWeek;f.elements.term.onchange=resetWeek;
  f.onsubmit=e=>{e.preventDefault();const t={...(existing||{id:crypto.randomUUID(),courseIds:[]}),year:Number(f.elements.year.value),term:f.elements.term.value,name:f.elements.name.value.trim()};if(!t.name||!terms[t.term]||t.year<2000||t.year>2100)return;if(data.timetables.some(v=>v.id!==t.id&&v.year===t.year&&v.term===t.term&&v.name===t.name)){notify('같은 학기에 같은 버전 이름이 있어요.');return;}if(save({...data,timetables:existing?data.timetables.map(v=>v.id===t.id?t:v):[...data.timetables,t],activeTimetableId:t.id})){versionDialog.close();render();route();}};
  versionDialog.append(f);versionDialog.showModal();
}
let catalogRatingsTimer;
function catalogRatingCourse(c){
  return {school:'한양대학교 ERICA',title:c.title,professor:c.professor||'담당교수 미정',offering:{year:NA04_CATALOG.year,term:NA04_CATALOG.term,number:c.number,meetings:c.meetings.map(({day,start,end})=>({day,start,end}))}};
}
function loadCatalogRatings(courses,targets){
  clearTimeout(catalogRatingsTimer);
  catalogRatingsTimer=setTimeout(async()=>{
    if(!catalogDialog.open||!targets.some(t=>t.isConnected))return;
    const show=(text,kind='')=>targets.forEach(t=>{if(t.isConnected){t.textContent=text;t.dataset.state=kind;}});
    if(!window.NA04LoadCourseRatings){show('평점 조회 서버가 연결되지 않았어요.','unavailable');return;}
    try{
      const result=await window.NA04LoadCourseRatings(courses.map(catalogRatingCourse));
      if(!Array.isArray(result?.ratings)||result.ratings.length!==targets.length)throw Error('평점 응답 형식');
      for(const r of result.ratings)if(!Number.isSafeInteger(r.count)||r.count<0||(r.count>0&&(!Number.isFinite(r.average)||r.average<1||r.average>5)))throw Error('평점 응답 형식');
      result.ratings.forEach((r,i)=>{if(targets[i].isConnected){targets[i].replaceChildren(el('strong','',r.count?`★ ${r.average.toFixed(1)} / 5 · 최종평가 ${r.count}개`:'아직 등록된 최종평가가 없어요.'));if(r.count){const comments=el('ul','final-comments');for(const comment of (Array.isArray(r.comments)?r.comments:[]).filter(c=>typeof c==='string').slice(0,Number(targets[i].dataset.limit)||2))comments.append(el('li','',comment));targets[i].append(comments);}targets[i].dataset.state=r.count?'rated':'empty';}});
    }catch{show('평점을 불러오지 못했어요. 강좌를 다시 선택해주세요.','error');}
  },200);
}
function ratingBadge(){const badge=el('div','catalog-rating','최종평점 확인 중…');badge.setAttribute('role','status');return badge;}
function openCatalog(query=''){
  headingDialog(catalogDialog,'시간표에 과목 추가',timetableLabel());
  catalogDialog.append(el('p','catalog-source',`자료: ERICA ${NA04_CATALOG.year}년 ${terms[NA04_CATALOG.term]} · ${NA04_CATALOG.courses.length.toLocaleString()}개 강좌. 다른 학기의 개설·시간 정보는 공식 수강편람을 확인해주세요.`));
  const search=el('input');search.type='search';search.placeholder='과목명, 교수명, 수업번호, 강의실 검색';search.setAttribute('aria-label','개설 강좌 검색');search.value=query;catalogDialog.append(search);
  const status=el('p','form-help'),list=el('div','catalog-results');catalogDialog.append(button('이전에 등록한 과목에서 선택',openSavedCourses),status,list,button('목록에 없는 과목 직접 등록',()=>{catalogDialog.close();openManualCourse();}));
  function results(){list.replaceChildren();const ratingTargets=[],q=search.value.trim().toLowerCase(),matches=NA04_CATALOG.courses.filter(c=>`${c.title} ${c.professor} ${c.number} ${c.code} ${c.room}`.toLowerCase().includes(q));status.textContent=`검색 결과 ${matches.length.toLocaleString()}개${matches.length>60?' · 처음 60개 표시, 검색어를 더 입력해주세요.':''}`;for(const c of matches.slice(0,60)){const card=el('article','catalog-card');card.append(el('strong','',c.title),el('p','',`${c.professor||'담당교수 미정'} · ${c.code} · 수업번호 ${c.number} · ${c.credits}학점`),el('p','',c.time||'시간 미지정'),el('p','',c.room||'강의실 미지정'));const rating=ratingBadge();card.append(rating);ratingTargets.push(rating);const exists=getScheduleCourses().some(v=>v.catalogNumber===c.number),b=button(exists?'추가됨':'이 강좌 선택',()=>catalogPreview(c));b.disabled=exists;card.append(b,button('최종평가 보기',()=>catalogPreview(c)));list.append(card);}if(matches.length)loadCatalogRatings(matches.slice(0,60),ratingTargets);if(!matches.length)list.append(el('p','','검색된 강좌가 없어요. 다른 검색어나 직접 등록을 이용해주세요.'));}
  search.oninput=results;results();catalogDialog.showModal();
}
function openSavedCourses(){
  headingDialog(catalogDialog,'이전에 등록한 과목',timetableLabel());
  const courses=data.courses.filter(c=>!canReviewCourse(c.id));
  if(!courses.length)catalogDialog.append(el('p','','추가할 이전 과목이 없어요.'));
  for(const c of courses){const card=el('article','catalog-card');card.append(el('strong','',c.title),el('p','',`${c.professor} 교수님 · ${c.school}`),button('이 시간표에 추가',()=>{const t=activeTimetable();if(save({...data,timetables:data.timetables.map(v=>v.id===t.id?{...v,courseIds:[...v.courseIds,c.id]}:v)})){catalogDialog.close();render();openSchedule(null,0,'09:00',c.id);}}));catalogDialog.append(card);}
  catalogDialog.append(button('개설 강좌에서 찾기',()=>openCatalog()));
}
function catalogPreview(c){
  headingDialog(catalogDialog,c.title,`${c.professor||'담당교수 미정'} · 수업번호 ${c.number}`);catalogDialog.append(el('p','catalog-source',`원본 자료: ERICA 2026년 2학기 · 추가할 시간표: ${timetableLabel()}`));
  const rating=ratingBadge();rating.dataset.limit='10';catalogDialog.append(rating,el('p','form-help',`${NA04_CATALOG.year}년 ${terms[NA04_CATALOG.term]} · 같은 분반의 최종평가 평균입니다. 한줄평은 최근 10개까지 표시하며 일일 평가는 포함하지 않습니다.`));loadCatalogRatings([c],[rating]);
  const meetings=TimetableModel.mergeMeetings(c.meetings.filter(validMeeting)),conflicts=meetings.filter(m=>TimetableModel.meetings(data).some(v=>TimetableModel.overlaps(m,v)));
  for(const m of meetings)catalogDialog.append(el('p','',`${days[m.day]} ${m.start}–${m.end} · ${m.room||'강의실 미지정'}`));
  if(!meetings.length)catalogDialog.append(el('p','chat-warning','원본에 정해진 시간이 없습니다. 과목을 추가한 뒤 수업 시간을 직접 등록해주세요.'));
  if(conflicts.length)catalogDialog.append(el('p','chat-warning','기존 시간표와 시간이 겹칩니다. 기존 수업 시간을 조정하거나 다른 분반을 선택해주세요.'));
  if(c.meetings.length!==c.meetings.filter(validMeeting).length)catalogDialog.append(el('p','chat-warning','일부 원본 시간이 5분 단위 형식에 맞지 않습니다. 추가 후 수업 시간을 확인해주세요.'));
  catalogDialog.append(el('p','',c.room||'강의실 미지정'));
  const add=button(meetings.length?'과목과 수업 시간 추가':'과목 추가 후 시간 입력',()=>{
    const existing=data.courses.find(v=>v.catalogNumber===c.number)||data.courses.find(v=>!v.catalogNumber&&v.title===c.title&&v.professor===c.professor&&v.school==='한양대학교 ERICA');
    const course={...(existing||{}),id:existing?.id||crypto.randomUUID(),catalogNumber:c.number,title:c.title,professor:c.professor||'담당교수 미정',school:'한양대학교 ERICA',department:c.category,description:existing?.description||[c.mode,c.notes].filter(Boolean).join(' · '),exams:existing?.exams||'',room:c.room};
    const t=activeTimetable();if(t.courseIds.includes(course.id)){notify('이미 시간표에 있는 과목이에요.');return;}
    if(save({...data,courses:existing?data.courses.map(v=>v.id===course.id?course:v):[...data.courses,course],timetables:data.timetables.map(v=>v.id===t.id?{...v,courseIds:[...v.courseIds,course.id]}:v),schedules:[...data.schedules,...meetings.map(m=>({...m,id:crypto.randomUUID(),courseId:course.id,timetableId:t.id}))]})){catalogDialog.close();render();if(!meetings.length)openSchedule(null,0,'09:00',course.id);else notify('과목과 강의실·수업 시간을 추가했어요.');}
  },'primary');add.disabled=conflicts.length>0;catalogDialog.append(add,button('다른 강좌 찾기',()=>openCatalog(c.title)));
}
const courseSubmit=$('#course-form').onsubmit;
$('#course-form').onsubmit=e=>{const wasEdit=editingCourseId,before=data;courseSubmit(e);if(data===before||wasEdit)return;const c=data.courses.at(-1),t=activeTimetable();if(save({...data,timetables:data.timetables.map(v=>v.id===t.id?{...v,courseIds:[...v.courseIds,c.id]}:v)})){render();openSchedule(null,0,'09:00',c.id);}};
function openSchedule(existing=null,day=0,start='09:00',preferredId=null){
  headingDialog(scheduleDialog,existing?'수업 시간 수정':'수업 시간 추가',timetableLabel());const courses=getScheduleCourses();
  if(!courses.length){scheduleDialog.append(button('개설 강좌에서 과목 찾기',()=>{scheduleDialog.close();openCatalog();},'primary'));scheduleDialog.showModal();return;}
  const form=el('form');form.innerHTML='<label>과목<select name="courseId" required aria-label="시간표 과목"></select></label><label>요일<select name="day" aria-label="수업 요일"></select></label><div class="form-pair"><label>시작 시간<select name="start" aria-label="시작 시간"></select></label><label>종료 시간<select name="end" aria-label="종료 시간"></select></label></div><label>강의실<input name="room" maxlength="500" placeholder="건물과 강의실"></label><p class="form-help">5분 단위로 등록합니다. 다른 요일의 수업 시간도 추가할 수 있어요.</p><button class="primary full" type="submit">수업 시간 저장</button>';
  courses.forEach(c=>{const o=el('option','',`${c.title} · ${c.professor}`);o.value=c.id;form.elements.courseId.append(o);});days.forEach((d,i)=>{const o=el('option','',d+'요일');o.value=i;form.elements.day.append(o);});
  for(let n=0;n<=1440;n+=5){const v=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;for(const key of ['start','end']){const o=el('option','',v);o.value=v;form.elements[key].append(o);}}
  form.elements.courseId.value=existing?.courseId||preferredId||courses[0].id;form.elements.day.value=existing?.day??day;form.elements.start.value=existing?.start||start;const ending=Math.min(1440,minutes(start)+60);form.elements.end.value=existing?.end||`${String(Math.floor(ending/60)).padStart(2,'0')}:${String(ending%60).padStart(2,'0')}`;const defaultRoom=()=>data.courses.find(c=>c.id===form.elements.courseId.value)?.room||'';form.elements.room.value=existing?.room||defaultRoom();form.elements.courseId.onchange=()=>form.elements.room.value=defaultRoom();
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),m={id:existing?.id||crypto.randomUUID(),timetableId:activeTimetable().id,courseId:f.get('courseId'),day:Number(f.get('day')),start:f.get('start'),end:f.get('end'),room:f.get('room').trim()};if(!validMeeting(m)||!canReviewCourse(m.courseId)){notify('수업 시간과 과목을 확인해주세요.');return;}if(TimetableModel.meetings(data).some(v=>v.id!==m.id&&TimetableModel.overlaps(v,m))){notify('이미 등록된 수업 시간과 겹칩니다.');return;}if(save({...data,schedules:existing?data.schedules.map(v=>v.id===m.id?m:v):[...data.schedules,m]})){scheduleDialog.close();render();}};
  scheduleDialog.append(form);if(existing)scheduleDialog.append(button('이 수업 시간만 삭제',()=>{if(save({...data,schedules:data.schedules.filter(v=>v.id!==existing.id)})){scheduleDialog.close();render();}}));scheduleDialog.showModal();
}
const priorityStatus=el('p','course-priority-status');priorityStatus.id='course-priority-status';priorityStatus.setAttribute('role','status');$('#course-list').before(priorityStatus);
function decorateTimetableCourses(container,courses,query='',all=false){
  if(!all){
    const visible=courses.filter(c=>`${c.title} ${c.professor} ${c.school}`.toLowerCase().includes(query.toLowerCase())),meetings=evaluationState()?TimetableModel.meetingsOn(evaluationState(),selectedDate()):[];let count=0;
    container.querySelectorAll('.course-card').forEach((card,i)=>{const c=visible[i],times=meetings.filter(m=>m.courseId===c.id);if(!times.length)return;count++;card.classList.add('scheduled-course');card.querySelector('.card-top').after(el('p','scheduled-date',`오늘 수업 · ${times.map(m=>`${m.start}–${m.end}`).join(', ')}`));});
    const date=new Date(selectedDate()+'T12:00:00').toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    priorityStatus.textContent=count?`${date} 수업 ${count}개를 시작 시간순으로 먼저 보여드려요.`:courses.length?(query?'검색 결과에 오늘 수업이 없어요.':'오늘 예정된 수업이 없어요. 현재 학기의 다른 과목도 평가할 수 있어요.'):'';
  }
  if(!courses.length){container.replaceChildren();empty(container,all?'이 시간표에 과목이 없어요':'현재 학기 시간표에 과목이 없어요',all?'개설 강좌에서 과목을 선택해 시간표를 구성해주세요.':'내 시간표에서 현재 학기 시간표를 만들어주세요.',true);}
  if(all)container.querySelectorAll('.course-card').forEach((card,i)=>{const c=courses[i],locations=TimetableModel.meetings(data).filter(m=>m.courseId===c.id);card.append(el('p','course-summary',locations.length?locations.map(m=>`${days[m.day]} ${m.start}–${m.end} · ${m.room||'강의실 미지정'}`).join('\n'):'수업 시간 미등록'),button('＋ 수업 시간 추가',()=>openSchedule(null,0,'09:00',c.id)),button('시간표에서 과목 빼기',()=>{const t=activeTimetable();if(save({...data,timetables:data.timetables.map(v=>v.id===t.id?{...v,courseIds:v.courseIds.filter(id=>id!==c.id)}:v),schedules:data.schedules.filter(m=>m.timetableId!==t.id||m.courseId!==c.id)})){render();notify('시간표에서 뺐어요. 평가 기록은 보관됩니다.');}}));});
};
function renderTimetable(){
  timetableHost.replaceChildren();const schedules=TimetableModel.meetings(data).filter(m=>validMeeting(m)&&canReviewCourse(m.courseId));const startHour=Math.min(9,...schedules.map(m=>Math.floor(minutes(m.start)/60))),endHour=Math.max(18,...schedules.map(m=>Math.ceil(minutes(m.end)/60))),rows=(endHour-startHour)*12,dayCount=Math.max(5,...schedules.map(m=>m.day+1));
  const grid=el('div','timetable');grid.setAttribute('aria-label',`${timetableLabel()} 주간 시간표`);grid.style.gridTemplateRows=`32px repeat(${rows},minmax(0,1fr))`;grid.style.gridTemplateColumns=`42px repeat(${dayCount},minmax(0,1fr))`;grid.style.minWidth='0';grid.append(el('div','time-head','시간'));days.slice(0,dayCount).forEach((d,i)=>{const h=el('div','day-head',d);h.style.gridColumn=i+2;grid.append(h);});
  for(let row=0;row<rows;row+=6){if(row%12===0){const label=el('div','time-label',String(startHour+row/12).padStart(2,'0')+':00');label.style.gridRow=`${row+2} / span 12`;label.style.gridColumn=1;grid.append(label);}for(let day=0;day<dayCount;day++){const start=`${String(startHour+Math.floor(row/12)).padStart(2,'0')}:${row%12?'30':'00'}`,cell=button('',()=>openSchedule(null,day,start),'time-cell');cell.setAttribute('aria-label',`${days[day]}요일 ${start} 수업 시간 추가`);cell.style.gridColumn=day+2;cell.style.gridRow=`${row+2} / span 6`;grid.append(cell);}}
  schedules.forEach(m=>{const c=data.courses.find(c=>c.id===m.courseId),block=button('',()=>openSchedule(m),'class-block');block.style.gridColumn=m.day+2;block.style.gridRow=`${(minutes(m.start)-startHour*60)/5+2} / span ${(minutes(m.end)-minutes(m.start))/5}`;block.style.background=colors[getScheduleCourses().indexOf(c)%colors.length];block.append(el('strong','',c.title),el('small','',`${c.professor} 교수님`),el('span','',m.room||'강의실 미등록'),el('small','',`${m.start}–${m.end}`));block.title=`${c.title} · ${c.professor} 교수님 · ${m.room||'강의실 미등록'} · ${m.start}–${m.end}`;block.classList.toggle('short-class',minutes(m.end)-minutes(m.start)<=60);block.setAttribute('aria-label',`${c.title} ${days[m.day]}요일 ${m.start}부터 ${m.end} ${m.room||''} 수정`);grid.append(block);});timetableHost.append(grid);courseListTitle.hidden=!getScheduleCourses().length;$('#all-courses').hidden=!getScheduleCourses().length;
  versionSelect.replaceChildren();for(const t of data.timetables){const o=el('option','',timetableLabel(t));o.value=t.id;versionSelect.append(o);}versionSelect.value=data.activeTimetableId;$('#courses-page .section-heading h2').textContent=timetableLabel();
  const current=evaluationTimetable(),period=currentEvaluationTerm();todayVersion.replaceChildren(el('strong','',current?timetableLabel(current):period?`${period.year}년 ${terms[period.term]} · 시간표 미등록`:'현재 평가 가능한 학기 없음'),el('small','academic-week',current?AcademicWeek.label(selectedDate(),AcademicWeek.start(current))+' · 현재 학기 과목만 평가할 수 있어요.':'내 시간표에서 현재 학기 시간표를 등록해주세요.'));const count=getEvaluationCourses().length;$('#course-count').replaceChildren(document.createTextNode(count),el('small','','개'));$('#class-count').textContent=count;
}
$('#history-order').onchange=renderHistory;render();route();
