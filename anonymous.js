'use strict';
// Activated only after the hosted backend is configured and verified.
if(window.NA04_BACKEND?.url&&window.NA04_BACKEND?.publishableKey){
  const config=window.NA04_BACKEND,tokenKey='na04-anonymous-session';let session=null;
  try{session=JSON.parse(localStorage.getItem(tokenKey)||'null');}catch{}
  async function identity(){
    if(session?.expires_at>Date.now()+60000)return session.access_token;
    const refresh=session?.refresh_token;
    const response=await fetch(config.url+(refresh?'/auth/v1/token?grant_type=refresh_token':'/auth/v1/signup'),{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(refresh?{refresh_token:refresh}:{})});
    const result=await response.json();if(!response.ok||!result.access_token)throw Error('익명 연결에 실패했어요. 잠시 후 다시 시도해주세요.');
    session={access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Date.now()+result.expires_in*1000};localStorage.setItem(tokenKey,JSON.stringify(session));return session.access_token;
  }
  async function api(action,args={},write=false){const token=write?await identity():null;const response=await fetch(config.url+'/rest/v1/rpc/na04_api',{method:'POST',headers:{apikey:config.publishableKey,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:JSON.stringify({action,args})});const result=await response.json();if(!response.ok||result?.error)throw Error(result?.error||'서버 연결에 실패했어요. 다시 시도해주세요.');return result;}
  window.NA04ImportEverytime=async function(url){const token=await identity();const response=await fetch(config.url+'/functions/v1/everytime-import',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(20000)});const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'시간표 연결에 실패했어요.');return result;};
  const chat=el('dialog');chat.className='wide-dialog';document.body.append(chat);let currentThread=null,accepted=localStorage.getItem('na04-chat-notice-v1')==='accepted';
  const discussionPage=el('section','page');discussionPage.id='discussion-page';discussionPage.hidden=true;
  discussionPage.innerHTML='<div class="section-heading"><div><h2>과목별 토론 &amp; 커뮤니티</h2><p>같은 수업을 듣는 학생들이 익명으로 소통하는 공간입니다. 해당 수업을 평가한 뒤 참여할 수 있어요.</p></div><button id="refresh-discussions" class="secondary">새로고침 ↻</button></div><label class="search"><span>⌕</span><input id="discussion-search" type="search" aria-label="토론 검색" placeholder="과목명 또는 교수님 이름 검색"></label><p id="discussion-status" role="status"></p><div id="discussion-list"></div>';
  $('.bottom-line').before(discussionPage);
  const discussionNav=el('a');discussionNav.href='#discussion';discussionNav.dataset.page='discussion';discussionNav.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h12v9H9l-4 3v-3H4z"/><path d="M9 16v3h7l4 3v-3h1V9h-3"/></svg><span>토론 &amp; 커뮤니티</span>';$('nav').append(discussionNav);
  pages.discussion=['토론 & 커뮤니티','',''];
  let discussionRooms=[];
  function locallyEligible(room){return data.reviews.some(r=>r.publicId&&!r.publicPending&&data.courses.some(c=>c.id===r.courseId&&DiscussionModel.key(DiscussionModel.payload(data,c,r))===room.key));}
  function evaluateRoom(room){chat.close();if(room.local){openReview(room.local.id,selectedDate());return;}location.hash='#courses';notify('먼저 해당 분반을 내 시간표에 추가한 뒤 평가해주세요.');openCatalog(room.course.title);}
  function openRoom(room){
    const own=data.reviews.find(r=>r.publicId&&!r.publicPending&&data.courses.some(c=>c.id===r.courseId&&DiscussionModel.key(DiscussionModel.payload(data,c,r))===room.key));
    const id=room.entries[0]?.id||own?.publicId;
    if(!id){evaluateRoom(room);return;}openChat(id,room);
  }
  function renderDiscussions(){
    const list=$('#discussion-list');list.replaceChildren();const q=$('#discussion-search').value.trim();
    discussionRooms=DiscussionModel.groups(data,sharedState.records,NA04_CATALOG,today,q);
    for(const room of discussionRooms){
      const c=room.course,o=room.offering,card=el('article','history-card discussion-card');
      card.append(el('h3','',c.title),el('p','',`${c.school} · ${c.professor} 교수님`));
      const label=`${o.year}년 ${terms[o.term]}${o.number?' · 수업번호 '+o.number:''}`;
      card.append(el('p','discussion-offering',label),el('p','discussion-times',o.meetings.length?o.meetings.map(m=>`${days[m.day]} ${m.start}–${m.end}`).join(' · '):'시간대 미확인 · 다른 분반과 자동으로 합치지 않아요.'));
      if(room.today.length)card.prepend(el('span','discussion-today','오늘 시간표의 수업'));
      const actions=el('div','discussion-actions');actions.append(button(locallyEligible(room)?'대화 참여하기':room.local?'평가 후 참여하기':'시간표에 추가하고 참여',()=>openRoom(room),'discussion-join'));card.append(actions);list.append(card);
    }
    $('#discussion-status').textContent=sharedState.error|| (q?'검색 결과에서는 내 시간표 밖의 과목도 볼 수 있어요.':'오늘 수업을 먼저, 내 시간표의 나머지 수업을 그 아래에 표시해요. 다른 과목은 검색으로 찾을 수 있어요.');
    if(!discussionRooms.length)empty(list,q?'검색된 분반이 없어요':'시간표에 과목을 추가해주세요',q?'다른 과목명이나 교수명으로 검색해보세요.':'내 시간표에 과목을 추가하면 이곳에서 해당 분반의 토론에 참여할 수 있어요.');
  }
  $('#discussion-search').oninput=renderDiscussions;$('#refresh-discussions').onclick=()=>loadShared();
  const warning='비속어 또는 문제의 소지가 있는 표현을 사용하면 이용이 제한될 수 있습니다. 서로 존중하는 언어로 대화해주세요.';
  chat.addEventListener('close',()=>{currentThread=null;clearInterval(chat.refreshTimer);});
  async function openChat(id,room){clearInterval(chat.refreshTimer);currentThread=id;const entry=room;headingDialog(chat,'대화 참여 확인','해당 과목의 평가 완료 여부를 확인합니다.');chat.showModal();try{const eligibility=await api('eligibility',{reviewId:id},true);if(currentThread!==id||!chat.open)return;if(eligibility.canParticipate!==true){headingDialog(chat,'수업 평가 후 참여할 수 있어요','같은 분반의 평가를 먼저 등록해주세요.');chat.append(el('p','','같은 학기·분반의 수업 평가가 서버에 등록되어 있어야 대화를 읽고 참여할 수 있습니다. 개인 저장만 했거나 게시 대기 중인 평가는 포함되지 않습니다.'));if(entry)chat.append(button('이 과목 평가하기',()=>evaluateRoom(entry),'primary'));return;}}catch(error){if(currentThread===id&&chat.open){headingDialog(chat,'참여 여부를 확인할 수 없어요',error.message);chat.append(button('다시 확인',()=>openChat(id,room)));}return;}headingDialog(chat,room?.course.title||'익명 수업 토론','같은 학기·분반의 학생들과 수업 이야기를 나눠보세요.');const warningBox=el('div','chat-warning');warningBox.append(el('strong','','대화 참여 안내'),el('p','',warning));const agree=button('안내를 확인하고 참여하기',async()=>{try{await api('accept',{},true);accepted=true;localStorage.setItem('na04-chat-notice-v1','accepted');warningBox.hidden=true;composer.hidden=false;}catch(e){notify(e.message);}});warningBox.append(agree);warningBox.hidden=accepted;chat.append(warningBox);const list=el('div','chat-list');chat.append(list);const composer=el('form');composer.hidden=!accepted;composer.innerHTML='<label>대화 내용<textarea name="message" maxlength="1000" rows="3" required placeholder="수업과 관련된 이야기를 남겨주세요."></textarea></label><button class="primary" type="submit">익명으로 보내기</button>';chat.append(composer);const status=el('p','form-help');chat.append(status);
    async function refresh(){try{const records=await api('messages',{reviewId:id},true);if(currentThread!==id)return;list.replaceChildren();if(!records.length)list.append(el('p','','아직 대화가 없습니다. 첫 이야기를 남겨보세요.'));for(const m of records){const card=el('article','history-card');card.append(el('strong','',m.alias),el('p','',m.body),el('small','',new Date(m.createdAt).toLocaleString('ko-KR')),button('신고',async()=>{try{await api('report',{messageId:m.id},true);notify('신고가 접수됐어요.');}catch(e){notify(e.message);}}));list.append(card);}status.textContent='최근 대화 최대 100개 · 10초마다 자동으로 새 글을 확인합니다.';}catch(e){status.textContent=e.message;}}
    composer.onsubmit=async e=>{e.preventDefault();const body=composer.elements.message.value.trim();if(!body)return;const submit=composer.querySelector('button');submit.disabled=true;try{if(accepted)await api('accept',{},true);await api('message',{reviewId:id,body},true);composer.reset();await refresh();}catch(error){notify(error.message);}finally{submit.disabled=false;}};
    chat.append(button('대화 새로고침',refresh));chat.showModal();await refresh();chat.refreshTimer=setInterval(()=>{if(chat.open&&!document.hidden)refresh();},10000);
  }
  async function publishReview(r){const course=data.courses.find(c=>c.id===r.courseId);if(!course)return;r.offering=r.offering||DiscussionModel.offering(data,course,r);const payload={schema:'univ-na04/v2',kind:'review',course:{...publicCourse(course),offering:r.offering},review:{date:r.date,weekStart:r.weekStart??AcademicWeek.reviewStart(r,course,data),term:r.term||'',session:r.session||'기본 세션',comment:r.comment||'',overall:r.overall,understanding:r.understanding,delivery:r.delivery,structure:r.structure}};if(!ShareModel.valid(payload))throw Error('평가 내용을 확인해주세요.');const response=await api('review',{clientId:r.publicClientId,payload},true);r.publicId=response.id;r.publicPending=false;save({...data,reviews:[...data.reviews]});render();await loadShared();}
  const previousSubmit=$('#review-form').onsubmit;
  $('#review-form').onsubmit=async e=>{const before=data;const previous=data.reviews.find(r=>r.timetableId===data.activeTimetableId&&r.courseId===editing?.id&&r.date===editing?.date&&(r.session||'기본 세션')===editing?.session);previousSubmit(e);if(data===before)return;const r=data.reviews.at(-1);r.offering=previous?.offering||DiscussionModel.offering(data,data.courses.find(c=>c.id===r.courseId),r);r.publicClientId=previous?.publicClientId||crypto.randomUUID();r.publicPending=true;save({...data,reviews:[...data.reviews]});try{await publishReview(r);notify('평가가 익명으로 공개됐어요.');}catch(error){render();notify('개인 저장 완료 · 공개 게시 대기: '+error.message);}};
  const originalCard=reviewCard;reviewCard=function(r,c,entry=null){const card=originalCard(r,c,entry);if(r.term)card.prepend(el('p','form-help',r.term));const actions=card.querySelector('.actions');actions.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('공유'))b.remove();});if(r.publicPending)actions.append(button('공개 게시 재시도',async()=>{try{await publishReview(r);notify('공개됐어요.');}catch(e){notify(e.message);}}));return card;};
  const originalSharedCard=sharedCard;sharedCard=function(entry){const card=originalSharedCard(entry);card.querySelectorAll('a').forEach(a=>a.remove());const byline=card.querySelector('p');if(byline)byline.textContent=`${entry.payload.course.school} · ${entry.payload.course.professor} 교수님 · 익명 평가`;return card;};
  const beforeDiscussionRender=render;render=function(){beforeDiscussionRender();renderDiscussions();};
  async function syncOfferings(){
    const pending=data.reviews.filter(r=>r.publicClientId&&r.publicId&&!r.publicPending&&!r.offering).map(r=>({review:r,course:data.courses.find(c=>c.id===r.courseId)})).filter(x=>x.course);
    for(let n=0;n<pending.length;n+=100){const batch=pending.slice(n,n+100).map(x=>({...x,offering:DiscussionModel.offering(data,x.course,x.review)}));await api('sync_offerings',{bindings:batch.map(x=>({clientId:x.review.publicClientId,offering:x.offering}))},true);batch.forEach(x=>x.review.offering=x.offering);save({...data,reviews:[...data.reviews]});}
  }
  sharedState.locked=true;
  loadShared=async function(){if(sharedState.busy)return;sharedState.busy=true;sharedState.error='';sharedState.locked=true;sharedState.records=[];renderShared();renderDiscussions();try{await syncOfferings();const response=await api('feed',{},true);if(response?.locked===true){sharedState.locked=true;}else if(Array.isArray(response)){sharedState.locked=false;sharedState.records=response.filter(x=>x&&typeof x.id==='string'&&ShareModel.valid(x.payload)).map(x=>({...x,author:'익명',number:x.id}));}else throw Error('공유 기록의 응답을 확인할 수 없어요.');sharedState.hasMore=false;}catch(e){sharedState.error=e.message;}finally{sharedState.busy=false;renderShared();renderDiscussions();}};
  $('#refresh-shared').onclick=loadShared;$('#more-shared').hidden=true;
  $('#review-form .form-help:last-of-type').textContent='저장한 평가는 익명으로 공유되며, 평가를 등록한 사용자에게 공개됩니다. 개인정보를 입력하지 마세요.';
  $('#review-form button[type=submit]').textContent='평가 저장 및 자동 공개';
  $('#shared-feed .section-heading p').textContent='수업 평가를 1개 이상 등록하면 다른 학생의 익명 평가를 볼 수 있어요. 토론은 해당 과목 평가 후 참여할 수 있습니다.';
  offerShare=()=>notify('새 평가는 저장하면 익명으로 자동 공개됩니다.');
  const legacyDetail=openDetail;openDetail=function(id){legacyDetail(id);detail.querySelectorAll('button').forEach(b=>{if(b.textContent.includes('과목 정보 공유'))b.remove();});if(sharedState.locked)detail.append(el('p','feed-access-note','다른 학생의 평가는 본인의 수업 평가를 1개 이상 등록한 뒤 확인할 수 있어요.'));};
  document.querySelector('.storage-badge').textContent='● 익명 자동 공개';
  renderShared=function(){
    const list=$('#shared-list'),search=$('#shared-search');list.replaceChildren();search.disabled=sharedState.locked||sharedState.busy;sharedDate.disabled=sharedState.locked||sharedState.busy;clearSharedDate.disabled=sharedState.locked||sharedState.busy;$('#more-shared').hidden=true;$('#refresh-shared').disabled=sharedState.busy;
    if(sharedState.busy){$('#shared-status').textContent='평가 등록 여부를 확인하는 중…';return;}
    if(sharedState.error){$('#shared-status').textContent=sharedState.error;empty(list,'평가 등록 여부를 확인하지 못했어요','잠시 후 새로고침해주세요. 다른 학생의 평가 내용은 표시하지 않습니다.');return;}
    if(sharedState.locked){$('#shared-status').textContent='평가를 1개 이상 등록한 사용자만 다른 학생의 평가를 볼 수 있습니다.';empty(list,'내 평가를 남기면 다른 학생들의 평가를 볼 수 있어요','오늘의 강의에서 수업 평가를 1개 이상 작성하고 공개 등록을 완료해주세요. 개인 저장만 했거나 게시 대기 중인 평가는 포함되지 않습니다.');list.querySelector('.empty').append(button('수업 평가하러 가기',()=>{location.hash='#today';$('#course-list').scrollIntoView({behavior:'smooth',block:'start'});},'primary'));return;}
    const q=search.value.toLowerCase(),entries=filteredSharedRecords();
    entries.forEach(entry=>list.append(sharedCard(entry)));if(!entries.length)empty(list,'표시할 일일 평가가 없어요',q||sharedDate.value?'날짜나 검색어를 바꾸거나 전체 날짜를 선택해주세요.':'새 평가가 등록되면 여기에 표시됩니다.');$('#shared-status').textContent=`평가 등록 확인 완료 · 표시 ${entries.length}개 · 불러온 평가 ${sharedState.records.length}개`;
  };
  render();route();renderDiscussions();loadShared();
}
