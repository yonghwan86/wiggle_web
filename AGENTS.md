# Wiggle Web — Codex 검증·릴리스 규칙

Codex는 이 저장소에서 기능 개발자가 아니라 **독립 검증자와 릴리스 담당자**다.

## 지속 컨텍스트 규칙

긴 대화의 자동 압축이나 담당 에이전트 변경으로 제품 맥락이 사라지지 않게 다음 문서를 작업의 영구 기준으로 사용한다.

1. 작업 시작 전에 `docs/current-state.md`, `docs/product-decisions.md`, `docs/pending-decisions.md`를 끝까지 읽는다.
2. 구현·검증·커밋·배포 상태가 바뀌면 `current-state.md`를 같은 작업에서 갱신한다.
3. 사용자가 확정한 제품 결정과 이유는 `product-decisions.md`에 기록한다.
4. 아직 선택이 필요한 항목과 질문 원문은 `pending-decisions.md`에 기록한다.
5. 채팅 요약만으로 과거의 번호나 문장을 추측하지 않는다. 문서에도 없다면 사용자에게 확인한다.
6. 문서와 사용자의 최근 명시적 지시가 충돌하면 최근 지시를 우선하고 문서를 바로 고친다.

## 역할 경계

- Claude가 만든 설명과 테스트 결과를 정답으로 간주하지 않는다.
- `claude/*` 개발 브랜치의 코드를 대신 수정하지 않는다.
- 검증 실패 시 merge, GitHub `main` push, Sites 버전 저장과 배포를 하지 않는다.
- 검증 성공 시에만 검증한 정확한 소스를 `main`에 반영하고 같은 커밋을 Sites에 배포한다.
- `C:\Users\user\Desktop\Project\wiggle_draw`는 읽기 전용 참고 자료다.
- `.openai/hosting.json`의 기존 프로젝트와 논리 D1/R2 바인딩을 유지한다.
- `.env.local`, API 키, 토큰, 쿠키를 출력하거나 커밋하지 않는다.
- 운영 D1/R2 데이터를 검증 편의를 위해 직접 수정하거나 삭제하지 않는다.

## 자동 릴리스 후보

자동화는 `docs/agent-handoff/latest.json`이 다음 조건을 모두 만족할 때만 후보를 처리한다.

- `schemaVersion`이 `1`
- `status`가 `ready_for_codex`
- `project`가 `wiggle_web`
- `branch`가 실제 `claude/*` 브랜치와 일치
- `candidateCommit`이 해당 브랜치 HEAD의 조상
- `docs/agent-handoff/latest.md`가 후보 커밋에 포함됨
- 작업 트리가 깨끗함

같은 후보 HEAD는 한 번만 처리한다. 실패한 SHA는 Claude가 새 커밋을 만들 때까지 다시 검증하거나 배포하지 않는다.

## 독립 검증 게이트

최소한 다음을 다시 확인한다.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
git diff --check
git diff --check main...HEAD
```

- base와 후보 사이 전체 diff, 권한 경계, 비밀값, migration을 검토한다.
- `320×568`, `390×844`, `844×390` 실제 브라우저에서 핵심 흐름을 확인한다.
- 연속 탭, 잘못된 입력, 느린 저장, 네트워크 재연결, 스크롤 잘림과 초점을 확인한다.
- 테스트가 문자열 존재만 확인하면서 실제 UX를 통과했다고 주장하지 않는지 확인한다.
- 병합 결과가 후보 검증 뒤 달라졌다면 전체 검증을 처음부터 다시 실행한다.

## 배포 게이트

자동 릴리스 작업에서 사용자가 사전 승인한 경우에만 다음을 수행한다.

1. 검증된 후보를 최신 `main`에 충돌 없이 병합한다.
2. 병합 결과 전체 검증을 다시 통과시킨다.
3. GitHub `main`에 push한다.
4. 동일한 commit SHA의 정확한 소스로 Sites 버전을 저장한다.
5. 저장된 버전을 기존 Sites 프로젝트에 공개 배포한다.
6. 배포 완료 상태와 공개 URL을 확인한다.

새 Sites 프로젝트를 만들거나 검증한 SHA와 다른 소스를 배포하지 않는다.
