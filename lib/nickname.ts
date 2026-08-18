// 별명 표시는 입력한 띄어쓰기를 유지하지만, "같은 학생인가"를 판단하는 비교(신규 중복,
// 동일 자격정보, 재입장, rate-limit 대상 키)는 모든 공백 차이를 무시한다.
// "토끼 화가"·"토끼화가"·앞뒤/연속 공백 변형은 같은 별명이다. 공백만 지우고
// 다른 문자는 정규화하지 않는다 — 서로 다른 한글이 하나로 합쳐지면 안 된다.
export function nicknameMatchKey(value: string) {
  return value.replace(/\s+/gu, "");
}

// rate-limit 대상 키도 같은 공백 규칙을 쓴다. 대소문자는 기존 키와 같이 ko-KR 소문자로 접는다.
export function nicknameRateKeyPart(value: string) {
  return nicknameMatchKey(value).toLocaleLowerCase("ko-KR");
}

// 이미 저장된 별명을 migration 없이 같은 규칙으로 찾기 위한 SQL 식.
// cleanText가 제어 문자·유니코드 공백을 ' '로 접어 저장하므로 실제 행에는 ASCII 공백만
// 남지만, 과거 행을 대비해 탭·개행·CR·NBSP·전각 공백도 함께 지운다.
export function nicknameKeySql(column: string) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), CHAR(9), ''), CHAR(10), ''), CHAR(13), ''), CHAR(160), ''), CHAR(12288), '')`;
}
