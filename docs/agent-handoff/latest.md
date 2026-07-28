# Claude → Codex 개발 완료 보고

## 식별 정보

- 작업: 코덱스 구현분 전수 감사 후 보안·데이터 정합성·비문해 저학년 사용성 결함 일괄 수정
- 브랜치: `claude/audit-and-ux-fixes`
- 기준 커밋: `4f1dc2f`
- 코드·보고서 커밋: 이 문서와 같은 브랜치의 마지막 두 커밋 (`git log --oneline main..claude/audit-and-ux-fixes`)

## 수정한 문제

멀티에이전트 감사(7개 축 × 발견 → 반박검증)에서 확정된 33건 중 30건과, 실제 브라우저 측정에서 새로 드러난 3건을 고쳤다.

### 보안·데이터 정합성 (서버)

1. `rateLimit()`이 SELECT → 비교 → UPDATE의 3단계라 동시 요청 버스트가 상한을 통째로 우회했다. 앱의 모든 남용 방지 지점(학생 입장·복구·AI 호출·저장)이 이 함수 하나에 의존한다.
2. `switchProfile`이 studentId + 그림 비밀번호(경우의 수 512)만으로 2시간 device token을 발급하는데 대상 계정 단위 잠금이 없었다.
3. 학생 입장·전환·복구가 IP 하나에 8~12회/10분으로 묶여 있어, NAT 뒤 학급 전체(태블릿 25대 = 공인 IP 1개)가 수업 시작 시 서로를 잠갔다.
4. AI 코칭 초안 승인이 운영 스키마에서 100% 실패했다. `approved_message_id`의 FK 부모(teacher_messages 행)를 나중에 넣어 batch 전체가 롤백됐다.
5. 가족 공유 1회용 초대가 GET에서 소비돼, 메신저 링크 미리보기 봇의 GET 한 번으로 초대가 타고 그 봇이 8시간 가족 세션 쿠키를 받았다.
6. 가족 주간 리포트가 `CURRENT_TIMESTAMP`(공백 구분) 값과 ISO 경계값을 문자열 비교해, 리포트 첫날 코칭 기록이 통째로 빠졌다.
7. 아동 안전 필터가 한국어 칭찬 표현 `멋있-`, `이쁘-`, `잘 그린`, `짱`을 통과시켰다. 제품 불변식(AI는 평가·칭찬하지 않는다)을 강제하는 유일한 서버 방어선이다.
8. 완성 저장의 `artwork_versions.sequence`가 요청 시작 시점에 읽은 `version_count`를 써서, 그 사이 코칭 저장이 버전을 만들면 UNIQUE 충돌로 저장 전체가 실패했다.
9. `archived_at`·`last_activity_at`을 `CURRENT_TIMESTAMP`로 저장해 클라이언트 `new Date()`가 Safari에서 Invalid Date, V8에서 시각 오독을 일으켰다.
10. `db/schema.ts`의 `coaching_event_details.status` enum에 실제로 쓰는 `completed`가 빠져 있었다.
11. 학급 코드만 있으면 join의 409/201 차이로 (별명, 동물) 재학 여부를 캐낼 수 있고 실패 시도마다 가짜 프로필이 쌓였다 — 학급 단위 상한으로 완화했다.

### 그리기 클라이언트

12. 클라이언트가 서버 문서 한도(ops 5000, 스트로크 12000점, 직렬화 1.25MB)를 전혀 지키지 않아, 넘는 순간 이후 모든 저장이 400/413으로 실패하고 초안 복구도 불가능해 그림이 조용히 사라졌다.
13. 자동 저장이 1.5초 디바운스뿐이라 선을 촘촘히 이어 그리면 저장이 무기한 연기됐고, 이탈 시 플러시 경로가 없어 마지막 저장 이후 그림이 서버에도 기기에도 남지 않았다.
14. 모든 포인터를 그리기로 처리해 태블릿에 얹은 손바닥 접촉이 각각 별도의 선으로 커밋됐다.
15. 저장 충돌 중 스트로크가 폐기될 때 미리보기 픽셀이 화면에 남아, 문서에 없는 선이 사본 썸네일에 섞였다.
16. `saveAsCopy`에 예외 처리가 없어 오프라인에서 "새 사본을 만드는 중…"으로 영구 고착됐다.
17. IndexedDB를 못 열면 온라인이어도 그리기 화면 로드가 영구 실패했다.

