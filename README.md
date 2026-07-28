<p align="center">
  <img src="./public/og.png" alt="Wiggle Web — 그림으로 생각하고, 말로 자라요" width="100%" />
</p>

<h1 align="center">Wiggle Web</h1>

<p align="center">
  <strong>설치 없이 시작하는 초등 저학년 교실용 그림 학습·창작 코칭 웹앱</strong>
</p>

<p align="center">
  기초 선과 도형부터 관찰, 따라 그리기, 자유 창작, 말과 이야기까지.<br />
  아이가 직접 그리고, AI와 교사는 생각을 끌어내는 질문으로 돕습니다.
</p>

<p align="center">
  <a href="https://wiggle-classroom-web.chan1940.chatgpt.site"><strong>개발 프리뷰 열기</strong></a>
  ·
  <a href="#-로컬에서-실행하기">로컬 실행</a>
  ·
  <a href="#-현재-개발-상태">개발 상태</a>
  ·
  <a href="./docs/claude-handoff-2026-07-27.md">개발 인수인계</a>
</p>

<p align="center">
  <img alt="Next.js 16.2.6" src="https://img.shields.io/badge/Next.js-16.2.6-000000?logo=nextdotjs&logoColor=white" />
  <img alt="React 19.2.6" src="https://img.shields.io/badge/React-19.2.6-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" />
  <img alt="Cloudflare D1 and R2" src="https://img.shields.io/badge/Cloudflare-D1%20%2B%20R2-F38020?logo=cloudflare&logoColor=white" />
  <img alt="Automated tests 84 passing" src="https://img.shields.io/badge/tests-84%20passing-2EA44F" />
  <img alt="Status active development" src="https://img.shields.io/badge/status-active%20development-FFB020" />
</p>

> [!IMPORTANT]
> Wiggle Web은 현재 **활발히 개발 중인 교육용 프로토타입**입니다. 핵심 기능과 서버 저장은 연결돼 있지만, 실제 비문해 저학년의 독립 사용성 검증에서는 아직 `NO-GO`입니다. 공개 프리뷰는 제품 방향과 기능 확인용이며 실제 학교 운영 전 개인정보·접근성·보존 정책 검토가 더 필요합니다.

---

## 🌱 Wiggle Web이란?

Wiggle Web은 단순한 AI 그림 생성기가 아닙니다.

아이가 그림을 못 그렸다고 평가하거나 대신 완성하지 않고, **관찰하고 선택하고 자기 말로 설명하는 과정**을 돕는 교실용 플랫폼입니다. 교사는 학급의 진행을 살피고 필요한 학생에게 메시지나 가이드를 보낼 수 있으며, 작품은 이메일 회원가입 없이 익명 학생 ID에 이어서 저장됩니다.

> **AI 그림 학습 도구 + 교실 창작 코칭 플랫폼**

### 제품이 지키는 원칙

- 🎨 **아이가 직접 그립니다.** AI가 원본 선을 수정하거나 그림을 대신 완성하지 않습니다.
- ✋ **도움은 요청할 때만 옵니다.** 그리미가 자동으로 끼어들지 않습니다.
- 💬 **한 번에 질문 하나만 합니다.** 짧고 쉬운 말과 실제 다음 행동을 제공합니다.
- 🌟 **점수와 순위를 만들지 않습니다.** 창의력 점수, 재능 진단, 또래 순위가 없습니다.
- 🔐 **학생 개인정보를 최소화합니다.** 학생 이메일·실명·학교명을 받지 않습니다.
- 👩‍🏫 **교사가 수업의 중심입니다.** AI는 교사를 대체하지 않고 수업 운영과 개별 코칭을 보조합니다.
- 👨‍👩‍👧 **공개 SNS보다 안전한 공유를 우선합니다.** 가족 공유는 제한 링크와 동의 기록을 전제로 합니다.

## 👥 주요 사용자

| 사용자 | 할 수 있는 일 |
|---|---|
| 🧒 학생 | QR·수업 코드로 입장, 그림 비밀번호 선택, 단계별 학습, 자유 창작, 그리미 호출, 그림 소감 남기기 |
| 👩‍🏫 교사 | 학급·수업 생성, QR 발급, 오늘의 활동 선택, 학생 진행·썸네일 확인, 전체·개별 메시지, 복구 초기화 |
| 👨‍👩‍👧 가족 | 교사와 보호자 동의를 거친 제한 링크로 선택된 작품과 성장 기록 확인 |
| ✨ 그리미 | 아이가 호출했을 때 그림을 보고 질문, 선택지, 바로 그려 볼 다음 행동 제안 |

