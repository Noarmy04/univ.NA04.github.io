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
