'use strict';
const everytimeDialog=el('dialog','wide-dialog');everytimeDialog.id='everytime-dialog';document.body.append(everytimeDialog);
tools.append(button('에타 링크로 가져오기',openEverytimeImport));
function openEverytimeImport(){
  headingDialog(everytimeDialog,'에타 시간표 가져오기','공개 공유 링크의 과목·교수·강의실·시간을 불러옵니다.');
  const form=el('form');form.innerHTML='<label>에타 공유 링크<input name="url" type="url" required maxlength="500" placeholder="https://everytime.kr/@..."></label><p class="form-help">에타 로그인이나 비밀번호는 필요하지 않습니다. 공개된 시간표만 가져올 수 있어요.</p><button class="primary full" type="submit">시간표 불러오기</button>';
  const status=el('p','form-help');status.setAttribute('role','status');everytimeDialog.append(form,status);
  form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('button');try{const {url}=EverytimeModel.link(form.elements.url.value);if(!window.NA04ImportEverytime)throw Error('가져오기 서버가 연결되지 않았습니다.');submit.disabled=true;status.textContent='에타의 공개 시간표를 불러오는 중…';const source=await window.NA04ImportEverytime(url);if(everytimeDialog.open)previewEverytime(source);}catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
  everytimeDialog.showModal();
}
function previewEverytime(source){
  headingDialog(everytimeDialog,'가져올 수업 확인',`${source.year}년 ${terms[source.term]} · ${source.courses.length}개 강좌`);
  everytimeDialog.append(el('p','catalog-source','에타의 수업 시간과 강의실을 그대로 반영합니다. ERICA 강좌와 매칭한 결과와 분반을 확인해주세요. 기존 시간표와 평가 기록은 유지됩니다.'));
  const rows=[],list=el('div','import-results');
  for(const c of source.courses){
    const match=EverytimeModel.match(c,NA04_CATALOG,source),card=el('article','catalog-card'),label=el('label','import-check'),check=el('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label',c.title+' 가져오기');label.append(check,el('strong','',c.title));card.append(label,el('p','',`${c.professor||'담당교수 미정'}${c.number?' · 수업번호 '+c.number:''}`),el('p','',c.meetings.length?c.meetings.map(m=>`${days[m.day]} ${m.start}–${m.end} · ${m.room||'강의실 미지정'}`).join('\n'):'시간 미지정 · 추가 후 직접 시간 등록'),el('p','form-help',match.reason));
    const select=el('select');select.setAttribute('aria-label',`${c.title} ${c.professor} 분반 매칭`);const custom=el('option','','에타 정보 그대로 추가');custom.value='';select.append(custom);for(const candidate of match.candidates){const o=el('option','',`${candidate.title} · ${candidate.professor} · ${candidate.number}`);o.value=candidate.number;select.append(o);}select.value=match.selected;card.append(select);list.append(card);rows.push({source:c,check,select});
  }
  const form=el('form');const destination=el('label','','저장 위치'),select=el('select');select.setAttribute('aria-label','에타 시간표 저장 위치');for(const [value,text] of [['new','새 시간표로 만들기'],['current',`현재 시간표에 추가 · ${timetableLabel()}`]]){const o=el('option','',text);o.value=value;select.append(o);}destination.append(select);form.append(list,destination);const status=el('p','form-help');status.setAttribute('role','status');form.append(status);const submit=el('button','primary full','확인한 수업을 시간표에 추가');submit.type='submit';form.append(submit);
  form.onsubmit=e=>{e.preventDefault();try{const selected=rows.filter(r=>r.check.checked).map(r=>({source:r.source,catalog:NA04_CATALOG.courses.find(c=>c.number===r.select.value)}));const result=EverytimeModel.prepare(data,source,selected,select.value,()=>crypto.randomUUID());if(save(result.state)){everytimeDialog.close();location.hash='#courses';render();route();notify(`${result.added}개 강좌를 가져왔어요.${result.skipped?' 중복 '+result.skipped+'개는 건너뛰었어요.':''}`);}}catch(error){status.textContent=error.message;}};
  everytimeDialog.append(form,button('다른 링크 입력',openEverytimeImport));
}
