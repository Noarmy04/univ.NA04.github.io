'use strict';
const historyPage=$('#history-page'),historyHeading=historyPage.querySelector('.section-heading');
historyHeading.querySelector('h1').textContent='일일 평가 기록';
historyHeading.querySelector('p').textContent='수업별 평점과 한줄평을 모아보세요.';
$('#export').textContent='내 기록 내려받기 ↓';
const reviewTabs=el('div','review-tabs');reviewTabs.setAttribute('role','tablist');reviewTabs.setAttribute('aria-label','평가 기록 보기');
const studentPanel=el('section','review-panel'),minePanel=el('section','review-panel');studentPanel.id='student-review-panel';minePanel.id='my-review-panel';
const panels={students:studentPanel,mine:minePanel},reviewTabButtons={};
for(const [key,label] of [['students','학생들의 평가'],['mine','내 평가']]){
  const b=button(label,()=>selectReviewPanel(key),'review-tab');b.id='review-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',panels[key].id);reviewTabButtons[key]=b;reviewTabs.append(b);
  panels[key].setAttribute('role','tabpanel');panels[key].setAttribute('aria-labelledby',b.id);
  b.onkeydown=e=>{let target;if(e.key==='Home')target='students';if(e.key==='End')target='mine';if(e.key==='ArrowLeft'||e.key==='ArrowRight')target=key==='students'?'mine':'students';if(target){e.preventDefault();selectReviewPanel(target);reviewTabButtons[target].focus();}};
}
historyHeading.after(reviewTabs);reviewTabs.after(studentPanel,minePanel);
minePanel.append($('#history-search').closest('label'),$('#history-order').closest('label'),$('#history-list'));
studentPanel.append($('#shared-feed'));
$('#shared-feed h2').textContent='학생들의 일일 평가';
$('#shared-feed .section-heading p').textContent='각 수업의 평점과 한줄평을 확인하세요. 본인의 평가를 1개 이상 등록하면 볼 수 있습니다.';
const studentOrder=$('#history-order').cloneNode(true);studentOrder.id='student-review-order';studentOrder.setAttribute('aria-label','학생 평가 정렬');studentOrder.onchange=()=>renderShared();const studentOrderLabel=el('label','history-order','평가 정렬 ');studentOrderLabel.append(studentOrder);$('#shared-status').before(studentOrderLabel);
const beforeHubFilter=filteredSharedRecords;filteredSharedRecords=function(){return beforeHubFilter().filter(e=>e.payload.kind==='review'&&e.payload.review).sort((a,b)=>{const date=a.payload.review.date.localeCompare(b.payload.review.date),score=a.payload.review.overall-b.payload.review.overall;return studentOrder.value==='highest'?-score||-date:studentOrder.value==='lowest'?score||-date:studentOrder.value==='oldest'?date:-date;});};
function selectReviewPanel(key){for(const [name,panel] of Object.entries(panels)){panel.hidden=name!==key;reviewTabButtons[name].setAttribute('aria-selected',String(name===key));reviewTabButtons[name].tabIndex=name===key?0:-1;}$('#export').hidden=key!=='mine';}
function labelReview(card,r){
  const score=card.querySelector('.score');if(score)score.textContent=`평점 ${r.overall} / 5`;
  let comment=[...card.children].find(e=>e.tagName==='P'&&r.comment&&e.textContent===r.comment);
  if(!comment){comment=el('p');const metrics=card.querySelector('.score-details');if(metrics)metrics.after(comment);else card.append(comment);}
  comment.classList.add('daily-comment');comment.textContent=`한줄평: ${r.comment||'작성된 한줄평이 없습니다.'}`;
  return card;
}
const beforeHubSharedCard=sharedCard;sharedCard=function(entry){const card=beforeHubSharedCard(entry),r=entry.payload.review;if(!r)return card;const score=card.querySelector('.score');if(score)score.before(el('p','daily-lesson',`수업 ${r.date} · ${AcademicWeek.label(r.date,AcademicWeek.reviewStart(r,entry.payload.course))} · ${r.session||'기본 세션'}`));return labelReview(card,r);};
const beforeHubReviewCard=reviewCard;reviewCard=function(r,c,entry=null){const card=labelReview(beforeHubReviewCard(r,c,entry),r);const week=el('p','academic-week',AcademicWeek.label(r.date,AcademicWeek.reviewStart(r,c,data)));const start=AcademicWeek.reviewStart(r,c,data);if(start)week.title='주차 기준일: '+start;card.querySelector('.score')?.before(week);return card;};
selectReviewPanel('students');renderHistory();renderShared();

$('#review-date').addEventListener('input',()=>{$('#review-week').textContent=AcademicWeek.label($('#review-date').value,AcademicWeek.start(activeTimetable()));});

