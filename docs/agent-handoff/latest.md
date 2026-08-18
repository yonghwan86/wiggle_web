# Claude → Codex 개발 완료 보고

## 식별 정보

- 작업: 그림 별명 후보 동물별 10개 확대 + 별명 공백 무시 매칭(중복·자격정보·재입장·rate-limit)
- 브랜치: `claude/nickname-spacing-20260818` (base: `main` = `266a251`)
- 기준 커밋: `266a25159163aabbb5178a7d014969730a806ef8`
- 코드·보고서 커밋: 이 보고서를 포함한 단일 커밋 (marker 커밋의 부모, 정확한 SHA는 `latest.json`의 `candidateCommit`)

## 수정한 문제

- 동물별 그림 별명 후보가 2개뿐이라 `다른 별명` 주사위가 사실상 두 별명만 왕복했다.
- 별명의 공백 유무(`토끼 화가` vs `토끼화가`, 앞뒤·연속 공백)가 다른 별명으로 취급돼, 아이가 공백만 다르게 입력하면 재입장이 실패하고 사실상 같은 별명의 중복 프로필이 새로 생겼다. rate-limit 대상 키도 공백 변형마다 분리돼 있었다.

## 원인

- `NICKNAME_IDEAS`가 동물별 2개 하드코딩이었고, 주사위는 현재 별명 하나만 제외한 풀에서 뽑았다.
- 서버의 중복·자격정보·재입장 검색이 `nickname = ? COLLATE NOCASE` 원문 비교였고, `cleanText`는 연속 공백을 하나로 접을 뿐 공백 유무 차이는 남긴다. rate-limit 키도 원문 별명(`toLocaleLowerCase`)을 그대로 썼다.

## 변경 파일

- `lib/nickname-ideas.ts` (신규): 동물별 10개(전체 100개) 별명 후보와 `pickDifferentNickname` 주사위 로직. 후보는 한글 낱말만, 공백 무시 기준으로도 전체 중복 없음.
- `lib/nickname.ts` (신규): `nicknameMatchKey`(모든 공백 제거, 다른 문자는 비정규화), `nicknameRateKeyPart`(ko-KR 소문자 접기), `nicknameKeySql`(저장된 별명에서 공백·탭·개행·NBSP·전각 공백을 지우는 SQL 식 — migration 없이 기존 행 검색).
- `app/components/JoinClient.tsx`: 후보를 새 lib에서 import, 주사위를 `pickDifferentNickname`으로 교체. 레이아웃·CSS 변경 없음.
- `app/api/student/route.ts`: join 중복 후보 조회·원자적 INSERT 가드·삽입 실패 후 재확인·recover 후보 조회를 공백 무시 SQL 식으로, join/recover의 대상 rate-limit 키를 `nicknameRateKeyPart`로 변경.
- `app/api/teacher/route.ts`: 교사 화면의 `duplicateNickname` 표시도 같은 공백 무시 규칙으로 계산.
- `tests/nickname-spacing.test.mjs` (신규): 아래 6개 테스트.
- `tests/join-nickname-default.test.mjs`, `tests/classroom-entry-flow.test.mjs`: 새 구현에 맞춘 소스 검사식 갱신.
- `package.json`: 새 테스트 등록.
- `docs/current-state.md`, `docs/product-decisions.md`: 지속 컨텍스트 갱신 (결정 14·15 추가).

## 수정 전 재현

- 주사위: 후보 2개라 `토끼 화가` ↔ `깡총 별`만 반복.
- `토끼 화가`로 프로필 생성 후 `토끼화가`로 `내 그림 이어가기` → 401 (프로필을 못 찾음). 같은 입력으로 신규 생성 → 중복 차단 없이 두 번째 프로필 생성.

## 수정 후 결과

