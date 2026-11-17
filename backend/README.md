# 익명 평가 서버 구성

운영 프로젝트는 Supabase의 univ-na04입니다. 사이트는 공개 RPC를 통해 검증된 비공개 함수만 호출합니다. 테이블 직접 접근은 차단하며 관리자 키는 프런트엔드에 넣지 않습니다.

## 폴더 구성

- migrations/: 운영 서버를 구성한 순차 SQL 변경 이력
- tests/: 임시 사용자와 데이터를 만든 뒤 롤백하는 서버 검증 SQL
- everytime-import/: 에타 공개 링크 가져오기 Edge Function

## 신규 서버 구성 순서

아래 파일을 순서대로 적용합니다. 이미 적용된 운영 서버에 처음부터 재실행하면 안 됩니다. 동일 함수의 이전 정의도 이후 변경의 전제가 되므로 변경 이력은 보존합니다.

1. migrations/anonymous.sql
2. migrations/private_rpc_boundary.sql
3. migrations/require_course_review_for_discussion.sql
4. migrations/require_review_for_feed.sql
5. migrations/group_discussions_by_offering.sql
6. migrations/canonical_discussion_times.sql
7. migrations/p1_security.sql
8. migrations/current_term_evaluations.sql
9. migrations/catalog_ratings.sql
10. migrations/final_reviews.sql
11. migrations/class_review_feed.sql

Anonymous Sign-Ins를 켜야 평가·대화 작성이 가능합니다. anonymous-config.js에는 공개 프로젝트 URL과 publishable key만 설정합니다. academic_terms에는 공식 학기 일정을 등록하며 등록된 운영 학기가 없으면 새 일일 평가와 수정은 차단합니다.

## 현재 운영 규칙

- 일일 평가 feed는 본인이 유효 일일 평가를 등록한 고정 room_id의 기록만 반환합니다. 학기·학교·과목·교수·주간 시간대가 다르면 분리하며 날짜·주차·세션이 달라도 같은 분반이면 열람합니다. 서버 필터 후 최근 100개를 반환합니다.
- 최종평가는 별도 테이블에 계정·분반별 1개를 저장합니다. 마지막 정규 수업일부터 학기 종료일까지 작성·수정할 수 있습니다. 공개 안내 확인과 필수 한줄평·점수를 검사하며 일일 평가나 토론 권한을 대신하지 않습니다.
- ratings는 최종평가 평균·개수·최근 한줄평 최대 10개를 누구나 조회하도록 합니다. 일일 평가는 합산하지 않고 작성자 ID를 반환하지 않습니다. 강좌 60개까지 한 번에 조회합니다.
- 토론 읽기·쓰기는 해당 분반의 유효 일일 평가를 등록한 경우에만 허용합니다. 메시지 room_id는 작성 당시 방을 유지하므로 평가 수정·sync_offerings로 기존 대화를 다른 방으로 옮길 수 없습니다.
- 현재 학기만 새 일일 평가와 수정·재게시를 허용합니다. 지난 학기 평가를 날짜만 바꿔 재게시하는 요청도 차단합니다.
- 잘못된 자료형·날짜·점수·분반 구조는 거부하며 비정상 기존 기록은 삭제하지 않고 조회·참여 자격에서 제외합니다.
- 글쓰기 간격은 5초입니다. 기본 금칙 표현 반복 3회 사용 시 24시간 제한하며 신고는 private reports에서 관리합니다. members.blocked_until로 관리자 제한을 설정할 수 있습니다.
- 열린 토론은 10초마다 확인하고 방별 최근 메시지 100개를 표시합니다. 재학생 인증은 제공하지 않으며 금칙어 목록이 모든 유해 표현을 판별하지는 못합니다.

## 검증

현재 스키마에서 아래 SQL을 각각 실행합니다. 임시 사용자와 데이터는 ROLLBACK하며 학기 일정을 바꾸는 테스트도 트랜잭션 안에서만 수행합니다.

- tests/test_p1_security.sql: 입력 검증, 비정상 기존 기록 격리, 고정 방 보호
- tests/test_current_term.sql: 현재 학기 제한과 과거 기록 수정 차단
- tests/test_catalog_ratings.sql: 최종평가 평균, 분반 분리, 100개 초과 집계, 입력 제한
- tests/test_final_reviews.sql: 최종평가 기간·공개 확인·중복 방지·공개 집계
- tests/test_class_review_feed.sql: 수업별 열람 제한과 필터 후 개수 제한

기존 전체 평가 공개 조건을 검사하던 test_review_feed_gate.sql은 현재 수업별 제한과 맞지 않아 제거했습니다. tests/test_grouped_discussions.sql은 이전 방 묶음 변경을 검증한 자료이며 현재 방 보안 검사는 test_p1_security.sql을 우선 사용합니다.

## 에타 공개 링크 가져오기

Edge Function은 JWT 검증을 켠 상태로 운영합니다. index.ts·deno.json과 루트 everytime-model.js를 기존 상대 경로가 유지되도록 배포합니다. 공개 공유 링크만 사용하고 로그인 비밀번호·쿠키·공유자 정보를 수집하지 않습니다. 링크·원본 응답은 데이터베이스에 저장하지 않습니다.

요청·응답 크기와 외부 요청 시간을 제한합니다. 실행 인스턴스 내에서 토큰별 분당 10회 제한을 적용하지만 인스턴스 전체를 아우르는 전역 제한은 아닙니다. 외부 서비스 형식이 바뀌면 연동 수정이 필요할 수 있습니다.

## 데이터와 비용

익명 세션·개인 시간표는 브라우저별로 유지됩니다. 브라우저 데이터를 삭제하면 기존 작성자로 접근하지 못할 수 있습니다. 유료 요금제 전환이나 과금 기능 활성화는 운영자 승인 없이 진행하지 않습니다.