## 🪜 4단계 그림 교육과정

한 번에 모든 기능을 보여 주기보다 손의 움직임에서 관찰과 창작으로 자연스럽게 확장합니다.

| 단계 | 활동 | 현재 콘텐츠 |
|---|---|---:|
| 1️⃣ 선·도형 기초 | 직선, 곡선, 원, 세모, 네모, 반복 무늬, 도형 조합 | 10개 |
| 2️⃣ 따라 그리기 | 강아지, 고양이, 토끼, 물고기, 자동차, 자전거, 로켓 등 | 10개 |
| 3️⃣ 관찰 그리기 | 한옥, 카피바라, 나무, 달팽이, 우산, 놀이터, 등대 등 | 10개 |
| 4️⃣ 자유 창작 | 아이가 주제를 고르고 필요할 때만 AI 단계 가이드 요청 | 생성형 |

1단계 가이드는 다음 순서를 사용합니다.

```text
짧은 연필 시범  →  점선 따라 그리기  →  점선 없이 혼자 그리기
```

점선과 연필 시범은 작품과 분리된 가이드 레이어이므로 아이의 원본 그림과 타임랩스에 포함되지 않습니다.

## ✨ 현재 구현된 기능

### 학생 입장·복구

- 수업 코드와 실제 QR 입장
- 익명 학생 ID 자동 발급
- 별명 추천과 동물 캐릭터 선택
- 반복 가능한 그림 비밀번호 3개
- 기존 4개 그림 비밀번호 복구 호환
- 같은 기기 자동 복귀
- 공유 태블릿 학생 선택과 재인증
- 개인 QR 또는 학급 정보 기반 다른 기기 복구
- 중복 별명·동물 프로필 경고

### 터치·스타일러스 캔버스

- ✏️ 연필, 🖍️ 크레용, 시각적 지우개
- 얇게·보통·굵게 3단계
- 12색 팔레트
- 되돌리기·다시하기
- pointer 입력 중 즉시 선 표시
- 정규화된 좌표와 pressure 저장
- D1 자동 저장과 revision 충돌 감지
- IndexedDB 오프라인 저장 큐
- R2 썸네일·최종 이미지
- 작품 완료 버전과 타임랩스

### AI 그리미

- 서버에서만 OpenAI API 호출
- 현재 그림 이미지와 구조화된 최근 과정을 함께 사용
- 모르면 단정하지 않고 질문
- 그림 선택지와 짧은 다음 행동
- 아이가 요청한 주제를 6~15단계로 분해
- 최소 두 번의 열린 선택과 마지막 자유 창작
- 질문 전후 그림 버전과 `CoachingEvent` 저장
- 교사용 AI 코칭 문구 초안
- strict JSON schema와 안전 문구 검사

### 교사용 수업 진행실

- 교사 인증과 담당 학급 분리
- 학급 생성·보관, 입장 열기·닫기, 코드 회전
- 30개 활동과 자유 창작 중 오늘의 활동 선택
- 학생 진행 상태와 낮은 빈도의 썸네일 갱신
- 전체 또는 특정 학생에게 텍스트 메시지
- 교사가 보고 있을 때 학생 화면 표시
- 학생 복구 정보 초기화
- 학생 프로필과 연결 세션을 안전하게 보관·복원
- 제한 가족 공유 링크 발급·취소

### 기능 플래그 뒤의 기반 기능

| 기능 | 기본값 | 상태 |
|---|---:|---|
| 특정 학생 음성 귓속말 | `false` | API·검증·UI 기반 구현, 실제 교실 환경 검증 필요 |
| 구독 entitlement/webhook | `false` | schema·이벤트 순서·검증 기반 구현, 결제 제공자 연결 필요 |
| 가족 제한 공유 | 동의 필요 | 제한 세션·작품 범위·만료·취소 기반 구현 |

## 🔄 대표 사용자 흐름

```mermaid
flowchart LR
    T["👩‍🏫 교사<br/>학급과 활동 생성"] --> Q["수업 코드 · QR"]
    Q --> S["🧒 익명 학생 입장"]
    S --> L["✏️ 단계별 학습"]
    L --> C["🎨 캔버스 창작"]
    C --> G["✨ 요청형 그리미"]
    G --> C
    C --> R["💬 그림 소감"]
    R --> P["🌱 성장 기록"]
    P --> T
    P -. "동의된 제한 공유" .-> F["👨‍👩‍👧 가족"]
```