### 입장·교사 클라이언트

18. 가입 완료 화면의 개인 복구 QR이 bfcache 뒤로가기로 다음 사용자에게 그대로 노출됐다. 이 토큰은 비밀번호 없이 계정을 연다.
19. 복구 카드 재발급이 기존 QR·세션을 먼저 파기하는데 새 주소 전달이 clipboard 성공에만 의존해, iPad Safari에서 재발급 뒤 복구 경로가 사라졌다.
20. 음성 귓속말이 공유 objectUrl을 써서 연속 귓속말이 겹쳐 재생되고 두 번째 URL이 조기 회수됐다. 전송 fetch에도 try/catch가 없었다.
21. 교사 메시지 전송이 실패해도 입력한 본문을 지웠다.
22. 학생 미리보기 모달이 클릭 시점 스냅샷에 고정돼 6초 폴링 결과가 반영되지 않았다.

### 비문해 저학년 사용성 (인수인계 P1/P2)

23. **P1** 모바일 그리미 패널 잘림: 좁은 컬럼 안 중첩 스크롤에 질문·선택지·다음 행동·확인 버튼이 모두 들어가 아래가 잘렸다.
24. **P1** `SpeakButton` 연속 탭 경쟁: 전역 `speechSynthesis.cancel()` 뒤 이전 발화의 `onend/onerror`가 새 발화의 타이머·UI 상태를 정리했고, 다른 버튼 unmount가 재생 중인 발화를 취소했다.
25. **P1/P2** 글자에 의존하는 오류 복구: 오류가 글로만 표시되고, 세 칸을 되돌리려면 `한 칸 지우기`를 세 번 눌러야 했으며, 수정 중에도 이전 오류가 남고, 기존 학생에게도 "그림 비밀번호를 만들어요" 음성이 나왔다.
26. **P2** 세로 모바일 후순위 CSS가 가이드·이전·다음 버튼을 38px로 축소했다.
27. **P2** 음성 미지원 시 버튼이 disabled라 아이가 눌러도 대체 행동이 없었고, 발화 실패·무음에 시각 표시가 없었다.
28. **P2** 홈 역할 선택이 글자 의존이고, QR 입장이 코드 입력을 건너뛰지 않았다.
29. 접근성: 소감·타임랩스·학생 미리보기 모달에 초점 이동, focus trap, 배경 inert, Escape 닫기, opener 복귀가 없었다. 동물 버튼에 한국어 `aria-label`이 없었다.
30. `@media (max-width:720px)`의 범위 없는 `.step-actions { display:none }`이 그리미 AI 가이드의 이전·다음 버튼까지 지워, 모든 세로 휴대폰에서 단계 가이드를 1단계 이후로 진행할 수 없었다.

### 실제 브라우저 측정으로 새로 발견 (감사에서 못 잡음)

31. 입장 화면의 고정 CTA가 그림 비밀번호 버튼 4개를 덮어 탭이 버튼에 먹혔다 (320×568, 390×844에서 재현).
32. 스튜디오 나가기(←)와 로고가 `<a>`라 `button { min-height:44px }` 규칙이 닿지 않아 ~21px, 34px로 계산됐다.
33. 알림 알약(`teacher-viewing`, `voice-speaking`)이 `pointer-events`를 막지 않아 아래의 단계 버튼과 캔버스 탭을 가로챘다. 가로 모드에서는 `.canvas-wrap`이 `100vh` 기준이라 `100dvh` 셸 안에서 도화지가 잘렸다.

## 원인