const reviewWeekLabel=el('label','date-filter','수업 주차 '),reviewWeek=el('input');
reviewWeek.type='number';reviewWeek.min='1';reviewWeek.step='1';reviewWeek.placeholder='예: 11';reviewWeek.id='shared-week';reviewWeek.setAttribute('aria-label','학생 평가 수업 주차');reviewWeekLabel.append(reviewWeek);
const resetWeek=button('전체 주차',()=>{reviewWeek.value='';renderShared();});
$('#shared-feed .shared-filters').append(reviewWeekLabel,resetWeek);reviewWeek.oninput=()=>renderShared();
let selectedReviewGroup=null,selectedReviewWeek=null;
const beforeGroupedRender=renderShared;
renderShared=function(){
  beforeGroupedRender();
  const disabled=sharedState.locked||sharedState.busy||!!sharedState.error;reviewWeek.disabled=disabled;resetWeek.disabled=disabled;
  if(disabled)return;
  const groups=ReviewGroupModel.courses(filteredSharedRecords(),reviewWeek.value),list=$('#shared-list');list.replaceChildren();
  if(!groups.some(g=>g.key===selectedReviewGroup)){selectedReviewGroup=null;selectedReviewWeek=null;}
  const total=groups.reduce((sum,g)=>sum+g.count,0);
  $('#shared-status').textContent=`과목 ${groups.length}개 · 평가 ${total}개 · 과목을 누른 뒤 주차를 선택해주세요.`;
  if(!groups.length){empty(list,'조건에 맞는 과목 평가가 없어요','과목 검색어, 평가 날짜 또는 수업 주차를 바꿔보세요.');return;}
  const tabs=el('div','course-review-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','수업별 평가');
  const panel=el('section','course-review-panel');panel.id='course-review-panel';panel.setAttribute('role','tabpanel');panel.tabIndex=0;
  const buttons=[];
  function choose(index,focus=false){
    const group=groups[index];if(selectedReviewGroup!==group.key)selectedReviewWeek=null;selectedReviewGroup=group.key;
    panel.hidden=false;panel.replaceChildren();panel.setAttribute('aria-labelledby','course-review-tab-'+index);
    panel.append(el('h3','',group.course.title));
    const field=el('label','review-week-picker','평가를 볼 주차 '),select=el('select');select.setAttribute('aria-label','선택한 과목의 평가 주차');
    const placeholder=el('option','','주차를 선택해주세요');placeholder.value='';select.append(placeholder);
    for(const w of group.weeks){const option=el('option','',`${w.label}${w.week===null||w.week===0?' · '+w.entries[0].payload.review.date:''} · 평가 ${w.entries.length}개`);option.value=w.key;select.append(option);}
    field.append(select);const results=el('div','compact-review-results');results.setAttribute('aria-live','polite');panel.append(field,results);
    function showWeek(){
      selectedReviewWeek=select.value||null;results.replaceChildren();const w=group.weeks.find(w=>w.key===selectedReviewWeek);
      if(!w){results.append(el('p','review-week-hint','주차를 선택하면 평점과 한줄평이 표시됩니다.'));return;}
      const rows=el('ul','compact-reviews');rows.setAttribute('aria-label',w.label+' 학생 평가');
      for(const entry of w.entries){const r=entry.payload.review,row=el('li','compact-review');row.append(el('strong','compact-score',`평점 ${r.overall} / 5`),el('p','compact-comment',r.comment||'작성된 한줄평이 없습니다.'));rows.append(row);}
      results.append(rows);
    }
    select.value=group.weeks.some(w=>w.key===selectedReviewWeek)?selectedReviewWeek:'';select.onchange=showWeek;showWeek();
    buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    if(focus)buttons[index].focus();
  }
  for(const [index,g] of groups.entries()){
    const tab=button('',()=>choose(index),'course-review-tab');tab.id='course-review-tab-'+index;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);tab.setAttribute('aria-selected','false');tab.tabIndex=index===0?0:-1;
    const o=g.offering,times=o.meetings.length?o.meetings.map(m=>`${days[m.day]} ${m.start}–${m.end}`).join(' · '):o.number?`수업번호 ${o.number}`:'수업 시간 미등록';
    tab.append(el('strong','',g.course.title),el('span','',`${g.course.professor} 교수님 · ${o.year}년 ${terms[o.term]||o.term}`),el('span','',times),el('span','group-week',`주차 선택하기 · 평가 ${g.count}개`));
    tab.onkeydown=e=>{const next=e.key==='ArrowRight'?(index+1)%groups.length:e.key==='ArrowLeft'?(index+groups.length-1)%groups.length:e.key==='Home'?0:e.key==='End'?groups.length-1:null;if(next!==null){e.preventDefault();choose(next,true);}};
    buttons.push(tab);tabs.append(tab);
  }
  panel.hidden=true;list.append(tabs,panel);
  const index=groups.findIndex(g=>g.key===selectedReviewGroup);if(index>=0)choose(index);
};
$('#shared-search').oninput=()=>renderShared();renderShared();
