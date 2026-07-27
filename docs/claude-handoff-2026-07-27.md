# Wiggle Web 개발 인수인계

작성일: 2026-07-27  
인수 대상: Claude Code 개발 에이전트  
검증·배포 담당: Codex  
기준 Git 상태: `main` / `bd639c5`  
GitHub: https://github.com/yonghwan86/wiggle_web  
현재 공개 URL: https://wiggle-classroom-web.chan1940.chatgpt.site
현재 공개 기준: Sites version 17 / commit `bd639c5`

## 1. 인수 목적

Claude는 앞으로 기능 구현과 결함 수정을 담당한다. Codex는 Claude가 만든 커밋을 독립적으로 검토하고, 자동 테스트와 실제 브라우저 검증을 다시 수행한 뒤에만 Sites에 배포한다.

이 문서는 제품 브리프 전체를 반복하지 않고, 현재 코드 상태에서 안전하게 다음 개발을 시작하는 데 필요한 사실을 정리한다.

## 2. 제품 한 문장

설치와 학생 이메일 없이 교실에 들어온 초등 저학년 아이가 선·도형부터 관찰·창작까지 배우고, 요청형 AI와 교사의 도움을 받아 그림의 생각을 말과 이야기로 발전시키는 그림 학습 웹앱이다.

## 3. 절대 바꾸지 않을 결정

1. Flutter 앱과 웹앱은 별도 저장소다.
2. `wiggle_draw`는 읽기 전용 제품 참고 자료다.
3. 수업 코드와 학급 QR은 입장 수단일 뿐 작품 접근 권한이 아니다.
4. 학생 기록은 서버가 발급한 익명 학생 ID에 저장한다.
5. 학생 이메일, 실명, 학교명, 점수, 순위, 재능 판정을 수집하거나 만들지 않는다.
6. AI 호출과 API 키는 서버에만 둔다.
7. AI는 그림을 대신 완성하지 않고 아이가 호출할 때만 돕는다.
8. AI가 그림을 확신하지 못하면 추측하지 않고 질문한다.
9. 질문은 한 번에 하나, 문장은 짧고 쉬워야 한다.
10. 점선·연필 시범은 별도 가이드 캔버스에 렌더링하며 작품 데이터와 최종 PNG에 포함하지 않는다.
11. 아이는 언제든 가이드를 숨기거나 자유 그리기로 나갈 수 있다.
12. 공개 SNS, 좋아요 경쟁, 학급 순위는 초기 제품 범위가 아니다.

## 4. 현재 기술 구성

| 영역 | 현재 구현 |
|---|---|
| 프레임워크 | Next.js 16.2.6, React 19.2.6, TypeScript |
| 배포 빌드 | vinext + Vite + Cloudflare Worker 호환 ESM |
| 데이터베이스 | Sites D1 논리 바인딩 `DB`, Drizzle schema/migrations |
| 파일 저장 | Sites R2 논리 바인딩 `ARTWORKS` |
| AI | 서버 전용 OpenAI Responses 호출, strict JSON schema |
| 교사 운영 인증 | production에서 Sites가 전달하는 ChatGPT 사용자 인증 |
| 로컬 교사 인증 | localhost에서만 이메일 + 8자 이상 PIN |
| 학생 인증 | 익명 student ID + 2시간 device token |
| 복구 | 학급 코드·별명·동물·그림 비밀번호 또는 개인 QR |
| 오프라인 | IndexedDB 저장 큐, 재연결 시 재전송 |
| 실시간성 | 학생·교사 화면 polling 중심 |
| 배포 | ChatGPT Sites, `.openai/hosting.json` 유지 |

Node.js는 `22.13` 이상이 필요하다.

## 5. 환경 변수