- **동시성**: 검사와 갱신이 서로 다른 문장으로 나뉜 곳(레이트리밋, 버전 시퀀스)이 D1 왕복 사이에 다른 요청을 끼워 넣었다.
- **한도 비대칭**: 서버만 한도를 알고 클라이언트는 몰라, 한도 초과가 "저장 실패"가 아니라 "영구 실패 + 조용한 유실"이 됐다.
- **CSS 선택자 범위**: 한 화면을 위한 규칙(`.step-actions`, 38px 축소, sticky CTA)이 같은 클래스를 쓰는 다른 화면까지 덮었다.
- **소유권 없는 전역 부수효과**: `speechSynthesis.cancel()`, 공유 `objectUrl`, 클릭 시점 스냅샷처럼 "누구 것인지" 표시가 없는 상태가 서로를 지웠다.
- **안전 GET 위반**: 상태를 바꾸고 자격증명을 발급하는 동작이 GET에 붙어 있어 봇의 프리페치가 사용자 행동과 구분되지 않았다.
- **테스트 성격**: 기존 `pre-reader-ux`·`mobile-css` 테스트가 소스 문자열 정규식이라 cascade 뒤 computed size, 가려짐, 초점을 전혀 보지 못했다.

## 변경 파일

신규
- `lib/speech.ts` — 발화 소유권 모델(주입 가능한 환경)
- `lib/rate-limit.ts` — 원자적 시도 계수
- `app/components/useModalDialog.ts` — 모달 초점·inert·Escape 공용 훅
- `scripts/browser-check.mjs` — 실제 Chrome(CDP) 3뷰포트 행동 검증 (`npm run check:browser`)
- `tests/speak-button.test.mjs`, `tests/entry-error-recovery.test.mjs`, `tests/coaching-safety.test.mjs`, `tests/rate-limit.test.mjs`

수정
- 서버: `lib/security.ts`, `lib/teacher-messages.ts`, `lib/growth-reports.ts`, `lib/family-sharing.ts`, `lib/openai-coaching.ts`, `lib/drawing-model.ts`, `app/api/student/route.ts`, `app/api/teacher/route.ts`, `app/api/artworks/[id]/route.ts`, `app/family/[token]/route.ts`, `db/schema.ts`
- 클라이언트: `app/components/DrawingStudio.tsx`, `app/components/JoinClient.tsx`, `app/components/SpeakButton.tsx`, `app/components/TeacherApp.tsx`, `app/components/TimelapsePlayer.tsx`, `app/components/VoiceWhisper.tsx`, `app/page.tsx`, `app/globals.css`
- 테스트: `tests/mvp2-storage.test.mjs`(FK 있는 fixture로 교정), `tests/mvp3.test.mjs`, `tests/contracts.test.mjs`, `tests/mobile-css.test.mjs`, `tests/drawing-tools.test.mjs`, `tests/pre-reader-ux.test.mjs`, `tests/qr-entry.test.mjs`
- `package.json` (테스트 목록, `check:browser`)

## 수정 후 구현

- **레이트리밋**: `INSERT … ON CONFLICT DO UPDATE … RETURNING count` 한 문장으로 검사·증가·창 리셋을 원자화. 성공 인증은 대상 카운터를 비워(`clearRateLimit`) 정상 사용자가 잠기지 않게 했다.
- **입장 한도 재설계**: IP 한도는 학급 규모(180회/10분)로 올리고, 무차별 대입은 대상 단위(학생 잠금해제·복구 조합·개인 QR 각 8회/15분)와 학급 단위 join 상한(60회/10분)으로 막는다.
- **초안 승인**: batch 순서를 뒤집어 `teacher_messages`를 먼저 넣고 초안을 갱신한다. 두 문장의 CAS 가드를 동일하게 맞추고, 어긋나면 넣은 메시지를 되돌린다.
- **가족 초대**: GET은 읽기 전용 `peekFamilyInvite`로 확인 화면만 그리고, 실제 소비와 Set-Cookie는 same-origin POST에서만 한다.
- **그리미 바텀시트**: ≤720px과 짧은 가로 화면에서 `position:fixed` 바텀시트로 바꾸고, 머리말(닫기)과 탈출 버튼을 고정하고 가운데만 스크롤한다(`.grimi-scroll`). 낮은 화면에서는 다음 행동을 고정하지 않아 선택지를 덮지 않는다.
- **발화 소유권**: utterance마다 토큰을 발급하고 환경 전역 소유자와 대조해, 최신 발화만 UI를 바꾸고 unmount는 자기 발화만 취소한다. 시작 4초·최대 재생시간 감시로 무음/미지원을 실패로 표시하고, 버튼은 절대 disabled가 되지 않고 `👩‍🏫 같이 읽기` 대체 행동으로 바뀐다.
- **오류 복구**: `⚠️ + 🔊 + 문장`을 한 덩어리로 보여주고, `🔄 다시 골라요` 한 번으로 세 칸을 비우며, 첫 수정(코드·별명·동물·그림) 즉시 이전 오류를 지운다. 코드 오류는 칸을 강조하고 `🙋 선생님 불러요`로 이어진다. 기존 학생에게는 "내 그림 비밀번호를 눌러요" 음성을 쓴다.
- **QR 입장**: 코드 입력을 건너뛰고 별명 추천 → 동물 → 그림 비밀번호 3단계로 안내한다.
- **문서 한도**: 스트로크가 11,500점에 닿으면 화면 그대로 안쪽에서 끊어 이어 붙이고, 좌표를 소수 4자리로 줄이며, 한도에 근접하면 그리기를 막는 대신 "종이가 가득 찼어요 → 다 그렸어요" 안내를 띄운다.
- **저장 유실 방지**: 디바운스에 최대 6초 상한을 두고, `pagehide`/`visibilitychange(hidden)`에서 미저장 문서를 IndexedDB에 보관한다.
- **모달 접근성**: 공용 훅이 초점 이동, Tab 순환, 조상 체인 형제 `inert`+`aria-hidden`, Escape 닫기, opener 복귀를 처리한다.

