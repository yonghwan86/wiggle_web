# 출처와 생성 프롬프트

- 기준 시안: 사용자가 이 대화에서 선택한 `exec-b79e479e-799a-416c-95a4-4dacfbbee3a5.png`를 `reference/selected-art-desk.png`로 복사했다. 2026-09-23, 1536×1024.
- 새 래스터 5종: Codex의 **built-in ImageGen**으로 각각 독립 생성. 기준 시안은 색·소재·구도 참고 이미지이며, 생성 에셋에는 화면 글자/행동/아이 작품이 들어가지 않는다.
- `.webp`: 위 PNG에서 `cwebp -q 84 -alpha_q 92`로 인코딩한 웹용 파일. PNG는 원본으로 보관한다.
- SVG 5종: Codex가 프로젝트의 초록·노랑 팔레트로 직접 작성한 단순 아이콘/책 틀. 외부 브랜드·사진·사용자 그림 없음.
- 기존 재사용 에셋 `/brand/crayon-mark-128.png`와 `/archive-book/paper-grain.webp`는 여기로 복제하지 않았다. 저장소의 기존 자산 등록·출처를 따른다.

## 최종 프롬프트

### `desk-surface.png`

> Use case: stylized-concept. Asset type: seamless-looking website background texture ONLY, to sit behind independently rendered DOM interface. Reference image is the selected Wiggle student art-desk mockup; use it only for palette and surface feel. Generate a full-frame 1536x1024 image of a completely EMPTY, warm pale cream tabletop with extremely subtle horizontal wood/paper grain and gentle diffuse warm light. Color close to #fdf8e6; middle and all edges remain simple with no objects, no text, no cards, no drawings, no shadows from objects, no logo. The texture should be gentle enough that dark green UI text on top stays fully readable. Flat overhead view, natural handmade feel, no perspective horizon, no hard seams, no dark vignette. This is one reusable background asset, not a screenshot.

### `plant-left.png`

> Use case: stylized-concept. Asset type: transparent decorative cutout for the LEFT EDGE of a children's drawing web app, separate from the UI. Reference image is selected art-desk screen; match its warm, tactile slightly illustrated overhead tabletop style. Generate ONLY a charming leafy houseplant in a simple cream ceramic pot, seen from above/oblique top-down, with broad heart-shaped green leaves extending upward and outward. The whole plant and pot should be isolated on TRUE TRANSPARENT ALPHA background (not white, not a checkerboard graphic), with a very subtle natural shadow included in transparency. No desk, no text, no UI, no other objects. Center the complete object with generous margin so it can be trimmed and placed partially off the left edge of the webpage. Realistic illustrated texture, forest/sage greens, warm soft light.

### `stationery-top-right.png`

> Use case: stylized-concept. Asset type: independent transparent decorative corner cutout for upper right of a children's art-desk web app. Reference image is the approved Wiggle art-desk mockup; match its softly rendered overhead tabletop props and colors, NOT its UI or text. Depict a small off-white handmade ceramic cup holding exactly three thick wax crayons colored forest green, sunflower yellow, and warm coral. To its right a small blank pale yellow sticky note, totally UNWRITTEN with no letters or marks, and to the far right a tiny smiling light wooden animal figurine (simple childlike horse). Arrange as one cohesive loose cluster seen from above at slight angle, not touching or hiding each other. TRUE transparent alpha outside objects, no white or checkerboard background, no desk surface; include subtle natural transparent shadow. Full isolated objects with clean edges and generous transparent margin. No readable text, no logo, no button, no UI. Soft warm handmade editorial illustration.

### `notebook-bottom-right.png`

> Use case: stylized-concept. Asset type: isolated transparent decoration for the BOTTOM RIGHT CORNER of the selected Wiggle art-desk UI. Reference image is the selected screen; match its warm realistic-illustrated tabletop style and overhead angle. Create a small spiral-bound notebook with off-white, very lightly ruled BLANK pages, seen at a slight diagonal, with the black metal spiral binding along its left edge. Include a tiny green child's doodle of a simple smiling face at the lower end of the page ONLY; NO words, NO letters, NO logo, NO UI labels. Add one short coral crayon beside the notebook if useful. Entire object must be a clean TRUE TRANSPARENT RGBA cutout with natural soft transparent shadow, no tabletop rectangle, no checkerboard, no solid background. Complete notebook visible and separated from frame edges; generous transparent margin for trimming and CSS placement. No writing except the simple smile doodle.

### `crayons-edge.png`

> Use case: stylized-concept. Asset type: small independent transparent decorative cutout to place partly off the left or right margin of the approved Wiggle children's art-desk web screen. Use the reference ONLY for handmade wax crayon style and color palette. Show exactly THREE separate chunky child's wax crayons, yellow, green, and bright blue, casually scattered and angled in a loose triangular group on an overhead tabletop plane. Crayons should be fully visible, not overlapping, with natural wax texture and very subtle soft shadows. TRUE TRANSPARENT ALPHA background, no solid colored backdrop, no checkerboard, no wood tabletop rectangle. No writing, no brand, no UI, no hands, no pencils. Compose tightly with enough clear margin around the objects for trimming, suitable for decorative pointer-events-none placement.

## 품질 확인

생성된 투명 PNG 4종은 모두 RGBA이고 알파 범위에 0이 있다. 네 모서리 픽셀은 0이며, WebP로 바꾼 뒤에도 그대로다. `stationery-top-right`의 메모지에는 글씨가 없고, `notebook-bottom-right`에는 웃는 얼굴 외 문자가 없다. 원본과 기준 시안은 해상도/성격이 다르므로 픽셀 단위로 일치하지 않는다. 장식은 실제 아이 작품보다 뒤에 놓는다.
