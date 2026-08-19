# Vercel 재플랫폼 계획 v2 (2026-08-18)

사용자 결정: 개발은 이 폴더에서, 코드는 GitHub(`yonghwan86/wiggle_web`), 공개 배포는 Vercel(`yonghwan86s-projects`)로 전환한다. ChatGPT Sites + Codex 게이트 파이프라인은 이 전환이 끝나면 은퇴한다.

v2 변경: ChatGPT 독립 검토(2026-08-18)를 코드로 재확인해 반영 — ① R2 유지(S3 API)로 변경, Turso BLOB안 철회 ② Vercel 4.5MB 요청 한도 대응 추가 ③ Cloudflare Images/next-image 서술 정정 ④ 운영 데이터 "없음 가정" 철회 ⑤ 어댑터 검증 게이트 강화.

## 불변 원칙 (조정 대상 아님)

- 제품 불변 원칙 전부 유지: 익명 학생 ID, 학생 이메일·실명 금지, 수업 코드는 입장 수단일 뿐 권한 아님.
- API 계약·URL 경로·응답 형식 유지. 예외는 4.5MB 대응의 저장 분리 1건뿐이며, 그 경우에도 오프라인 큐·409(REVISION_CONFLICT) 계약·권한 검사 위치는 유지한다.
- 보안 강도 유지: PBKDF2-SHA256 100k, 토큰 SHA-256 해싱, 대상별·IP·학급 rate limit, 보안 헤더, 소유권 검사 위치.
- 아이 그림은 공개 URL로 노출하지 않는다 — 학생 인증을 거친 서버 스트리밍 유지 (public Blob·공개 버킷 금지).
- 스키마(테이블·컬럼)와 저장 데이터 형식(ops_json 등) 유지.

## 확정 교체 맵

| 계층 | 지금 (Cloudflare) | 이후 | 근거 |
|---|---|---|---|
| 프레임워크·런타임 | vinext 0.0.50 + workerd Worker | Next.js 16 (이미 dependencies에 있음) + Vercel Node 런타임 | 앱 코드가 이미 표준 App Router + `next/*` 임포트. `next/image` 사용처 0건이라 프런트 수정 없음 |
| DB | D1 (`bindings().DB`) | **Turso(libSQL)** + D1 호환 어댑터 | SQLite 문법 보존. 호출부(38 prepare / 27 run / 20 first / 5 all / 3 batch) 무수정 — 단 어댑터 자체는 아래 검증 게이트 필수 |
| 그림 저장소 | R2 `ARTWORKS` 바인딩 (put/get/delete) | **기존 R2 유지 + S3 호환 어댑터** (`aws4fetch` 서명, 경량) | R2는 S3 API로 어느 호스트에서든 접근 가능 → 이미지 데이터 이전 불필요, 객체 저장소 유지. ~~Turso BLOB 테이블~~ 철회: `artwork_versions`가 버전마다 image_key를 쌓아 MB 바이너리가 DB에 누적되는 구조 |
| 이미지 처리 | worker의 `/_vinext/image` 옵티마이저 + IMAGES 바인딩 | **삭제 (대체 없음)** | 학생 작품은 브라우저 생성 PNG를 그대로 저장·전달하며 Cloudflare Images를 쓰지 않음. 앱은 `<img>`+CSS 배경만 사용, `next/image` 도입 불필요(인증 이미지에 부적합하기도 함) |
| 음성 릴레이 | `WHISPER_RELAY` 서비스 바인딩 | `WHISPER_RELAY_URL` env + fetch 어댑터 | 기능 플래그 기본 off — 저우선 |
| 보안 헤더 | worker fetch 래퍼 | `next.config.ts` `headers()` 경로별 규칙 | 랜딩만 frame 허용 등 동일 재현 |
| 교사 인증 | ChatGPT SIWC 헤더 (Sites 전용) | **미결 — 사용자 결정 필요** | Vercel/Replit 어디에도 SIWC 헤더 없음. 추천: Auth.js + Google |
| 정적 에셋 | ASSETS Fetcher | Next 정적 서빙 | 자동 |

## Vercel 4.5MB 요청 한도 대응 (필수 재작업)

현재 완성 저장은 한 JSON 요청에 썸네일(≤500KB→b64 ~667KB) + 완성 PNG(≤3.5MB→b64 ~4.67MB) + ops_json + 소감을 담는다([app/api/artworks/[id]/route.ts:70]). 완성본 base64만으로 Vercel Functions 요청 한도 4.5MB를 초과 → 큰 작품 완성 저장이 실패한다.

