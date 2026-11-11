'use strict';
const finalDialog=el('dialog','wide-dialog');finalDialog.id='final-review-dialog';document.body.append(finalDialog);
function appendFinalReviewAction(card,course,all){
  const t=all?activeTimetable():evaluationTimetable();if(!t)return;
  const action=button('학기말 최종평가',()=>openFinalReview(course,t),'secondary final-review-button');
  const period=AcademicWeek.terms.find(p=>AcademicWeek.matchesTerm(t,p));
  const last=AcademicWeek.lastClass(DiscussionModel.offering({...data,activeTimetableId:t.id},course),period);
  if(last)action.title=`마지막 정규 수업일 ${last} · 작성 가능 여부는 서버에서 확인합니다.`;
  card.append(action);
}
async function openFinalReview(course,timetable){
  const state={...data,activeTimetableId:timetable.id};
  const publicCourse={school:course.school,title:course.title,professor:course.professor,offering:DiscussionModel.offering(state,course)};
  headingDialog(finalDialog,`${course.title} · 최종평가`,`${timetableLabel(timetable)} · ${course.professor} 교수님`);
  const notice=el('div','chat-warning');notice.append(el('strong','','다음 수강생에게 공개되는 평가입니다.'),el('p','','이 최종평가의 평점과 한줄평은 이 수업을 수강하려는 학생 누구나 수업 추가 화면에서 확인할 수 있습니다. 한 학기 전체의 수업 경험을 바탕으로 최대한 객관적인 시선으로 평가해주세요. 구체적인 근거를 적고 개인정보나 인신공격은 피해주세요.'));
  const status=el('p','form-help','마지막 수업일과 최종평가 작성 기간을 확인하는 중…');status.setAttribute('role','status');finalDialog.append(notice,status);finalDialog.showModal();
  if(!window.NA04FinalReview){status.textContent='서버 연결 후 최종평가를 작성할 수 있어요.';return;}
  try{
    const result=await window.NA04FinalReview('final_status',{course:publicCourse});
    if(!finalDialog.open||!status.isConnected)return;
    status.textContent=result.lastDate?`마지막 정규 수업일 ${result.lastDate} · 작성·수정 기간 ${result.lastDate} ~ ${result.endsOn}`:'수업 시간이 없어 마지막 수업일을 계산할 수 없습니다. 내 시간표에서 시간을 등록해주세요.';
    finalDialog.append(el('p','form-help','학기 종료일과 정규 시간표 요일을 기준으로 계산하며 휴강·보강·조기 종강은 자동 반영하지 않습니다.'));
    if(!result.canSubmit){finalDialog.append(el('p','feed-access-note','마지막 정규 수업일부터 학기 종료일까지 최종평가를 작성·수정할 수 있습니다.'));if(result.review)finalDialog.append(el('p','',`저장된 최종평점 ${result.review.overall} / 5 · ${result.review.comment}`));return;}
    const form=el('form');
    for(const [key,title] of metrics){const field=el('fieldset','rating-row');field.append(el('legend','',title));const options=el('div','rating-options');for(let n=1;n<=5;n++){const label=el('label'),input=el('input');input.type='radio';input.name=key;input.value=n;input.required=true;input.setAttribute('aria-label',`${title} ${n}점`);input.checked=result.review?.[key]===n;label.append(input,el('span','',String(n)));options.append(label);}field.append(options);form.append(field);}
    const label=el('label','','한 학기를 돌아보는 한줄평'),comment=el('textarea');comment.name='comment';comment.required=true;comment.maxLength=500;comment.rows=3;comment.placeholder='수업의 장점과 개선점을 구체적이고 객관적으로 적어주세요.';comment.value=result.review?.comment||'';label.append(comment);form.append(label);
    const consent=el('label','final-consent'),checkbox=el('input');checkbox.type='checkbox';checkbox.required=true;consent.append(checkbox,document.createTextNode('평점과 한줄평이 수강을 고려하는 모든 학생에게 공개됨을 확인했습니다.'));form.append(consent);
    const submit=el('button','primary full',result.review?'최종평가 수정 및 공개':'최종평가 저장 및 공개');submit.type='submit';form.append(submit);
    form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const fields=new FormData(form);const review={date:result.lastDate,session:'최종평가',weekStart:AcademicWeek.start(timetable),comment:comment.value.trim()};if(!review.comment){comment.setCustomValidity('한줄평을 입력해주세요.');comment.reportValidity();return;}for(const [key] of metrics)review[key]=Number(fields.get(key));submit.disabled=true;try{await window.NA04FinalReview('final_review',{course:publicCourse,review,noticeAccepted:checkbox.checked});finalDialog.close();notify('최종평가가 저장됐어요. 수업 추가 화면에서 누구나 확인할 수 있습니다.');}catch(error){status.textContent=error.message;submit.disabled=false;}};
    comment.oninput=()=>comment.setCustomValidity('');finalDialog.append(form);
  }catch(error){if(status.isConnected)status.textContent=error.message;}
}
render();