## 🏗️ 시스템 구조

```mermaid
flowchart TB
    subgraph Browser["학생·교사 브라우저"]
        UI["Next.js / React UI"]
        Canvas["Canvas + Pointer Events"]
        Queue["IndexedDB Offline Queue"]
    end

    subgraph Worker["Cloudflare Worker 호환 서버"]
        Routes["Next API Routes"]
        Auth["소유권·세션·Rate Limit"]
        Coach["OpenAI Coaching Service"]
    end

    D1[("D1<br/>관계형 기록")]
    R2[("R2<br/>썸네일·최종 이미지")]
    AI["OpenAI Responses API"]

    UI --> Routes
    Canvas --> Queue
    Queue --> Routes
    Routes --> Auth
    Auth --> D1
    Routes --> R2
    Routes --> Coach
    Coach --> AI
    Coach --> D1
```

### 데이터 저장 원칙

- **D1:** 교사, 학급, 익명 학생, 세션, 작품 동작, 버전, 코칭 사건, 소감, 메시지, 가족 공유
- **R2:** 학생 썸네일, AI 코칭 전후 이미지, 최종 이미지
- **브라우저:** 짧은 활성 세션, 공유 태블릿 프로필 카드, 전송 전 오프라인 큐
- **서버 전용:** OpenAI API 키와 AI 요청

## 🔐 개인정보와 보안

- 학생 이메일·실명·출생연도·학교명 미수집
- 원본 device token과 개인 QR token 대신 SHA-256 해시 저장
- 그림 비밀번호와 로컬 교사 PIN은 개인 salt를 사용한 PBKDF2-SHA256 100,000회
- 학생 작품 요청마다 device session의 student ID 소유권 확인
- 교사 요청마다 담당 학급 소유권 확인
- 학급 코드와 QR만으로 학생 목록이나 작품 열람 불가
- 작품 저장 revision CAS와 요청 멱등성
- 같은 출처 교사 쓰기와 `SameSite=Strict` 쿠키
- 학생·교사·AI 요청별 rate limit
- 전체 채팅 원문 대신 제품에 필요한 구조화 사건만 저장

자세한 내용은 [보안·데이터 모델](./docs/security-data-model.md)을 참고하세요.

## 🧭 화면 경로

| 경로 | 화면 |
|---|---|
| `/` | 제품 소개와 학생·교사 역할 선택 |
| `/join` | 수업 코드 입력, 공유 태블릿 학생 선택 |
| `/join/:token` | QR·토큰 입장 |
| `/join/recover` | 개인 QR 복구 |
| `/student` | 학생 홈과 오늘의 추천 |
| `/student/practice` | 1단계 선·도형 |
| `/student/guided` | 2단계 따라 그리기 |
| `/student/observe` | 3단계 관찰 그리기 |
| `/student/draw/:id` | 캔버스와 그리미 |
| `/student/archive` | 작품·성장 기록 |
| `/teacher` | 교사 홈과 학급 관리 |
| `/teacher/class/:id` | 수업 진행실 |
| `/family/:token` | 가족 제한 링크 진입 |
| `/family/view` | 허용된 가족 작품 보기 |

## 🚀 로컬에서 실행하기

### 요구 사항

- Node.js `22.13` 이상
- npm
- 로컬 AI 코칭을 시험하려면 OpenAI API 키

### 1. 저장소 받기

```powershell
git clone https://github.com/yonghwan86/wiggle_web.git
cd wiggle_web
npm.cmd ci
```

### 2. 환경 변수 준비

```powershell
Copy-Item .env.example .env.local
```

`.env.local`에 필요한 값을 입력합니다.

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.6-sol
WIGGLE_VOICE_WHISPER_ENABLED=false
WIGGLE_SUBSCRIPTIONS_ENABLED=false
```

> [!CAUTION]
> `.env.local`과 실제 API 키는 Git에 커밋하지 마세요. 브라우저 코드에 `OPENAI_API_KEY`를 사용하지 않습니다.

### 3. 로컬 데이터베이스와 개발 서버

```powershell
npm.cmd run db:local:init
npm.cmd run dev
```

개발 서버가 출력하는 Local URL을 엽니다.

### 로컬 교사 로그인

로컬 개발 환경에서 처음 입력한 이메일과 **8자 이상 PIN**으로 개발 전용 교사 계정을 만듭니다.

- `NODE_ENV`가 production이 아님
- 요청 호스트가 `localhost`, `127.0.0.1`, `[::1]` 중 하나

위 조건에서만 로컬 로그인이 열립니다. 운영 교사 화면은 Sites가 전달하는 ChatGPT 인증 사용자를 요구합니다.

## ✅ 검증하기

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
git diff --check
```

