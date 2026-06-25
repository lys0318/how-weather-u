// 생성 전 광고/제한 게이팅 공용 훅
import { fetchTodayUsage } from '../services/usage';
import { showInterstitialThenRun } from '../services/ads';

/**
 * 오늘 첫 생성(used===0)이면 skipAd=true (광고 없이 무료).
 * 남용 상한(ABUSE_CAP) 초과면 canGenerate=false.
 * 서버 조회 실패 시 낙관적으로 허용 (firstFree 처리).
 */
export async function checkGenerationGate(): Promise<{
  canGenerate: boolean;
  skipAd: boolean;
}> {
  const usage = await fetchTodayUsage();
  if (!usage) return { canGenerate: true, skipAd: true };
  return {
    canGenerate: usage.used < usage.limit,
    skipAd: usage.used === 0,
  };
}

/**
 * 게이팅 체크 → (필요 시) 전면광고 → callback 실행
 * 남용 상한 도달 시 onCapped 호출 후 종료.
 */
export async function runWithGate(
  callback: () => Promise<void> | void,
  onCapped?: () => void,
): Promise<void> {
  const { canGenerate, skipAd } = await checkGenerationGate();
  if (!canGenerate) {
    onCapped?.();
    return;
  }
  await showInterstitialThenRun(() => { callback(); }, skipAd);
}
