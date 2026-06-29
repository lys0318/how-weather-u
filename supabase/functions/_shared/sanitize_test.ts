import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitizeUserText } from './sanitize.ts';

Deno.test('공백/개행 정리', () => {
  assertEquals(sanitizeUserText('  여러   줄\n\n공백 '), '여러 줄 공백');
});
Deno.test('200자 컷', () => {
  assertEquals(sanitizeUserText('x'.repeat(500)).length, 200);
});
Deno.test('비문자 → 빈문자', () => {
  assertEquals(sanitizeUserText(undefined), '');
  assertEquals(sanitizeUserText(42), '');
});
Deno.test('탭/제어문자 제거', () => {
  assertEquals(sanitizeUserText('a\tb\tc'), 'a b c');
});
