# Vercel 재플랫폼 계획 (2026-08-18)

사용자 결정: 개발은 이 폴더에서, 코드는 GitHub(`yonghwan86/wiggle_web`), 공개 배포는 Vercel(`yonghwan86s-projects`)로 전환한다. ChatGPT Sites + Codex 게이트 파이프라인은 이 전환이 끝나면 은퇴한다.

## 불변 원칙 (조정 대상 아님)

- 제품 불변 원칙 전부 유지: 익명 학생 ID, 학생 이메일·실명 금지, 수업 코드는 입장 수단일 뿐 권한 아님.
- API 계약·URL 경로·응답 형식 유지 — 클라이언트 코드는 손대지 않는다.
- 보안 강도 유지: PBKDF2-SHA256 100k, 토큰 SHA-256 해싱, 대상별·IP·학급 rate limit, 보안 헤더(nosniff·frame 차단), 소유권 검사 위치.
- 아이 그림은 공개 URL로 노출하지 않는다 — 반드시 학생 인증을 거친 서버 스트리밍 유지.
- 스키마(테이블·컬럼)와 저장 데이터 형식(ops_json 등) 유지.

## 확정 교체 맵

| 계층 | 지금 (Cloudflare) | 이후 (Vercel) | 근거 |
|---|---|---|---|
| 프레임워크·런타임 | vinext 0.0.50 + workerd Worker | Next.js 16 (이미 dependencies에 있음) + Vercel Node 런타임 | 앱 코드가 이미 표준 App Router + `next/*` 임포트 |
| DB | D1 (`bindings().DB`) | **Turso(libSQL)** + D1 호환 어댑터 | SQLite 문법 보존 → raw SQL 38곳·`ensureSchema()` DDL 무수정. Postgres였으면 전부 방언 수정 |
| 그림 저장소 | R2 `ARTWORKS` (put/get/delete 3개 API) | **Turso BLOB 테이블**(`artwork_blobs`) + R2 호환 어댑터 | 비공개 유지(공개 URL 금지 원칙), 추가 계정·서비스 0개. 출시 전 용량 소규모. 용량 커지면 S3 호환 비공개 버킷으로 어댑터만 교체 |
| 이미지 리사이즈 | Cloudflare IMAGES 바인딩 + vinext 최적화 라우트 | next/image 내장 최적화 | worker/index.ts 삭제로 함께 제거 |
| 음성 릴레이 | `WHISPER_RELAY` 서비스 바인딩 | `WHISPER_RELAY_URL` env + fetch 어댑터 | 기능 플래그 기본 off — 저우선 |
| 보안 헤더 | worker fetch 래퍼에서 부착 | `next.config.ts` `headers()` | 경로별 규칙(랜딩만 frame 허용) 동일 재현 |
| 교사 인증 | ChatGPT SIWC (`oai-authenticated-user-*` 헤더, Sites 전용) | **미결 — 사용자 결정 필요** (아래) | Vercel에는 SIWC 헤더가 없음 |
| 정적 에셋 | ASSETS Fetcher | Next 정적 서빙 | 자동 |

핵심 설계: `db/runtime.ts`가 유일한 바인딩 관문이므로, `D1Database`·`R2Bucket` **타입**(@cloudflare/workers-types, 타입 전용이라 런타임 0)을 유지한 채 내부 구현만 Turso 어댑터로 바꾼다. 38개 `prepare` / 27 `run` / 20 `first` / 5 `all` / 3 `batch` 호출부는 한 줄도 수정하지 않는다.

## 데이터 이전

없음. 출시 전(NO-GO, 실사용자 없음)이므로 Turso를 빈 상태에서 `ensureSchema()` 자가 프로비저닝으로 시작한다. Sites 쪽 D1에 보존할 학급·그림이 있으면 이 계획을 수정한다 (사용자 확인 대기 — 기본 가정: 없음).

## 테스트 전환

- 37개 테스트 파일 중 순수 로직 테스트(대부분)는 무수정 통과.
- Miniflare로 `dist/server`를 부팅하는 통합 테스트(~10파일)는 `next dev` + 파일 기반 libsql로 하네스 교체. 단언 내용은 유지.
- `pbkdf2-runtime.test.mjs`: workerd 고정 벡터 → 같은 파라미터의 Node crypto 벡터(결과 동일해야 함).
- `contracts.test.mjs`의 "declares D1 and R2" 단언 → Turso 스키마 프로비저닝 단언으로 재작성.
- `scripts/browser-check.mjs`는 URL 대상 CDP라 무수정 — 전환 기간의 핵심 E2E 안전망.

## 단계와 게이트

1. **어댑터**: `@libsql/client` 설치 → `db/adapters/turso-d1.ts`(D1 호환), `db/adapters/turso-artworks.ts`(R2 호환 BLOB 저장) → `db/runtime.ts` 교체. 게이트: typecheck + 어댑터 단위 테스트.
2. **빌드 전환**: next.config(보안 헤더·이미지), scripts(dev/build/start→next), worker/·vite.config 제거, tsconfig types 정리, vinext·@cloudflare/vite-plugin·wrangler 제거. 게이트: `next build` 성공 + 로컬 `next dev`에서 학생 입장→그리기→저장 E2E.
3. **테스트 하네스 포팅**: 전체 스위트 그린. 게이트: 249개(재작성분 포함) 통과 + browser-check 3뷰포트 실패 0.
4. **교사 인증 교체** (사용자 결정 후): SIWC 제거, 대체 인증. 게이트: 교사 로그인→학급 관리 E2E + 권한 경계 테스트.
5. **Vercel 연결**: 사용자가 대시보드에서 repo import → env 설정(OPENAI_API_KEY, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, 플래그) → Preview 배포 검증 → Production. 게이트: 배포 URL에서 browser-check + 보안 헤더 확인.
6. **문서·파이프라인 재정의**: CLAUDE.md·AGENTS.md의 Codex/Sites 규칙을 GitHub+Vercel 흐름으로 교체, current-state 갱신.

## 열린 결정 (사용자)

1. **`@libsql/client` 설치 승인** — Turso 공식 클라이언트(오픈소스, libSQL 팀 관리). 이게 승인되면 1단계 즉시 시작.
2. **교사 인증 대체안** — 추천: Auth.js + Google 로그인(교사가 구글 계정으로 로그인, 비밀번호 저장 없음, teachers.email 그대로 사용). 대안: 자체 이메일+비밀번호(추가 서비스 없음, 대신 재설정 메일 발송 수단 필요). 4단계 전까지만 정하면 됨.

## 사용자 실행 항목 (시점 되면 안내)

- Vercel 대시보드에서 `yonghwan86/wiggle_web` repo import (5단계).
- Turso 무료 계정 생성 + DB 1개 (1단계 끝나고 로컬 검증은 파일 DB로 하므로 5단계 전까지면 됨).
