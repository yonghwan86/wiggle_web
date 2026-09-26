# 출처와 검수

## 선택한 시안

- `reference/selected-floating-base.png`: 사용자가 고른 세 번째 **가로 태블릿 왼쪽 위 플로팅 카드** 시안. 2026-09-26 Codex ImageGen. 실제 현행 화면과 `/brand/mongri/curious.png`를 시각 참조로 사용했다.
- `reference/selected-floating-answer.png`: 위 시안에 사용자의 후속 요청대로 **예시 사과 그림 + 선택지/직접 입력**을 더한 디자인 시안. 2026-09-26 Codex ImageGen. 예시 학생 작품과 예시 AI 응답은 화면 설명용일 뿐 앱에 넣지 않는다.
- `reference/current-floating-1180x820.png`: 같은 날 로컬 테스트 서버에서 실제 그리기 화면(1180×820)을 Chrome으로 캡처. 테스트 학생·작품은 격리된 임시 DB에서 만들었고, 코칭 문장은 캡처용 예시 응답이다. 운영 학생 데이터가 아니다.

## 새 장식

| 파일 | 생성 요청의 요지 | 원본 |
| --- | --- | --- |
| `assets/crayon-frame.webp` | 투명 중심·바깥의 따뜻한 노란 왁스 크레용 둥근 테두리 하나. 글자·캐릭터·버튼·배경 없음. | Codex ImageGen PNG `exec-5b457436-cbaf-4ab3-a2f9-995f130fefd2.png` |
| `assets/name-swash.webp` | `몽그리` 이름 뒤에 놓는 노란 왁스 크레용 칠 한 줄. 글자·캐릭터 없음. | Codex ImageGen PNG `exec-9d857387-d260-4916-8d93-6f6514292426.png` |
| `assets/green-underline.webp` | 질문 아래에 놓는 초록 왁스 크레용 선 하나. 글자·캐릭터 없음. | Codex ImageGen PNG `exec-3c8d18ef-6f70-4f63-9c85-174d0b6e7a1d.png` |

각 생성에는 `reference/selected-floating-answer.png` 시안을 이미지 참조로 붙였다. PNG를 `sharp`로 축소하고 **무손실 WebP**로 인코딩했다. `manifest.json`에 웹용 파일의 크기·해시를 기록했다. 세 파일 모두 알파 채널이 있고 네 모서리 픽셀의 알파는 0이다.

**원본 몽그리는 새로 생성하지 않았다.** 시안 이미지에 그려진 캐릭터는 분위기 참고용이다. 구현은 저장소에 이미 등록된 `/brand/mongri/*.png`를 그대로 쓴다. 새 장식을 앱의 `public/`에 복사해 실제로 배포할 때에는 `public/brand/asset-manifest.json`에 각 경로와 SHA-256, 사용처를 등록한다.