## 수정 후 결과

- 병렬 40회 버스트에서 통과 8회(상한 그대로), 계수 40회 — 회귀 테스트로 고정.
- FK가 있는 fixture에서 초안 승인이 성공하고 메시지 1건만 남는다(동시 승인 시 1건).
- 링크 미리보기 3회 GET 후에도 초대는 미소비 상태, 세션 0건.
- 칭찬 문구 12종이 전부 차단되고 정상 질문·지시 5종은 통과한다.
- 320×568 / 390×844 / 844×390 실제 Chrome 측정에서 검사 항목 전부 통과(아래).

## 실행한 검증

```text
npm.cmd run typecheck: 통과
npm.cmd run lint: 통과
npm.cmd test: 112/112 통과 (신규 16건 포함)
npm.cmd run check:browser: 3뷰포트 전 항목 통과
git diff --check: 통과
```

## 실제 브라우저 검증

`scripts/browser-check.mjs`가 headless Chrome을 CDP로 몰아 실제 DOM에서 측정한다. 문자열 검사가 아니라 `getComputedStyle`, `getBoundingClientRect`, `elementFromPoint`, `document.activeElement`, `scrollWidth/clientWidth`를 읽는다.

| 화면 | 320×568 | 390×844 | 844×390 | 확인 내용 |
|---|---|---|---|---|
| 홈 | 통과 | 통과 | 통과 | 가로 스크롤 0, 학생 버튼이 최대 면적, 모든 목표 ≥44px |
| QR 입장 | 통과 | 통과 | 통과 | 코드 입력 없음, 3단계 표시, 목표 ≥44px |
| 직접 입장 | 통과 | 통과 | 통과 | 고정 CTA가 그림 버튼·칸을 가리지 않음, 3/3 뒤에도 다시 고르기 가능 |
| 틀린 비밀번호 | 통과 | 통과 | 통과 | ⚠️+🔊 표시, 다시 골라요 강조·≥44px, 한 번에 3칸 초기화, 오류 즉시 소거, 칩 재활성화 |
| 틀린 수업 코드 | 통과 | 통과 | 통과 | 코드 칸 강조, 선생님 불러요 ≥44px, 안내 표시 |
| 그리기 | 통과 | 통과 | 통과 | 가로 스크롤 0, 도화지 미절단, 중앙 미가림, 나가기 ≥44px, 모든 도구 도달 가능 |
| 그리미 시트 | 통과 | 통과 | 통과 | fixed 바텀시트, 화면 안, 첫 질문·선택지 즉시 노출, 한 번 스크롤로 확인 버튼, 닫기·탈출 상시 고정, 숨은 중첩 스크롤 0 |
| 소감 모달 | 통과 | 통과 | 통과 | 초점 진입, 배경 inert+aria-hidden, Escape 닫힘, opener 복귀, inert 해제 |
| iPad Safari | 미실시 | | | 실기기 없음 — Codex 확인 필요 |
| Android Chrome | 미실시 | | | 실기기 없음 — Codex 확인 필요 |

