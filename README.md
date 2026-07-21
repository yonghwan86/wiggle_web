# Wiggle Web

설치 없이 교실에서 기초 도형, 보고 그리기, 자유 창작과 소감을 연결하는 독립 웹앱이다. 기존 `wiggle_draw` Flutter 저장소는 읽기 전용 제품 참고 자료이며 이 저장소와 빌드·배포·Git 이력을 공유하지 않는다.

## MVP 1

- 교사 데모 로그인, 학급 생성, 수업 코드와 실제 QR, 입장 열기·닫기와 코드 회전
- 익명 학생 ID, 별명·동물, 해시된 그림 비밀번호와 개인 QR 복구
- 같은 탭의 짧은 활성 세션과 공유 태블릿 그림 비밀번호 재인증
- 터치·스타일러스 캔버스: 펜, 크레용, 지우개, 굵기, 색, undo/redo
- D1 DrawOp 자동 저장, revision 충돌·멱등 재시도, IndexedDB 오프라인 큐
- R2 256 썸네일과 1024 최종 이미지
- 기초 연습, 고정 6~10단계 따라그리기, 별도 점선 가이드, 자유 창작
- 교사 진행·썸네일 모니터, 전체·개별 텍스트 메시지, 학생 소감과 성장 기록

## 로컬 실행

Node.js 22.13 이상이 필요하다.

```powershell
npm.cmd install
npm.cmd run db:local:init
npm.cmd run dev
```

개발 서버는 첫 API 요청에서도 D1 스키마를 안전하게 확인한다. `NODE_ENV`가 production이 아니고 요청 URL이 `localhost`, `127.0.0.1`, `[::1]`일 때만 로컬 개발 로그인이 열린다. 처음 입력한 이메일과 8자 이상 PIN으로 로컬 전용 계정을 만든다. 운영 교사 화면과 API는 Sites가 전달한 ChatGPT 인증 사용자만 허용한다.

## 검증

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

스키마 변경 뒤에는 `npm.cmd run db:generate`로 migration을 생성하고 SQL을 검토한다.

## 문서

- [MVP 1 구조](docs/architecture-mvp1.md)
- [보안·데이터 모델](docs/security-data-model.md)
- [Flutter 참고 자료 이식 감사](docs/flutter-adoption-audit.md)
- [브랜드 자산 manifest](public/brand/asset-manifest.json)

`.openai/hosting.json`의 논리 바인딩은 D1 `DB`, R2 `ARTWORKS`다. AI는 MVP 1에서 호출하지 않으며, 향후 서버 전용 coaching service가 `CoachingEvent`를 기록하도록 확장한다.