필요한 변수 이름은 `.env.example`에만 문서화한다.

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-sol
WIGGLE_VOICE_WHISPER_ENABLED=false
WIGGLE_SUBSCRIPTIONS_ENABLED=false
```

규칙:

- `.env.local`은 로컬 비밀값이므로 커밋하지 않는다.
- 키를 로그, 오류 메시지, 테스트 fixture, 문서에 복사하지 않는다.
- 운영 환경 변수는 로컬 파일이 아니라 Sites에서 관리한다.
- 음성 귓속말과 구독은 기능 플래그가 `true`일 때만 노출한다.

## 6. 주요 디렉터리

| 경로 | 역할 |
|---|---|
| `app/components/JoinClient.tsx` | 학생 신규 입장, 공유 태블릿 전환, 복구 |
| `app/components/StudentHome.tsx` | 학생 홈, 추천 활동, 교사 메시지 |
| `app/components/DrawingStudio.tsx` | 캔버스, 도구, 가이드, 그리미, 소감 |
| `app/components/TeacherApp.tsx` | 학급 생성·삭제, 수업 진행, 학생 관리 |
| `app/components/SpeakButton.tsx` | 브라우저 한국어 음성 읽기 |
| `app/components/TimelapsePlayer.tsx` | 작품 과정 재생 |
| `lib/lesson-content.ts` | 4단계 교육과정과 30개 고정 활동 |
| `lib/drawing-model.ts` | DrawDoc, DrawOp, stroke 모델 |
| `lib/draw-renderer.ts` | 작품 렌더링 |
| `lib/openai-coaching.ts` | OpenAI 요청·응답 schema·안전 프롬프트 |
| `lib/client-session.ts` | 학생 세션과 공유 태블릿 클라이언트 상태 |
| `db/schema.ts` | D1 관계형 모델 |
| `drizzle/` | D1 migration |
| `app/api/` | 학생·교사·작품·AI·가족·구독 API |
| `tests/` | Node 테스트와 계약 검사 |
| `.openai/hosting.json` | 기존 Sites 프로젝트와 D1/R2 논리 바인딩 |

## 7. 현재 데이터 모델

`db/schema.ts`의 주요 테이블:

- `teachers`, `teacher_sessions`
- `classrooms`
- `student_profiles`, `recovery_credentials`, `device_sessions`
- `artworks`, `artwork_versions`, `artwork_mutations`
- `coaching_events`, `coaching_event_details`
- `reflections`
- `teacher_messages`, `message_receipts`, `teacher_views`
- `teacher_coaching_drafts`
- `family_share_links`, `family_share_invites`, `family_share_sessions`, `family_share_artworks`
- `subscription_entitlements`, `subscription_webhook_events`
- `rate_limits`

소유권 경계:

- 교사는 자신이 소유한 활성 학급만 읽고 수정한다.
- 학생은 device token의 student ID와 일치하는 작품만 읽고 수정한다.
- 가족 링크는 지정된 작품과 만료 범위만 보여 준다.
- 학급 코드나 join token만으로 학생 목록이나 작품을 열 수 없다.
- 원본 토큰과 그림 비밀번호는 DB에 저장하지 않는다.

## 8. 현재 구현 범위

### 학생 입장과 복구

- 교사 학급 생성, 4자리 수업 코드, 실제 QR
- 입장 열기·닫기, 코드 회전
- 익명 학생 ID, 별명, 동물, 반복 가능한 그림 비밀번호 3개
- 기존 그림 비밀번호 4개 복구 호환
- 같은 기기 자동 복귀와 공유 태블릿 프로필 선택
- 개인 QR 복구
- 중복 별명·동물 경고
- 교사의 학생 보관 처리와 복원

### 그림 학습

- 1단계 선·도형 기초 10개
- 2단계 따라 그리기 10개
- 3단계 관찰 그리기 10개
- 4단계 AI 가이드 자유 창작
- 짧은 연필 시범 → 점선 연습 → 독립 그리기
- 연필, 크레용, 굵은 지우개
- 3개 굵기, 12개 색, undo/redo
- 입력 즉시 화면 피드백
- 자동 저장, revision 충돌 감지, 오프라인 큐
- 최종 이미지, 썸네일, 구조화 소감, 타임랩스

### AI 그리미

- 학생이 호출했을 때만 서버에서 이미지 기반 코칭
- 짧은 질문 하나, 그림 선택지, 실제 다음 행동
- 주제를 6~15단계 가이드로 분해
- 단계별 선택과 마지막 자유 창작
- 질문 전후 버전과 구조화 coaching event
- 교사 AI 코칭 초안 생성·검토 경로

### 교사·가족·구독 기반

- 학생 진행과 썸네일 polling
- 전체·개별 텍스트 메시지
- 교사 열람 표시
- 학생 복구 초기화
- 가족 제한 링크와 공유 세션 기반
- 음성 귓속말과 구독 schema/API는 있으나 기본 플래그가 꺼져 있다.

## 9. 현재 출시 판정

기능 흐름은 동작하지만 2026-07-24 독립 검증에서 **비문해 저학년 독립 사용 기준 NO-GO**다. 실제 수업 배포용 완료 상태로 취급하지 않는다.

P0 데이터 손실이나 전면 중단은 발견되지 않았다. 다음 P1/P2를 해결하기 전에는 새 기능보다 사용성·접근성 보완을 우선한다.

## 10. 우선 수정할 결함

### P1 — 모바일 그리미 패널 잘림

재현:

1. 390×844 학생 그리기 화면에서 선을 하나 그린다.
2. 그리미를 호출하고 질문 응답을 고른다.
3. 그리미 패널 내부를 확인한다.

관찰값:

- 표시 영역 높이 약 179px
- 질문 단계 내용 약 640px
- 응답 뒤 내용 약 828px
- 다음 행동과 확인 버튼이 중첩 스크롤 아래에 숨는다.

완료 기준:

- 모바일에서 첫 질문, 선택지, 다음 행동이 한 흐름으로 보인다.
- 숨겨진 중첩 스크롤에 핵심 행동을 두지 않는다.
- 바텀시트 또는 충분히 확장되는 패널을 사용하고 닫기·스크롤 위치를 명확히 한다.

관련 파일: `app/components/DrawingStudio.tsx`, `app/globals.css`

### P1 — 음성 연속 탭 경쟁 조건

`SpeakButton`이 전역 `speechSynthesis.cancel()`을 호출한 뒤 이전 utterance의 `onend/onerror`가 새 발화의 timer/ref를 정리할 수 있다. 다른 읽기 버튼이 unmount될 때 현재 발화까지 취소할 수 있다.

완료 기준:

- utterance별 ID 또는 소유권을 둔다.
- 가장 최근 발화만 UI 상태를 변경한다.
- 연속 탭, 다른 버튼 탭, unmount, 오류를 자동 테스트한다.
- 실제 iOS Safari와 Android Chrome에서 발화와 UI 상태가 일치한다.

관련 파일: `app/components/SpeakButton.tsx`

### P1/P2 — 글자에 의존하는 오류 복구

재현:

1. 공유 태블릿에서 기존 학생을 고른다.
2. 틀린 그림 비밀번호 3개를 제출한다.
3. 현재 선택과 오류 복구 행동을 확인한다.

현재 문제:

- 오류가 글로만 표시된다.
- 고른 세 칸이 그대로 남고 그림 버튼은 비활성화된다.
- `한 칸 지우기`를 세 번 눌러야 다시 고를 수 있다.
- 수정 중에도 이전 오류 문구가 남는다.
- 기존 학생 화면에서도 음성이 “그림 비밀번호를 만들어요”라고 말한다.
- 잘못된 수업 코드도 글자 오류만 제공한다.

완료 기준:

- `⚠️ + 🔊`로 오류를 듣고 볼 수 있다.
- 큰 `🔄 다시 골라요` 한 번으로 세 칸을 초기화한다.
- 첫 수정 즉시 이전 오류를 지운다.
- 신규 생성과 기존 학생 인증 음성 문구를 구분한다.
- 코드 오류 시 코드 칸 강조와 `🙋 선생님 불러요` 행동을 제공한다.

관련 파일: `app/components/JoinClient.tsx`, `app/globals.css`

### P2 — 38px 모바일 터치 목표

세로 모바일 후순위 CSS가 일부 가이드·이전·다음 버튼을 `38px`로 재정의한다.

완료 기준:

- 모든 핵심 버튼 computed width/height 중 작은 값이 최소 44px이다.
- 320×568과 390×844에서 실제 브라우저 측정 테스트를 둔다.

관련 파일: `app/globals.css`

### P2 — 음성 미지원·실패 대체

현재는 Web Speech API 속성 존재만 검사한다. 음성 목록 없음, throw, 무음, 실제 발화 오류에 대한 아이용 복구가 부족하다. 미지원 버튼을 disabled로 만들어 fallback 설명도 보조기기에서 접근하기 어렵다.

완료 기준:

- 실패 상태를 시각적으로 표시한다.
- disabled 대신 `👩‍🏫 선생님과 같이 읽어요` 같은 접근 가능한 대체 행동을 제공한다.
- 한국어 음성 없음, 발화 오류, 무음 timeout을 테스트한다.
- 텍스트와 그림 단서는 음성 유무와 관계없이 남긴다.

### P2 — 첫 진입과 역할 선택

홈의 학생·교사 역할 선택은 글자 의존성이 높다. 교실에서는 QR이 기본 진입이므로 전면 차단은 아니지만, 일반 URL로 들어온 비문해 학생은 혼자 역할을 구분하기 어렵다.

완료 기준:

- 학생과 교사에 명확한 픽토그램을 붙인다.
- 학생 행동 하나가 가장 강하게 보인다.
- QR 입장은 코드 입력을 건너뛰고 단계별로 별명 추천 → 동물 → 비밀번호만 보여 준다.

### 접근성 — 모달과 캔버스

- 작품 완료와 타임랩스 모달에 open 시 focus 이동, focus trap, background inert, Escape 닫기, opener 복귀가 없다.
- 캔버스는 키보드 입력 또는 동등한 대체 수단이 없다.
- 동적 그리미 패널과 단계 변경 뒤 새 지시문에 초점·announcement가 없다.
- 동물 이모지 버튼은 명시적인 한국어 `aria-label`이 없다.

터치 중심 제품이지만 학교 접근성 기준을 만족해야 한다면 별도 P1로 취급한다.

## 11. 기존 테스트의 한계

현재 `npm.cmd test`가 녹색이어도 UX 출시 근거로 충분하지 않다.

특히 `tests/pre-reader-ux.test.mjs`와 `tests/mobile-css.test.mjs`는 소스 문자열과 CSS 정규식 검사가 많다. 다음을 실제로 실행하지 않는다.

- CSS cascade 뒤 computed size
- hydration 뒤 화면 교체와 초점 소실
- 모달 focus 순서
- speech event, error, 연속 탭, unmount
- 실제 viewport의 scrollWidth/clientWidth
- 중첩 스크롤 아래 가려진 버튼
- 아이가 오류에서 스스로 복구하는 행동

회귀 테스트를 추가할 때 문자열 존재 검사만 늘리지 말고 mounted component 또는 실제 브라우저 행동을 검증한다.

## 12. Claude 개발 완료 조건

Claude는 한 결함 묶음마다 다음을 제출한다.

1. 문제의 재현 단계
2. 원인
3. 수정 파일
4. 자동 테스트
5. 모바일 실제 화면 검사 결과
6. 남은 위험
7. 커밋 SHA

필수 명령:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
git diff --check
git status --short
```