**대응(확정)**: 완성 이미지를 별도 요청으로 분리하고 base64 대신 **raw 바이너리 본문**(3.5MB < 4.5MB)으로 올린다.

1. `PUT /api/artworks/[id]/image?kind=final` 신설 — 같은 학생 인증·소유권 검사, `image/png` 바이너리 본문, candidate 키로 R2 저장 후 키 반환.
2. 완성 저장 JSON은 이미지 대신 후보 키(+요청 ID)를 참조 — 기존 CAS·mutation·보상 삭제 흐름 유지.
3. 오프라인 큐는 이미지와 문서를 분리 보관하도록 갱신(큐 스키마 마이그레이션 포함), 재전송 순서는 이미지 → 완성 JSON.
4. 썸네일(≤667KB b64)은 당분간 인라인 유지 — 총합이 한도 안이면 변경 최소화.
- presigned 직접 업로드는 후속 최적화 옵션으로 남긴다(CORS·키 스코프 추가 설계 필요). 지금 방식이 오프라인 큐·권한 모델을 그대로 보존한다.
- 참고: Replit(일반 Node 서버)에는 이 한도가 없어 이 재작업 없이도 동작한다 — 플랫폼 재결정 시 유일한 실질 차이.

## 클라이언트 IP 신뢰 (필수 보안 재작업) ✅ 완료(2026-08-19)

Cloudflare 시대 코드는 5개 경로에서 `cf-connecting-ip`를 최우선으로 신뢰했다(student·teacher·family invite/session/token). 이 헤더는 **Cloudflare 엣지가 덮어써 주기 때문에** 신뢰할 수 있었던 값이고, Vercel에는 그 대리인이 없다. 그대로 배포하면 요청마다 `cf-connecting-ip`에 아무 값이나 넣는 것만으로 IP 단위 상한이 전부 무력화된다 — 그림 비밀번호 8회/15분 추측 방어와 학급 입장 상한이 함께 뚫린다.

**대응**: 판정을 의존성 0 모듈 `lib/client-ip.ts`의 `clientIp()` 한 곳으로 모으고, 플랫폼이 채우는 헤더만 신뢰한다 — `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for`(첫 항목) → `"local"`. `cf-connecting-ip`는 앱 코드에서 완전히 제거했다. 회귀 방지는 `tests/security-regressions.test.mjs`의 "rate-limit buckets ignore the spoofable Cloudflare IP header"가 맡는다(동작 단언 + 5개 경로 전수 부재 확인).

## 어댑터 검증 게이트 (강화)

- `meta.changes` 매핑: CAS 가드 10곳(join·artworks 저장·coaching-store·teacher 삭제/복원 등)이 per-statement `meta.changes`에 의존 — libsql `rowsAffected`를 문장별로 정확히 매핑하고 실동작 테스트로 고정.
- `batch()` 원자성: 중간 문장 실패 시 전체 롤백을 Turso에서 실제 재현(가입 롤백 테스트가 이미 존재 — 하네스 포팅 후 그대로 통과해야 함).
- `PRAGMA table_info`·`sqlite_master` 조회(ensureSchema 업그레이드 경로) 동작 확인.
- PBKDF2 고정 벡터: workerd 테스트를 Node crypto 벡터로 포팅(같은 파라미터, 같은 결과).

## 운영 데이터 (확정: 이전 없음 — 신규 시작)

2026-08-19 사용자 최종 결정: **운영 데이터를 이전하지 않는다.** 새 서버는 빈 Turso에서 `ensureSchema()` 자가 프로비저닝으로 시작하고, 구글 로그인 → 학급 생성 → 수업 코드 → 학생 입장 → 그림 저장 흐름으로 새로 연다(이 전 구간은 로컬 E2E로 실동작 확인 완료).

- 조사 결과(실사용 학생 22+·작품 29+, `operational-data-audit-20260819.md`)는 근거 문서로 유지한다.
- **안전장치: 기존 Sites 배포(v32)와 그 D1/R2는 삭제하지 않고 보존한다.** 과거 작품이 필요해지면 Sites 화면에서 열람·수동 회수할 수 있다. Sites 프로젝트 폐기는 사용자 명시 승인 없이는 수행하지 않는다.
- 권장(선택): Sites를 완전히 접기 전에 완료 작품 7점을 교사 화면에서 수동 저장해 보관.
- 이 결정으로 선별 시트·선택분 export·Turso 반입 스크립트·R2 추출 경로 문제는 전부 폐기(불필요)한다.
- 인쇄된 QR·링크는 기존 Sites 도메인을 가리킨다 — 새 도메인 전환 시 교사에게 새 주소·수업 코드 재안내가 필요하다.

