# Claude → Codex 개발 완료 보고

## 식별 정보

- 작업: 학생 입장 재설계 통합 + 죽은코드·보안 정리 + browser-check 재작성
- 브랜치: `claude/entry-redesign-cleanup-20260818` (base: `main` = `1cafeed`)
- 기준 커밋: `1cafeed`
- 코드·보고서 커밋: `4eb95a1` → `48ecadb` → `c0c8cfc` → `10e4c0f` → `2df4509` (코드 5개), 이 문서 커밋

## 수정한 문제

이 브랜치는 서로 다른 두 세션의 작업을 검증 가능한 순서로 통합했다. `48ecadb`(입장 재설계)는 로컬 codex 세션이 개발했고, 나머지는 Claude가 감사·정리·수정했다.

1. **죽은 코드·보안 헤더·핫패스** (`4eb95a1`) — 미사용 코드·에셋 삭제(examples/d1, getDb, 스타터 svg, 1.6MB PNG, CSS 클래스 22종), drizzle-orm·@types/qrcode를 devDependencies로, 전 경로 `nosniff`+`referrer-policy` 및 랜딩 제외 `X-Frame-Options DENY`+`frame-ancestors 'none'`, teacher/family 이미지 base64 청크 변환, student GET 쿼리 병렬화.
2. **학생 입장 재설계** (`48ecadb`, codex 세션 개발분) — 기기 프로필 그리드·입장 시 개인 QR 노출·QR 3단계 위저드 제거. 모든 기기에서 학급 코드/QR → `entryStatus`(명단 비노출, hasProfiles만) → 새로 시작/이어가기 선택 → 동물·별명·그림 비밀번호 3개로 생성·재입장. 교사 카드에 작품 수·중복 별명 읽기 전용 표시. localhost 한정 교사 자동 로그인. 지속 컨텍스트 문서 3종 도입.
3. **비밀번호 확인 오라클 차단** (`c0c8cfc`) — 재설계의 `allowDuplicate` 중복 생성 분기가 기존 프로필 비밀번호와 대조하면서 대상별 한도를 소비하지 않아, 복구 경로의 8회/15분 상한을 우회해 IP·학급 한도(60회/10분)로 409 오라클 확인이 가능했다. 같은 대상 버킷(`recover:학급ID:소문자별명:동물`)을 소비하게 하고 Miniflare 실동작 회귀 테스트 추가.
4. **구 흐름 죽은 CSS 정리** (`10e4c0f`) — 재설계로 고아가 된 CSS 14종(profile-grid/button/unlock, qr-step/dots, password-preview, personal-card, saved-profile-notice, success-mark, input-error, student-footer, entry-card.wide, qr-code-personal, welcome-title-row 조각) 제거. 동적 조립 클래스(stage-1~4, qr-code-teacher/large)는 사용처 확인 후 유지.
5. **browser-check 재작성 + 실측 결함 수정** (`2df4509`) — 스크립트가 구 UI 전제로 크래시하던 것을 새 흐름(대문 코드 4칸 → 선택 화면 → 3단계 폼 → 이어가기 오류 복구 → 잘못된 코드 → 겹침 검사)으로 재작성. 실측으로 드러난 결함 수정: mobile-tool-peek이 도구·그리미 위를 가림(도구 보이면/그리미 열리면 숨김, observer는 artwork 로드 후 attach), 44px 미달 5종(교사 링크 42, 입장 방법 다시 고르기 38/42, 가로 코드 칸 40, 가로 전체 지우기 40).

## 원인

- 오라클: 새 분기가 recover와 같은 비밀을 검증하면서 rate-limit 키 체계에 편입되지 않음.
- browser-check 크래시: UI 재설계와 검증 스크립트가 같은 커밋에서 함께 갱신되지 않음.
- peek 가림: 플로팅 버튼에 "목적지가 이미 보이면 숨김" 조건이 없었고, 로딩 분기 때문에 mount 시 ref가 비어 관찰이 시작되지 않는 함정이 있었음.

## 변경 파일

44개 파일, +1,947/−431. 주요:

- `app/api/student/route.ts` — entryStatus, 중복 자격정보 차단+대상별 한도, recover 학급 스코프, GET 병렬화
- `app/api/teacher/route.ts` — 학생 집계 확장, localhost 자동 로그인, 이미지 청크 변환
- `app/components/JoinClient.tsx` — 입장 재설계 본체 / `TeacherApp.tsx` — 프로필 정보 확장
- `app/components/DrawingStudio.tsx` — mobile-tool-peek 조건부 렌더 + IntersectionObserver
- `worker/index.ts` — 전 경로 보안 헤더 / `lib/speech.ts` — 한국어 음성 선택
- `app/globals.css` — 재설계 CSS + 죽은 규칙 제거 + 44px 보정 (383→새 구성)
- `scripts/browser-check.mjs` — 새 흐름 재작성 / `tests/classroom-entry-flow.test.mjs` — 신규(+오라클 실동작 테스트)
- 삭제: `examples/d1/**`, `db/index.ts`, 스타터 svg 4종, `landing-classroom.png`
- 문서: `docs/current-state.md`(신규)·`product-decisions.md`(신규)·`pending-decisions.md`(신규)·`security-data-model.md`·CLAUDE.md·AGENTS.md·README.md

