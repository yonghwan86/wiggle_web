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

## 어댑터 검증 게이트 (강화)

- `meta.changes` 매핑: CAS 가드 10곳(join·artworks 저장·coaching-store·teacher 삭제/복원 등)이 per-statement `meta.changes`에 의존 — libsql `rowsAffected`를 문장별로 정확히 매핑하고 실동작 테스트로 고정.
- `batch()` 원자성: 중간 문장 실패 시 전체 롤백을 Turso에서 실제 재현(가입 롤백 테스트가 이미 존재 — 하네스 포팅 후 그대로 통과해야 함).
- `PRAGMA table_info`·`sqlite_master` 조회(ensureSchema 업그레이드 경로) 동작 확인.
- PBKDF2 고정 벡터: workerd 테스트를 Node crypto 벡터로 포팅(같은 파라미터, 같은 결과).

## 운영 데이터 (가정 금지 — 조사 필수)

전환 전에 Codex(Sites 도구 접근 가능)로 실제 운영 D1/R2를 조사한다:

1. D1: teachers·classrooms·student_profiles·artworks 행 수.
2. R2: 객체 수·총 용량, D1 image key와의 대응.
3. 배포된 인쇄물·QR이 기존 Sites 도메인을 가리키는지, 도메인 전환 안내 필요 여부.
4. D1에 실데이터가 있으면 export → Turso import 절차 추가. R2는 유지하므로 이미지 이전은 없음.

## 테스트 전환

- 순수 로직 테스트(대부분)는 무수정 통과.
- Miniflare 부팅 통합 테스트(~10파일)는 `next dev` + 파일 libsql 하네스로 교체, 단언 유지.
- `contracts.test.mjs`의 D1/R2 선언 단언 → Turso 프로비저닝 + R2 S3 어댑터 계약 단언으로 재작성.
- `scripts/browser-check.mjs`는 URL 대상 CDP라 무수정 — 전환 기간 핵심 E2E.

## 단계와 게이트

1. **어댑터**: `@libsql/client`(+`aws4fetch`) 설치 → `db/adapters/turso-d1.ts`, `db/adapters/r2-s3.ts` → `db/runtime.ts` 교체. 게이트: typecheck + 위 어댑터 검증 게이트 전부.
2. **빌드 전환**: next.config(보안 헤더), scripts, worker/·vite.config 제거, tsconfig types 정리. 게이트: `next build` + 로컬 E2E(입장→그리기→저장).
3. **4.5MB 저장 분리**: 위 확정안 구현. 게이트: 3.5MB 완성본 실저장 + 오프라인 큐 회귀 테스트.
4. **테스트 하네스 포팅**: 전체 스위트 그린 + browser-check 3뷰포트 실패 0.
5. **교사 인증 교체** (사용자 결정 후).
6. **운영 데이터 조사·이전** (Codex) → **Vercel 연결**: repo import(사용자) → env(OPENAI_API_KEY·TURSO_DATABASE_URL·TURSO_AUTH_TOKEN·R2 S3 자격증명·플래그) → Preview 검증 → Production.
7. **문서·파이프라인 재정의**: CLAUDE.md·AGENTS.md를 GitHub+Vercel 흐름으로 교체.

## 열린 결정 (사용자)

1. **패키지 설치 승인**: `@libsql/client`(Turso 공식) + `aws4fetch`(경량 S3 서명, R2 접근용). 승인 즉시 1단계 시작.
2. **교사 인증 대체안**: 추천 Auth.js + Google 로그인. 5단계 전까지 확정.
3. **플랫폼 최종 확인**: Vercel 유지 추천(저장 분리 재작업 포함, git push 자동 배포). Replit 선택 시 3단계 생략 가능하나 배포 자동화·비용 조건이 다름.

## 사용자 실행 항목 (시점 되면 안내)

- Vercel 대시보드에서 repo import (6단계).
- Turso 무료 계정 + DB 1개 (6단계 전).
- R2 S3 API 토큰 발급 (Cloudflare 대시보드, 6단계 전).
- Codex에 운영 D1/R2 조사 지시 (6단계 전).