## 보안·데이터 영향

- 권한 경계: 변경 없음. 교사 소유권·학생 device token·가족 링크 범위 검사는 그대로 두고, 시도 횟수 제한만 IP 단독에서 IP+대상으로 분리했다.
- 개인정보: 새 필드 없음. 개인 복구 QR의 bfcache 노출 경로를 닫았고, 가족 세션 쿠키가 봇에게 발급되던 경로를 닫았다.
- D1 migration: 없음. `db/schema.ts`의 enum 값 추가는 타입 계약 교정이며 DDL을 바꾸지 않는다(런타임 DDL은 `db/runtime.ts`의 수기 SQL).
- R2: 변경 없음.
- 환경 변수: 변경 없음.

## 남은 위험

1. `strftime('%Y-%m-%dT%H:%M:%fZ','now')`로 새로 저장하는 `archived_at`은 ISO지만, **이전에 저장된 공백 구분 값이 D1에 남아 있다**. 교사 화면의 삭제 날짜 표시가 옛 행에서는 여전히 어긋난다. 데이터 백필은 운영 데이터 변경이라 하지 않았다.
2. 그리미 바텀시트는 화면을 덮는다. 시트를 연 채로 그림을 그릴 수 없고 닫아야 한다. 아이가 "닫기"를 학습해야 하는지는 실제 아동 검증이 필요하다.
3. 손바닥 거부는 "활성 포인터가 있으면 새 포인터 무시" 정책이다. 아이가 두 손가락으로 번갈아 그리려 하면 두 번째가 무시된다.
4. 스트로크 자동 분할(11,500점)은 undo 한 번이 그 조각만 되돌린다. 아주 긴 색칠에서 되돌리기가 잘게 나뉜다.
5. join 409 오라클은 완화(학급당 60회/10분)일 뿐 제거가 아니다. 완전 제거는 중복 경고 UX 재설계가 필요하다.
6. `sameOrigin()`은 Origin 헤더가 없으면 통과시킨다. 브라우저 경로에서는 CSRF가 성립하지 않지만 스크립트 직접 호출은 막지 않는다 — 별도 결정이 필요해 손대지 않았다.
7. AI 실호출 경로(`/api/ai/coaching`)는 로컬에 OpenAI 키가 없어 실제 응답으로 검증하지 못했다. 바텀시트 레이아웃은 실제 코칭 마크업을 주입해 측정했다.
8. 실기기(iPad Safari, Android Chrome) 검증과 실제 아동 검증은 하지 않았다.

## Codex가 독립적으로 확인할 항목

1. `lib/rate-limit.ts`의 원자 문장이 운영 D1(SQLite 3.x, RETURNING 지원)에서 기대대로 동작하는지 — 특히 창 만료 경계에서 카운터가 정확히 1회만 리셋되는지.
2. 초안 승인 batch의 새 순서가 운영 스키마에서 실제로 성공하는지, 동시 승인 2건에서 메시지가 1건만 남는지.
3. 가족 초대 확인 화면의 CSP(`form-action 'self'`)가 Sites 배포에서도 POST를 막지 않는지, GET에 Set-Cookie가 전혀 없는지.
4. `strftime(...)` 저장 값이 기존 ISO 컬럼들과 정렬·비교에서 일관된지, 옛 공백 구분 값과 섞였을 때의 영향.
5. 실기기 iPad Safari에서 바텀시트 `100dvh`·safe-area·주소창 변화 시 시트가 잘리지 않는지, `SpeakButton` 연속 탭이 실제 음성 엔진에서 상태와 일치하는지.
6. 손바닥 거부 정책이 실제 태블릿 필기에서 정상 입력을 놓치지 않는지.
7. 내가 추가한 `scripts/browser-check.mjs`의 검사가 거짓 양성이 아닌지 — 특히 `elementFromPoint` 기반 가림 판정과 inert 검사.
8. 감사에서 **반박된** 3건이 정말 문제가 아닌지 재확인: ChatGPT Sites 인증 헤더 신뢰(worker가 인바운드 헤더를 지우지 않음), undo/redo의 setState 중첩, FamilyView의 `navigator.share` 호출 시점.
