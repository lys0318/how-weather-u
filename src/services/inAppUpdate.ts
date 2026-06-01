// 인앱 업데이트 (Google Play In-App Update)
// - 앱 시작 시 새 버전 있으면 강제 업데이트 화면 표시
// - 네이티브 모듈 없는 환경(Expo Go 등)에선 graceful skip
// - 에러나도 앱 실행엔 영향 없음 (try/catch)

let mod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('expo-in-app-updates');
} catch {
  mod = null;
}

let checked = false;

/**
 * 앱 시작 시 1회 호출.
 * 새 버전이 Play Store에 있으면 즉시(Immediate) 강제 업데이트 시작.
 * - true: Immediate(전체화면 강제) / false: Flexible(배너)
 */
export async function checkForUpdate(): Promise<void> {
  if (!mod || checked) return;
  checked = true;
  try {
    // checkAndStartUpdate(true) → Android Immediate 업데이트
    if (typeof mod.checkAndStartUpdate === 'function') {
      await mod.checkAndStartUpdate(true);
    }
  } catch (e) {
    // 업데이트 체크 실패는 무시 (앱은 정상 실행)
    console.warn('[inAppUpdate] skip:', e);
  }
}
