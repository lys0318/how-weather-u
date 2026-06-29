// 사용자 자유텍스트 정제 (서버측 방어 심층). 제어문자 제거, 공백 정리, 길이컷.
// 비문자/빈값 → ''. (정규식 리터럴 대신 문자열로 구성)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
const MULTI_SPACE = new RegExp('\\s+', 'g');

export function sanitizeUserText(s: unknown, max = 200): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(CONTROL_CHARS, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim()
    .slice(0, max);
}
