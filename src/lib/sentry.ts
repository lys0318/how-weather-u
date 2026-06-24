// Sentry 에러 모니터링
// - 네이티브 모듈이 없는 환경(테스트 등)에서도 안전하게 graceful degrade
// - DSN이 없으면 초기화 skip (개발 빌드에선 안 보내고 싶을 때 유용)

let Sentry: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sentry = require('@sentry/react-native');
} catch {
  Sentry = null;
}

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!Sentry) {
    console.log('[sentry] 네이티브 모듈 없음 — skip');
    return;
  }
  if (!SENTRY_DSN) {
    console.log('[sentry] DSN 없음 — skip');
    return;
  }
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      // 개발 빌드 에러는 보내지 않음 (노이즈 방지)
      enabled: !__DEV__,
      // 전송 샘플링: 모든 에러 보냄, 트랜잭션은 10%만
      tracesSampleRate: 0.1,
      // 익명화: 사용자 IP 수집 안 함
      sendDefaultPii: false,
      // 환경 구분
      environment: __DEV__ ? 'development' : 'production',
    });
    initialized = true;
    console.log('[sentry] 초기화 완료');
  } catch (e) {
    console.warn('[sentry] 초기화 실패:', e);
  }
}

/**
 * 수동 에러 보고 — try/catch에서 잡힌 에러를 명시적으로 보낼 때
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!Sentry || !initialized) return;
  try {
    Sentry.captureException(err, { extra: context });
  } catch {}
}

/**
 * 사용자 컨텍스트 설정 (로그인 후 호출)
 * - 개인정보 최소화: 이메일은 보내지 않고 익명 user id만 사용
 *   (에러를 사용자 단위로 묶기엔 id로 충분)
 */
export function setUserContext(userId: string | null, _email?: string | null): void {
  if (!Sentry || !initialized) return;
  try {
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  } catch {}
}