`npm.cmd test`는 production build 뒤 전체 Node 테스트를 실행합니다.

현재 기준:

```text
112 tests
112 passed
0 failed
```

실제 브라우저 행동 검증은 별도 명령입니다. 로컬 서버를 띄운 뒤 실행하면 headless Chrome을 CDP로 몰아 `320×568`, `390×844`, `844×390`에서 computed size, 가로 스크롤, 가려진 버튼, 모달 초점, 그리미 시트 스크롤을 실제 DOM으로 측정합니다.

```powershell
npm.cmd run dev            # 별도 창
npm.cmd run check:browser
```

> [!WARNING]
> 자동 테스트 통과는 실제 저학년 UX 통과를 의미하지 않습니다. `check:browser`는 실측이지만 headless 환경이며, 실기기(iPad Safari·Android Chrome)와 실제 아동 관찰을 대신하지 못합니다.

### 모바일 필수 확인 크기

- `320 × 568` 세로
- `390 × 844` 세로
- `844 × 390` 가로
- 가능하면 실제 iPad Safari와 Android Chrome

## 🗃️ 데이터베이스 변경

schema는 [`db/schema.ts`](./db/schema.ts), migration은 [`drizzle/`](./drizzle)에 있습니다.

```powershell
npm.cmd run db:generate
```

새 migration을 생성한 뒤 반드시 SQL을 검토합니다. D1 schema 변경 없이 migration 파일만 임의 수정하지 않습니다.

## ☁️ 배포

현재 앱은 **ChatGPT Sites**에 연결돼 있습니다.

```json
{
  "d1": "DB",
  "r2": "ARTWORKS"
}
```

- `.openai/hosting.json`의 기존 프로젝트 ID를 유지합니다.
- D1과 R2는 논리 바인딩 이름만 저장소에 둡니다.
- 운영 환경 변수는 Sites에서 관리합니다.
- 검증된 정확한 Git commit에서 Sites version을 만들고 production에 배포합니다.
- 다른 호스팅으로 이전할 때는 D1, R2, 교사 인증, 환경 변수와 migration 전략을 함께 다시 설계해야 합니다.

## 📁 프로젝트 구조

```text
wiggle_web/
├─ app/
│  ├─ api/                    # 학생·교사·작품·AI·가족·구독 API
│  ├─ components/             # 입장, 홈, 캔버스, 교사실, 가족 화면
│  ├─ student/                # 학생 화면 라우트
│  ├─ teacher/                # 교사 화면 라우트
│  └─ family/                 # 가족 제한 공유 라우트
├─ db/
│  ├─ schema.ts               # D1 schema
│  └─ runtime.ts              # runtime binding
├─ drizzle/                   # D1 migrations
├─ lib/
│  ├─ lesson-content.ts       # 30개 교육 콘텐츠
│  ├─ drawing-model.ts        # DrawDoc / DrawOp
│  ├─ openai-coaching.ts      # AI schema·prompt·validation
│  ├─ security.ts             # 세션·검증·rate limit
│  └─ client-session.ts       # 기기 세션·오프라인 큐
├─ public/brand/              # 로고와 앱 아이콘
├─ tests/                     # 계약·보안·저장·UX 회귀 테스트
├─ worker/                    # Cloudflare Worker 진입점
├─ docs/                      # 구조·보안·UX·인수인계 문서
├─ CLAUDE.md                  # Claude Code 상시 작업 규칙
└─ .openai/hosting.json       # 기존 Sites 프로젝트와 논리 바인딩
```

## 📊 현재 개발 상태