- 동물마다 10개 후보, 주사위는 현재 별명을 제외한 9개 전체에서 선택 (Miniflare·단위 테스트로 확인).
- `토끼화가`, `  토끼   화가  `, 탭 변형 모두 같은 student ID로 재입장. 공백 변형 신규 생성은 `PROFILE_EXISTS` 409, 같은 그림 비밀번호의 allowDuplicate는 `PROFILE_CREDENTIALS_EXIST` 409. 표시용 별명은 원래 띄어쓰기 그대로 반환.
- API를 거치지 않고 D1에 직접 넣은(=기존 DB를 흉내 낸) `아기 곰 화가` 행도 migration 없이 `아기곰화가`로 검색·재입장됨.
- `토기 화가` 같은 다른 한글 별명은 합쳐지지 않고 정상 생성됨.
- 공백 변형을 번갈아 써도 같은 brute-force 버킷(8회/15분)을 소비 — 9번째는 올바른 비밀번호·allowDuplicate 대조 경로 모두 429.

## 실행한 검증

```text
npm.cmd run typecheck: 통과
npm.cmd run lint: 통과
npm.cmd test: 전체 통과 (아래 숫자 참조)
git diff --check: 통과
git diff --check main...HEAD: 통과
node scripts/browser-check.mjs http://localhost:3001: 모든 브라우저 검증 통과 (실패 0)
```

- 전체 자동화 테스트 249/249 통과 (기존 243 + 신규 6).

## 실제 브라우저 검증

| 화면 | 결과 | 확인 내용 |
|---|---|---|
| 320×568 세로 | 통과 | `browser-check.mjs` 실측: 대문→선택→3단계 생성(별명 입력 포함)→이어가기 오류 복구→잘못된 코드→그리기·그리미·소감 전 항목 |
| 390×844 세로 | 통과 | 위와 동일 |
| 844×390 가로 | 통과 | 위와 동일 |
| iPad Safari | 미실행 | 실기기 없음. 이번 변경은 별명 후보 데이터·주사위 로직·서버 매칭만이며 레이아웃·CSS·마크업 구조 변경 없음 (가장 긴 새 후보 7자는 입력칸 16자 상한 이내) |
| Android Chrome | 미실행 | 위와 동일 |

- 주사위 연타·공백 변형 재입장의 동작 자체는 결정적 단위 테스트와 Miniflare 실동작 테스트(빌드된 worker 코드 대상)로 검증했다.

## 보안·데이터 영향

- 권한 경계: 비밀번호 검증(`verifySecret`)·세션 발급 로직은 변경 없음. 공백 무시로 후보 집합이 넓어져도 그림 비밀번호가 일치해야만 재입장된다. 공백 변형이 같은 rate-limit 버킷을 공유하므로 대상별 한도는 오히려 우회가 어려워졌다.
- 개인정보: 새 데이터 수집 없음. 별명 표시값은 그대로 유지.
- D1 migration: 없음. 스키마 무변경, 조회 시점 SQL 식(`REPLACE` 체인)으로 기존 행을 매칭.
- R2: 영향 없음.
- 환경 변수: 변경 없음.

## 남은 위험

- `duplicateNicknameCount` 서브쿼리와 join/recover 조회가 인덱스 대신 식 비교를 쓰므로 학급 규모(수십 명)에서는 문제없지만 매우 큰 테이블에서는 풀스캔 비용이 있다. 학급 단위 조건(`classroom_id`)이 먼저 걸려 실사용 규모에서는 무시 가능.
- 공백 무시로 이미 존재하는 "공백만 다른 중복 프로필" 쌍은 재입장 시 비밀번호로 구분된다. 비밀번호까지 같은 기존 쌍이 있다면 recover가 기존 동작대로 409(선생님 확인)로 안내한다.
- 3뷰포트 browser-check는 실패 0으로 통과했지만, 주사위 연타 시 별명 텍스트 변화 자체를 실제 브라우저 클릭으로 반복 확인하지는 않았다(결정적 단위 테스트로 대체). Codex 독립 검증에서 한 번 눌러 보는 것을 권장한다.

## Codex가 독립적으로 재현할 항목

- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `git diff --check`, `git diff --check main...HEAD`.
- `tests/nickname-spacing.test.mjs`의 Miniflare 시나리오: 공백 변형 재입장 동일 ID, 공백 변형 신규 생성 409, 직접 삽입한 기존 행 검색, 공유 rate-limit 버킷.
- 실제 브라우저에서 입장 화면 `다른 별명` 연타 시 같은 별명 즉시 반복·2개 왕복이 없는지, 신규 생성→공백 없는 별명 재입장이 같은 학생 홈을 여는지.