브라우저 확인:

- 320×568 세로
- 390×844 세로
- 844×390 가로
- 가능하면 실제 iPad Safari
- 가능하면 실제 Android Chrome

UX 확인:

- 첫 행동까지 막힘이 없는가
- 핵심 버튼이 한눈에 보이는가
- 글을 읽지 못해도 그림·음성으로 복구 가능한가
- 가로 스크롤이나 중첩 스크롤이 없는가
- 모든 핵심 터치 목표가 최소 44px인가
- 음성을 빠르게 여러 번 눌러도 상태가 맞는가
- 오류 뒤 한 번의 명확한 행동으로 재시도 가능한가

## 13. Codex 독립 검증 조건

Claude가 완료했다고 보고한 뒤 Codex는 같은 구현 설명을 정답으로 삼지 않고 다음을 독립 수행한다.

1. 변경 diff와 소유권·보안 경계 검토
2. typecheck, lint, 전체 테스트 재실행
3. 개발자가 추가한 테스트의 거짓 양성 가능성 확인
4. 공개 또는 로컬 브라우저에서 핵심 흐름 재현
5. 오류·연속 탭·느린 네트워크·작은 화면 공격적 검사
6. 필요할 때 별도 검증 에이전트 교차 검토
7. GO일 때만 GitHub 반영과 Sites 배포