## 테스트 전환

- 순수 로직 테스트(대부분)는 무수정 통과.
- Miniflare 부팅 통합 테스트(~10파일)는 `next dev` + 파일 libsql 하네스로 교체, 단언 유지.
- `contracts.test.mjs`의 D1/R2 선언 단언 → Turso 프로비저닝 + R2 S3 어댑터 계약 단언으로 재작성.
- `scripts/browser-check.mjs`는 URL 대상 CDP라 무수정 — 전환 기간 핵심 E2E.

## 단계와 게이트

1. **어댑터** ✅ 완료(2026-08-18): `@libsql/client`+`aws4fetch` 설치, `db/adapters/turso-d1.ts`(PRAGMA→pragma_table_info 심 포함), `db/adapters/artworks-store.ts`(S3 + 로컬 파일 폴백), `db/runtime.ts` 교체. 어댑터 계약 테스트 6종(meta.changes·batch 원자성 롤백·PRAGMA 심·저장소 왕복·키 탈출 차단) 실동작 통과.
2. **빌드 전환** ✅ 완료(2026-08-18): next.config(경로별 보안 헤더 재현+devIndicators off+serverExternalPackages), scripts를 next dev/build/start로 교체. `next build` 성공, 전환기 테스트 201개 통과, browser-check 3뷰포트 "모든 브라우저 검증 통과", 경로별 보안 헤더 curl 실측 일치. worker/·vite.config·vinext 의존성 제거는 4단계 하네스 포팅과 함께 정리.
3. **4.5MB 저장 분리** ✅ 완료(2026-08-19): 완성 PNG를 raw 바이너리 별도 업로드(`PUT /api/artworks/[id]/image?kind=final`, 후보 키)로 분리하고 완성 JSON은 키만 참조. 분리는 전송 계층(`flushSaves`+`lib/save-transmit.ts`)에서만 일어나 큐 스키마·DrawingStudio 무수정, 온라인·오프라인 재전송 동일 경로. 키는 학생·작품 프리픽스 강제 + 저장소 head 실측으로 검증. 게이트: `scripts/check-large-save.mjs`로 3.4MB 실저장·회수·경계(남의 키/유령 키 413) 통과, 완성 JSON 435바이트, 전 스위트·browser-check 통과.
4. **테스트 하네스 포팅** ✅ 완료(2026-08-19): Miniflare 10파일 + wrangler 기반 legacy-migration까지 11파일을 Next 하네스로 포팅(단언 보존). 하네스는 `tests/harness/` 4종 — `db.mjs`(D1 호환 파일 libsql, `createTestDb`/`createSchemaDb`/`resetRows`), `server.mjs`(`next start` 프로세스 + 전용 파일 DB·작품 디렉터리, origin 자동 부착), `alias-hooks.mjs`+`register.mjs`(`@/` 별칭·server-only 해석). `ensureSchema`를 `provisionSchema(DB)`로 분리해 테스트가 정본 스키마 경로를 재사용. 이때 Workers 잔재 일괄 정리: `worker/`·`vite.config.ts`·`wrangler.local.jsonc`·`build/sites-vite-plugin.ts` 삭제, devDependencies 7종 제거(vinext·wrangler·vite 계열·react-server-dom-webpack — `@cloudflare/workers-types`는 어댑터 계약 타입이라 유지), `scripts/init-local-db.mjs`를 provisionSchema 기반으로 재작성. 게이트: `npm test` 268/268(exit 0 직접 확인), typecheck·lint 클린, browser-check 3뷰포트 "모든 브라우저 검증 통과".
5. **교사 인증 교체** ✅ 코드 완료(2026-08-18, 실왕복 검증 대기): 구글 OAuth 코드 플로우(PKCE S256, state 상수시간 비교, 미검증 이메일 거부)를 자체 구현해 기존 teacher_sessions 재사용 — 새 패키지 0개. SIWC(oai-* 헤더) 신뢰 경로는 Sites 밖에서 헤더 위조로 임의 교사 로그인이 가능해 완전 제거. 게이트: 단위 테스트 7종 + security-regressions 재작성 + 전 스위트·browser-check 통과 + env 미설정 시 503 fail-closed 실측. 실제 구글 왕복은 사용자의 OAuth 클라이언트 생성 후 실측.
6. **Vercel 연결** (데이터 이전 없음): repo import(사용자) → env(OPENAI_API_KEY·TURSO_DATABASE_URL·TURSO_AUTH_TOKEN·R2 S3 자격증명·GOOGLE_CLIENT_ID/SECRET·플래그) → Preview 검증(빈 DB 자가 프로비저닝 확인 포함) → Production.
7. **문서·파이프라인 재정의**: CLAUDE.md·AGENTS.md를 GitHub+Vercel 흐름으로 교체.

