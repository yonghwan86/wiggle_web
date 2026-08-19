# Claude → Codex 자동 검증·배포 파이프라인 (은퇴)

> **이 파이프라인은 2026-08-19 Vercel 재플랫폼과 함께 은퇴했다.**
> 이전 내용은 git 이력(`git log -- docs/agent-pipeline.md`)에서 볼 수 있다.

## 무엇이 바뀌었나

- **예전**: Claude가 기능 브랜치에 `ready_for_codex` marker를 남기면, Codex 자동화가
  독립 검증(GO/NO-GO) 후 `main` 병합과 ChatGPT Sites 버전 저장·공개 배포까지 담당했다.
- **지금**: GitHub `main` push가 곧 운영 배포다(Vercel 자동 빌드,
  `https://wiggleweb.vercel.app`). 검증은 저장소의 게이트(`npm test` 268개 +
  `check:browser` + 필요시 `scripts/check-deployed.mjs` 운영 실측)로 수행하고,
  `main` push는 사용자가 직접 실행한다.

## 남은 산출물의 처리

- `docs/agent-handoff/` — 과거 인계·감사 기록의 보존용 아카이브. 새 항목을 만들지 않는다.
- `.openai/hosting.json` — 은퇴한 Sites 연결 이력. 삭제·수정하지 않는다.
- 기존 Sites(`wiggle-classroom-web.chan1940.chatgpt.site`)와 그 데이터는 보존한다.
  폐기는 사용자 명시 승인이 필요하다(운영 데이터는 신규 시작으로 이전하지 않았음).

현행 규칙의 정본: [CLAUDE.md](../CLAUDE.md)(Claude), [AGENTS.md](../AGENTS.md)(공통).
