# Claude 개발 → Codex 검증·Sites 배포 자동화

## 목적

Claude Code는 기능 개발, 테스트, 기능 브랜치 커밋까지만 담당한다. Codex는 Claude의 완료 신호를 감지해 독립 검증하고, 모든 게이트가 `GO`일 때만 GitHub `main` 반영과 Sites 공개 배포를 담당한다.

```text
Claude 개발·테스트·커밋
          ↓
ready_for_codex 완료 신호
          ↓
Codex 별도 검증 작업
     ↙ FAIL       GO ↘
새 Claude 커밋 대기   main → GitHub → Sites
```

Claude와 Codex가 동시에 같은 체크아웃을 수정하지 않는다. 자동 검증은 후보 커밋을 별도 작업 공간에서 확인하고, 개발 브랜치 코드를 대신 고치지 않는다.

## Claude 완료 절차

1. `claude/<작업명>` 브랜치에서 기능과 테스트를 구현한다.
2. 전체 검증과 실제 모바일 브라우저 검증을 실행한다.
3. `docs/agent-handoff/TEMPLATE.md`를 복사해 `docs/agent-handoff/latest.md`를 작성한다.
4. 코드, 테스트, 문서와 `latest.md`를 먼저 커밋한다.
5. 작업 트리가 깨끗한 상태에서 완료 신호를 만든다.

```powershell
npm.cmd run pipeline:ready -- --task "작업 이름" --summary "완료 내용 한 문장"
git add docs/agent-handoff/latest.json
git commit -m "chore: mark ready for Codex verification"
```

6. Claude는 여기서 종료한다. Codex 실행, merge, push, Sites 배포를 하지 않는다.

`pipeline:ready`는 다음을 확인한다.

- 현재 브랜치가 `claude/*`인지
- 작업 트리가 깨끗한지
- `latest.md`가 이미 커밋됐는지
- 후보 커밋과 `main`의 공통 기준점

그 뒤 `docs/agent-handoff/latest.json`에 자동 감지가 가능한 최소 메타데이터를 기록한다.

## Codex 자동 검증

Codex 자동화는 일정 간격으로 새 `ready_for_codex` 후보를 확인한다.

- 새 후보가 없으면 아무것도 변경하지 않는다.
- 동일한 SHA는 한 번만 처리한다.
- Claude가 작업 중이거나 작업 트리가 깨끗하지 않으면 기다린다.
- 후보를 별도 작업 공간에서 검증한다.
- 검증 실패 시 merge·push·배포하지 않고 결함 보고서를 남긴다.
- Claude가 새 커밋과 새 완료 신호를 만들면 다시 검증한다.
- 검증 성공 시 최신 `main`과 병합한 결과를 다시 전체 검증한다.
- 그 결과가 `GO`일 때만 GitHub와 기존 Sites 프로젝트에 배포한다.

## 자동 배포 안전장치

- Claude 완료 신호 자체는 품질 승인이 아니다.
- Codex의 독립 검증 실패는 자동 배포를 즉시 차단한다.
- 충돌을 자동으로 임의 해결하지 않는다.
- migration 변경은 생성된 SQL과 하위 호환성을 검토한다.
- 운영 환경 변수와 운영 D1/R2 데이터를 Claude에게 노출하지 않는다.
- 테스트용 운영 데이터 생성은 피하고, 불가피한 경우 교사 UI의 보관·삭제 흐름만 사용한다.
- 검증 SHA와 배포 SHA가 다르면 배포하지 않는다.

## 운영 방법

자동화는 로컬 Codex 작업이므로 이 PC와 Codex 실행 환경을 사용할 수 있어야 한다. 일시 중지하거나 해제할 때는 Codex의 자동화 화면에서 **Wiggle Claude→Codex release gate**를 관리한다.

검증 실패 보고가 도착하면 Claude에게 보고서 경로와 실패 SHA만 알려주면 된다. 긴 내용을 복사할 필요 없이 Claude가 파일과 Git 기록을 직접 읽게 한다.