## 수정 전 재현

- browser-check: `node scripts/browser-check.mjs` → 288행 부근 `Cannot read properties of undefined (reading 'click')` 크래시 (구 UI 셀렉터).
- 오라클: 학급 코드·별명·동물을 아는 클라이언트가 `action:"join", allowDuplicate:true`를 IP를 바꿔 가며 60회/10분씩 보내 `PROFILE_CREDENTIALS_EXIST`(409) 여부로 비밀번호 일치를 확인한 뒤 recover 1회로 세션 획득.
- 320×568: 도구 패널로 스크롤해도 "🎨 색·지우개·되돌리기 ↓" 플로팅 버튼이 전체 지우기를 덮어 탭 불가.

## 수정 후 결과

- browser-check 3뷰포트 전 항목 통과(실패 0). 기준선은 재설계 전 실패 18건 + 재설계 후 크래시였다.
- 오답 8회 뒤 9번째 확인·recover 우회가 IP를 바꿔도 429, 프로필 수 증가 정지(자동 테스트로 고정).
- 모든 실측 터치 목표 ≥44px, 가로 스크롤 0, 도구·닫기·탈출 버튼 가림 0.

## 실행한 검증

```text
npm.cmd run typecheck: 통과
npm.cmd run lint: 통과
npm.cmd test: 243/243 통과 (빌드 포함, Miniflare 실동작 테스트 포함)
git diff --check: 통과
node scripts/browser-check.mjs http://localhost:3001: 모든 브라우저 검증 통과 (실패 0)
```

## 실제 브라우저 검증

| 화면 | 결과 | 확인 내용 |
|---|---|---|
| 320×568 세로 | 통과 | 대문→선택→3단계 생성→이어가기 오류 복구→잘못된 코드→그리기·그리미·소감 전 항목 |
| 390×844 세로 | 통과 | 위와 동일 + 실UI 클릭으로 입장→학생 홈 E2E(별도 세션 확인) |
| 844×390 가로 | 통과 | 위와 동일 (44px 보정 반영) |
| iPad Safari | 미실행 | 실기기 없음 — `--ipad` 모드는 Codex 재량으로 실행 |
| Android Chrome | 미실행 | 실기기 없음 |

## 보안·데이터 영향

- 권한 경계: 오라클 차단으로 강화. entryStatus는 학급명+프로필 존재 1비트만 반환(명단·인원 비노출), IP 한도 적용. 소유권 조건 변경 없음.
- 개인정보: 입장 시 개인 QR 토큰을 더 이상 응답에 포함하지 않음(교사 재발급 경로만). 신규 수집 없음.
- D1 migration: 없음 (스키마 변경 없음).
- R2: 없음.
- 환경 변수: 없음. localhost 자동 교사 로그인은 `NODE_ENV!==production`+localhost 게이트 안에서만 동작.

## 남은 위험

- `public/brand/animal-portraits-v1/v2.png`(3.6MB)가 `asset-manifest.json` 출처 정책에 미등재. 출처 확인 후 등재 필요.
- browser-check가 로컬 D1에 만든 `브라우저 점검반` 학급이 실행마다 누적(로컬 전용, 운영 무관).
- `--ipad`·`--desktop` 모드는 이번에 재실행하지 않음(기본 3뷰포트만 통과 확인). 넓은 화면 검증은 codex 세션이 7뷰포트 좌표 검증으로 수행했다고 `docs/current-state.md`에 기록돼 있음.
- 실기기(iOS Safari·Android Chrome)와 실제 아동 검증은 여전히 미실행 — 출시 판정 기준은 그대로 NO-GO 유지.

## Codex가 독립적으로 재현할 항목

1. `npm.cmd run typecheck && npm.cmd run lint && npm.cmd test && git diff --check`
2. `npm.cmd run dev` 후 `node scripts/browser-check.mjs http://localhost:<포트>` — 실패 0 확인
3. 오라클 회귀: `tests/classroom-entry-flow.test.mjs`의 "duplicate-credential probing" 테스트가 실동작(Miniflare)인지, 문자열 검사가 아닌지 확인
4. `/join?code=<유효코드>`에서 새로 시작→3단계 생성→학생 홈, 이어가기→틀린 비밀번호→🔄 다시 골라요 복구를 실제 브라우저로 재현
5. 보안 헤더: `/student` 응답에 `X-Frame-Options: DENY`·`frame-ancestors 'none'`·`nosniff`, `/`에는 프레임 차단 제외 확인
6. base(`1cafeed`)와 후보 사이 전체 diff의 권한 경계·비밀값 검토