Claude의 개발 완료와 Codex의 배포 승인은 서로 다른 단계다.

## 14. Git·배포 절차

권장 작업 흐름:

1. Claude가 `main` 최신 상태에서 `claude/<task>` 브랜치를 만든다.
2. Claude가 구현·테스트하고 한 결함 묶음 단위로 커밋한다.
3. Claude는 운영 배포를 하지 않고 커밋 SHA와 검증 결과를 사용자에게 전달한다.
4. Codex가 해당 커밋을 독립 검증한다.
5. GO 판정이면 main 반영, GitHub push, Sites version 저장, production deploy를 수행한다.

Sites 주의:

- `.openai/hosting.json`에는 기존 `project_id`, D1 `DB`, R2 `ARTWORKS`가 있다.
- 새 Sites 프로젝트를 만들지 않는다.
- 기존 project ID를 재생성·추측·교체하지 않는다.
- 배포 아카이브는 검증된 정확한 커밋에서 만든다.
- 운영 환경 변수는 Sites에서 관리한다.
- Claude Artifacts나 다른 호스팅으로 옮기는 것은 별도 마이그레이션 결정이다.

## 15. 운영 데이터 주의

검증 과정에서 만든 테스트 학생:

- `🦊 깡총 별`은 교사 관리에서 보관 처리됐다.
- `🐰 깡총 별` 테스트 프로필과 `쭉쭉 직선` 완성 작품 1건은 마지막 확인 시 `보정1-1` 활성 학생 목록에 남아 있었다.