| 영역 | 상태 | 비고 |
|---|---|---|
| MVP 1 교실 입장·캔버스·저장 | ✅ 구현 | 실제 학교 운영 정책 검토 필요 |
| 30개 4단계 교육과정 | ✅ 구현 | 콘텐츠 품질의 교사 검토 필요 |
| AI 이미지 코칭·단계 가이드 | ✅ 구현 | 실제 아동 안전성·비용 검증 필요 |
| 질문 전후 버전·성장 기록 | ✅ 구현 | 장기 리포트 표현 개선 필요 |
| 가족 제한 공유 | 🟡 기반 구현 | 보호자 동의 운영 절차 필요 |
| 음성 귓속말 | 🟡 플래그 뒤 구현 | 교실 소음·이어폰·기기 테스트 필요 |
| 구독 | 🟡 데이터 기반 구현 | 결제 제공자와 상품 정책 미연결 |
| 실제 비문해 저학년 UX | 🔴 NO-GO | 아래 우선 결함 수정 후 아동 관찰 필요 |
| 공개 SNS·순위·재능 점수 | ⛔ 비대상 | 제품 원칙상 초기 구현하지 않음 |

### 현재 가장 중요한 결함

1. 모바일 그리미 패널에서 다음 행동이 중첩 스크롤 아래에 가려질 수 있음
2. 틀린 그림 비밀번호와 수업 코드의 오류 복구가 글자에 의존
3. 음성 읽기 버튼 연속 탭 시 상태 경쟁 가능
4. 일부 세로 모바일 가이드 버튼이 실제 44px보다 작음
5. 모달 focus trap·Escape·opener 복귀와 동적 안내 접근성 보완 필요
6. 실제 iPad·Android·저학년 아동 관찰 검증 필요

상세 재현과 완료 기준은 [Claude 개발 인수인계](./docs/claude-handoff-2026-07-27.md)에 정리돼 있습니다.

## 🧪 실제 아동 검증 기준

보호자 동의 아래 1~2학년 5명 이상에게 설명 없이 다음 과제를 수행하게 합니다.

- QR로 입장
- 연필로 첫 선 긋기
- 굵은 지우개로 일부 지우기
- 연필 시범과 점선으로 한 단계 완료
- 그리미 호출과 거절
- 그림 선택으로 소감 완료
- 틀린 그림 비밀번호에서 다시 복구

성공 기준:

- 핵심 과제 80% 이상 완료
- 과제당 중립적 힌트 1회 이하
- 치명적 데이터 손실 0건
- 오류 뒤 한 번의 분명한 행동으로 복구

## 🤝 개발·검증 협업

이 저장소는 구현과 검증을 분리합니다.

```text
개발 에이전트
  → 기능 브랜치에서 구현
  → 자동·브라우저 테스트
  → 커밋 SHA와 남은 위험 보고

독립 검증 에이전트
  → 설명을 정답으로 삼지 않고 재현
  → 보안·모바일·오류 흐름 공격적 검사
  → GO일 때만 main 반영과 Sites 배포
```

Claude Code는 루트 [`CLAUDE.md`](./CLAUDE.md)를 먼저 읽고, 상세 상태는 [개발 인수인계 문서](./docs/claude-handoff-2026-07-27.md)를 따릅니다.

## 📚 문서

- [MVP 1 데이터·권한·복구 구조](./docs/architecture-mvp1.md)
- [보안·데이터 모델](./docs/security-data-model.md)
- [Flutter 참고 자료 이식 감사](./docs/flutter-adoption-audit.md)
- [저학년 UX·시장 점검](./docs/ux-market-audit-2026-07.md)
- [Claude 개발 인수인계](./docs/claude-handoff-2026-07-27.md)
- [Claude → Codex 자동 검증·배포 파이프라인](./docs/agent-pipeline.md)
- [브랜드 자산 manifest](./public/brand/asset-manifest.json)

## 🧩 Flutter 프로젝트와의 관계

기존 Flutter 저장소 `wiggle_draw`는 읽기 전용 제품 참고 자료입니다.

- Flutter UI·내비게이션·파일 저장 코드를 복사하지 않습니다.
- 검증된 DrawDoc·DrawOp 개념, 캔버스 규칙, AI 안전 원칙, 브랜드 자산만 선별 이식했습니다.
- 두 프로젝트는 Git 이력, 빌드, 배포가 완전히 독립적입니다.

## 📄 라이선스

현재 저장소에는 별도 `LICENSE` 파일이 없습니다. 소스 사용·재배포·상업적 이용 권한은 저장소 소유자에게 확인해 주세요.

---

<p align="center">
  <img src="./public/brand/app_icon.png" alt="Wiggle app icon" width="72" />
</p>

<p align="center">
  <strong>그림으로 생각하고, 말로 자라요.</strong><br />
  아이의 선을 대신하지 않는 그림 학습 플랫폼을 만들어 갑니다.
</p>
