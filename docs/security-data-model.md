# 보안·데이터 모델

## 객체 소유권

- 교사 쿼리는 항상 `classrooms.teacher_id = session.teacher_id` 조건을 포함한다.
- 학생 작품 읽기·수정은 항상 `artworks.student_id = device_session.student_id` 조건을 포함한다.
- 개별 메시지는 대상 학생이 교사의 해당 학급 소속인지 확인한 뒤 생성한다.
- 학급 코드와 QR join token으로는 학생 목록이나 작품을 읽을 수 없다.
- R2 object는 공개 URL로 노출하지 않는다. 교사 소유권 검사 뒤 낮은 해상도 썸네일만 응답한다.

## 세션과 복구

- 운영 교사는 Sites가 전달한 ChatGPT 인증 헤더를 서버에서 검증하고 이메일 기준 Teacher를 upsert한다. `/teacher` 페이지는 production에서 dispatch-owned SIWC를 요구한다.
- 로컬 PIN 로그인은 `NODE_ENV != production`이며 요청 URL hostname이 localhost/127.0.0.1/[::1]일 때만 허용한다. 고정 공개 계정은 없다.
- 로컬 교사 세션은 8시간, `HttpOnly`, `SameSite=Strict`, HTTPS에서 `Secure`이며 logout 시 D1 행도 삭제한다.
- 학생 활성 세션은 2시간 뒤 만료하고 원문 대신 SHA-256 해시를 저장한다. 안전한 프로필 카드에는 token을 저장하지 않으며 공유 태블릿 전환 때 그림 비밀번호로 새 세션을 발급한다.
- 그림 비밀번호와 교사 PIN은 개인 salt를 둔 PBKDF2-SHA256 100,000회 결과만 저장한다. 이는 Sites 운영 런타임의 PBKDF2 상한을 준수하며, Worker에서는 `nodejs_compat`의 비동기 `node:crypto` 구현을 사용한다. 새 그림 비밀번호는 반복 가능한 그림 세 개이고 기존 네 개 비밀번호도 그대로 검증한다.
- 개인 QR 복구 token도 원문을 저장하지 않는다.
- 학급 코드는 교사가 회전할 수 있고 이전 코드·join token은 즉시 무효가 된다.
- 로그인과 복구에는 IP 범위 속도 제한, 학생/교사 쓰기에는 세션별 속도 제한을 적용한다.

## 쓰기 안전성

- 같은 출처 JSON 요청만 교사 cookie 쓰기에 허용한다. SameSite 쿠키와 함께 CSRF 경계를 만든다.
- 모든 텍스트는 제어 문자를 제거하고 용도별 최대 길이를 적용한다. UI는 React escaping만 사용하고 HTML을 주입하지 않는다.
- DrawOp는 op ID 중복, 좌표 범위, pressure, 도구·색·굵기, 최대 개수를 서버에서 검증한다.
- 작품 저장은 예상 revision이 일치할 때만 반영한다. 작품의 `last_mutation_id` CAS update와 `(artwork_id, student_id, request_id)` mutation insert를 하나의 D1 batch로 실행한다.
- 409 충돌은 자동 재전송하지 않는다. IndexedDB에 충돌 상태로 유지하고 학생이 명시적으로 새 사본을 만들 때만 로컬 그림을 이어 저장한다.
- R2 후보 object key는 revision, request ID, nonce를 포함한다. CAS 승자만 D1 metadata에 연결하고 committed metadata로 다시 기록하며 패자는 자신의 후보만 삭제한다.
- 오프라인 요청은 IndexedDB에 학생별 token과 함께 격리하며 공유 태블릿 전환 시 활성 token을 섞지 않는다.

## 보존 원칙

- 작품 D1 기록과 R2 이미지는 학급 사용 기간과 학교 계약의 보존 정책을 따른다. 실제 운영 전 삭제·내보내기 작업을 구현한다.
- rate limit 행, 만료 세션, 오래된 autosave 이미지와 고아 R2 object는 주기 작업으로 정리한다.
- 전체 원본 채팅은 수집하지 않는다. 작품, 메시지, 소감, 구조화 coaching event만 저장한다.
- 출생연도, 이메일, 실명, 학교명, 공개 프로필은 수집하지 않는다.

## 운영 전 필수 검토

실제 공개 배포 전 교사 allowlist·학교 권한 회수, 보호자 동의, 보존 기간, 삭제 API, 감사 로그, CSP·보안 헤더, 분산 rate limit과 비밀키 회전 정책을 보안 검토한다. SIWC는 인증이며 학교 소속 권한을 자동으로 증명하지 않는다.