운영 데이터를 직접 SQL로 삭제하지 않는다. 교사 화면에서 학급·별명·동물을 다시 확인한 뒤 해당 테스트 학생만 `학생 삭제`로 보관 처리한다. 실제 학생 `🐰 토끼화가`를 건드리지 않는다.

## 16. 실제 아동 검증

AI 에이전트와 성인 개발자 테스트는 실제 저학년 검증을 대신하지 못한다. 보호자 동의 아래 1~2학년 5명 이상에게 설명 없이 다음 과제를 수행하게 한다.

- QR로 입장
- 연필로 첫 선 긋기
- 굵은 지우개로 일부 지우기
- 연필 시범과 점선을 보고 한 단계 완료
- 그리미 호출과 거절
- 그림 선택으로 소감 완료
- 틀린 그림 비밀번호에서 다시 복구

기록:

- 첫 선까지 걸린 시간
- 잘못 누른 횟수
- 어른 개입 횟수
- 도구나 다음 행동을 찾지 못한 지점
- 아이가 실제로 사용한 표현

성공 기준:

- 핵심 과제의 80% 이상
- 과제당 중립적 힌트 1회 이하
- 치명적 데이터 손실 0건
- 오류에서 아이가 한 번의 명확한 행동으로 복구

## 17. 먼저 읽을 기존 문서

1. `README.md`
2. `docs/architecture-mvp1.md`
3. `docs/security-data-model.md`
4. `docs/flutter-adoption-audit.md`
5. `docs/ux-market-audit-2026-07.md`
6. `db/schema.ts`
7. `lib/lesson-content.ts`
8. `lib/openai-coaching.ts`

기존 문서가 코드와 다르면 현재 코드와 migration을 우선 확인하고, 문서의 낡은 부분도 같은 커밋에서 고친다.

## 18. Claude Code 첫 요청문

저장소 루트에서 Claude Code를 시작한 뒤 아래 요청을 그대로 전달한다.

```text
CLAUDE.md와 docs/claude-handoff-2026-07-27.md를 먼저 끝까지 읽어.
현재 공개 버전은 기능상 동작하지만 비문해 저학년 사용성 NO-GO 상태야.
새 기능을 추가하지 말고, 인수인계 문서의 우선 결함 중
1) 모바일 그리미 패널 잘림,
2) 틀린 그림 비밀번호와 수업 코드의 그림·음성 오류 복구,
3) SpeakButton 연속 탭 경쟁 조건,
4) 모바일 44px 미만 터치 목표
를 재현 가능한 작은 작업으로 나눠 개발해.

먼저 claude/pre-reader-ux-fixes 브랜치를 만들고 현재 코드를 읽어 원인과 수정 계획을 제시해.
사용자 확인 없이 .openai/hosting.json, 운영 환경 변수, D1/R2 데이터, 배포 설정을 바꾸지 마.
각 수정에는 실제 행동을 검증하는 테스트를 추가하고 typecheck, lint, 전체 test,
320x568·390x844·844x390 브라우저 검증을 실행해.
소스 문자열 정규식 테스트만으로 UX 통과를 주장하지 마.
완료하면 변경 파일, 재현 전후, 테스트 결과, 남은 위험, 커밋 SHA를 보고하고 배포는 하지 마.
```
