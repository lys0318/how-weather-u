// 자유텍스트 정제 — 제어문자(개행 등) 제거, 공백 정리, 200자 컷.
// 빈 결과는 undefined (페이로드에서 필드 자체를 빼기 위함).
// 제어문자 U+0000–U+001F + U+007F. (정규식 리터럴 대신 문자열로 구성)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const MULTI_SPACE = new RegExp('\\s+', 'g');

export function sanitizeFreeText(s?: string, max = 200): string | undefined {
  if (typeof s !== 'string') return undefined;
  const cleaned = s
    .replace(CONTROL_CHARS, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim()
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : undefined;
}