## 남은 위험 (전환기)

- ~~Miniflare 통합 테스트 10개 보류~~ ✅ 해소(2026-08-19): 4단계 완료로 전부 새 하네스에서 실행된다. `npm test`가 `tests/*.test.mjs` 전체(268개)를 돌리고, 무거운 HTTP 통합만 따로 돌리려면 `npm run test:integration`. student-join-atomic의 batch 원자성(트리거 강제 실패 → 선행 INSERT 롤백)이 Turso 어댑터에서 D1과 동일함을 실측 확인.
- browser-check의 390×844 핀치 확대 1항목은 SKIP: next dev + CDP 환경에서 이 뷰포트만 해당 지점의 터치 이벤트가 페이지에 0건 도달(마우스·형제 뷰포트 정상, 페이지 스케일 1, 터치 재무장·리셋 무효). 핀치 로직은 320×568·844×390 실디스패치와 단위 테스트 2종으로 커버. 6단계 배포 검증에서 실기기로 재확인.
- ~~PRAGMA 심·batch 원자성의 원격 Turso 재검증~~ ✅ 해소(2026-08-19): 사용자 계정의 원격 Turso(`libsql://`)에 직접 붙어 PRAGMA 재작성(cid/name/type/notnull/dflt_value/pk), batch 원자성(PK 충돌 시 선행 INSERT 롤백), 문장별 `meta.changes`, intMode=number를 실측 통과. 같은 DB에 `provisionSchema`로 테이블 23종·인덱스 22개·`artwork_mutations` 복합 PK까지 생성 확인 — 빈 Turso 자가 프로비저닝이 성립한다.
- ~~R2 자격증명·저장소 왕복~~ ✅ 해소(2026-08-19): 사용자 계정의 신규 버킷 `wiggle-artworks`에 S3 어댑터로 3.4MB PNG 업로드→head→회수(340만 바이트 전수 일치, content-type·customMetadata 보존)→삭제→404 확인. 서명 없는 GET은 400(113바이트 오류 XML)으로 차단되어 아이 그림의 공개 URL이 없음을 실측. 검증 후 버킷은 0객체로 정리.
- **운영 자격증명은 `.env.local`에 `# vercel-only:` 주석으로 보관한다.** 활성 상태로 두면 로컬 dev·테스트가 운영 Turso/R2를 문다(2026-08-19 실제 발생: 로컬 검증이 원격 DB에 테스트 행 기록). 6단계에서 Vercel 대시보드에 넣을 값의 원본으로만 쓴다.
- 구글 로그인 실왕복(구글 → 콜백 → 교사 세션)은 사용자의 OAuth 클라이언트 생성 대기 — 생성 즉시 로컬에서 실측한다. 리디렉션 URI는 정확 일치가 필요하므로 실측 시 dev 서버 포트를 3000에 고정한다.

## 열린 결정 (사용자)

1. **패키지 설치 승인**: `@libsql/client`(Turso 공식) + `aws4fetch`(경량 S3 서명, R2 접근용). 승인 즉시 1단계 시작.
2. **교사 인증 대체안**: 추천 Auth.js + Google 로그인. 5단계 전까지 확정.
3. **플랫폼 최종 확인**: Vercel 유지 추천(저장 분리 재작업 포함, git push 자동 배포). Replit 선택 시 3단계 생략 가능하나 배포 자동화·비용 조건이 다름.

## 사용자 실행 항목 (시점 되면 안내)

- ~~Turso 무료 계정 + DB 1개~~ ✅ 완료(2026-08-19), 원격 검증까지 통과.
- ~~R2 S3 API 토큰 발급~~ ✅ 완료(2026-08-19): 버킷 `wiggle-artworks`, 계정 토큰 권한은 Object Read & Write, 범위는 해당 버킷 한정.
- 구글 OAuth 클라이언트 생성 (5단계 실왕복 검증에 필요) — 리디렉션 URI는 로컬 실측용 `http://localhost:3000/api/auth/google/callback`과 배포용 Vercel 도메인 둘 다 등록.
- Vercel 대시보드에서 repo import (6단계) — **env를 준비한 뒤에 import한다.** 먼저 import하면 자격증명 없는 첫 배포가 500을 노출한다.
