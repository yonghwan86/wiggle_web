# Wiggle Web — Claude Code 작업 규칙

이 파일은 Claude Code가 이 저장소에서 개발할 때 항상 지켜야 할 최소 규칙이다. 세부 제품 상태, 결함, 검증 기준은 먼저 [docs/claude-handoff-2026-07-27.md](docs/claude-handoff-2026-07-27.md)를 끝까지 읽는다.

## 프로젝트 경계

- 작업 저장소는 `C:\Users\user\Desktop\Project\wiggle_web`이다.
- `C:\Users\user\Desktop\Project\wiggle_draw`는 읽기 전용 참고 자료다. 수정하거나 통째로 복사하지 않는다.
- `wiggle_web`은 독립 Git 저장소이며 원격은 `https://github.com/yonghwan86/wiggle_web.git`이다.
- `.openai/hosting.json`을 삭제하거나 다른 프로젝트 ID로 바꾸지 않는다.
- `.env.local`, API 키, 토큰, 쿠키 등 비밀값을 읽어 출력하거나 커밋하지 않는다.

## 제품 불변 원칙

- 수업 코드와 학급 QR은 입장 수단일 뿐 학생 작품 접근 권한이 아니다.
- 작품과 과정 기록은 서버가 발급한 익명 학생 ID에 저장한다.
- 학생 이메일·실명·학교명·점수·순위·재능 진단을 만들지 않는다.
- AI 그리미는 그림을 대신 완성하거나 평가하지 않는다.
- 그리미는 아이가 호출했을 때만 개입하고, 모르면 추측하지 않고 한 번에 하나만 질문한다.
- 점선과 시범은 아이 원본 그림과 분리된 레이어이며 저장 이미지에 합성하지 않는다.
- 글을 아직 읽지 못하는 초등 저학년이 핵심 사용자다. 핵심 행동은 그림, 음성, 큰 터치 목표로 이해할 수 있어야 한다.

## 개발 절차

1. 기능마다 `claude/<짧은-작업명>` 브랜치를 만든다.
2. 관련 코드와 기존 테스트를 먼저 읽고, 범위를 좁혀 수정한다.
3. 개발자가 직접 만든 테스트만으로 완료 판정하지 않는다.
4. 최소 검증을 모두 통과시킨다.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
git diff --check
```

5. 모바일 UI는 최소 `320×568`, `390×844`, `844×390`에서 실제 브라우저로 확인한다.
6. 소스 문자열이나 CSS 정규식 검사만으로 UX 통과를 주장하지 않는다. computed size, 잘림, 스크롤, 초점, 연속 탭, 오류 복구를 실제 동작으로 검증한다.
7. 작업 결과에는 변경 파일, 재현한 문제, 실행한 검증, 남은 위험을 사실대로 기록한다.
8. Claude는 Sites 운영 배포를 실행하지 않는다. 커밋까지 준비한 뒤 Codex가 독립 검증하고 Sites 버전 저장·배포를 담당한다.
9. Claude는 Codex를 직접 실행하거나 GitHub `main`에 push하지 않는다. 자동화가 처리할 표준 완료 신호만 남긴다.

## Codex 자동 인계

개발과 검증을 모두 마친 뒤 다음 순서로 완료 신호를 만든다.

1. `docs/agent-handoff/TEMPLATE.md`를 기준으로 `docs/agent-handoff/latest.md`를 작성한다.
2. 코드, 테스트, 문서와 `latest.md`를 먼저 커밋한다.
3. 작업 트리가 깨끗한 상태에서 다음 명령을 실행한다.

```powershell
npm.cmd run pipeline:ready -- --task "작업 이름" --summary "완료 내용 한 문장"
git add docs/agent-handoff/latest.json
git commit -m "chore: mark ready for Codex verification"
```

4. 마지막 marker 커밋 뒤에는 merge, push, Codex 실행, Sites 배포를 하지 않고 종료한다.

`ready_for_codex` marker는 완료 보고일 뿐 품질 승인이나 배포 승인이 아니다. Codex 자동화가 독립 검증에서 `GO`를 판정해야만 배포된다. 자세한 흐름은 [docs/agent-pipeline.md](docs/agent-pipeline.md)를 따른다.

## 현재 최우선 목표

현재 공개 버전은 기능적으로 동작하지만 비문해 저학년 독립 사용성 검증에서 `NO-GO`다. 새 기능보다 상세 인수인계 문서의 P1/P2 결함을 먼저 수정한다.
