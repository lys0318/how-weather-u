# T5 — 광고/비용 정책 변경

**의존 태스크**: 없음 (T1과 병렬 작업 가능)
**영향 받는 태스크**: T2, T3 (게이팅 로직 사용)

## 목표

- 보상형 광고 완전 제거
- 일일 한도 3회 → 남용방지 상한 50회 (숨김)
- 클라이언트: "하루 첫 생성 1회 무료, 이후 전면형 무제한"
- 활동/음식 엣지함수 Haiku 전환
- 배너 광고 추가 (하단 고정)

---

## 수정 파일 1: `supabase/functions/_shared/limit.ts`

### 변경 사항

```typescript
// 기존
export type Feature = 'message' | 'activity' | 'food';
export const DAILY_LIMIT_TOTAL = 3;
export const MAX_AD_REWARDS_PER_DAY = 20;

// 변경 후
export type Feature = 'message' | 'activity' | 'food' | 'fortune';
// ponytail: 하드 한도 제거. 스크립트 남용 방지용 상한만 유지 (UI에 노출 안 함).
export const ABUSE_CAP = 50;
```

`getEffectiveLimit` 함수 → 단순화:
```typescript
export async function getEffectiveLimit(_userId: string): Promise<number> {
  return ABUSE_CAP;
}
```

`checkAndLog` 함수 — 로직은 그대로지만 `limit`이 `ABUSE_CAP`을 반환하게 됨.

`grantAdReward`, `getAdRewardsToday` 함수 — **삭제하지 말고 그냥 두기** (ad_rewards 테이블·런타임 영향 없음).

### 주의: `limitExceededResponse` 함수

ABUSE_CAP(50) 초과는 거의 없지만, 메시지를 "내일 다시 이용해주세요"에서 "잠시 후 다시 시도해주세요"로 변경:
```typescript
error: `잠시 후 다시 시도해주세요 🌙`,
```

---

## 수정 파일 2: `supabase/functions/generate-activity/index.ts`

`callClaude` 호출에 `model: MODEL_HAIKU` 추가:
```typescript
import { callClaude, MODEL_HAIKU } from '../_shared/claude.ts';
// ...
const { text } = await callClaude({
  systemPrompt: lang === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN,
  userPrompt,
  maxTokens: 280,
  temperature: 1,
  model: MODEL_HAIKU,  // 추가
});
```

---

## 수정 파일 3: `supabase/functions/generate-food/index.ts`

동일하게 `model: MODEL_HAIKU` 추가.

---

## 수정 파일 4: `src/services/ads.ts`

### 보상형 제거

아래 항목 삭제:
- `REAL_REWARDED_ID` 상수
- `rewarded`, `rewardedReady` 변수
- `getRewardedUnitId()` 함수
- `loadRewarded()` 함수
- `showRewardedAndGrant()` export 함수
- `isRewardedAvailable()` export 함수
- `initAds` 내부 `loadRewarded()` 호출

### 배너 추가

상수 추가:
```typescript
// 실제 배너 ID — AdMob 콘솔에서 발급 후 교체
// ponytail: 미발급 시 테스트 ID 폴백
const REAL_BANNER_ID = ''; // TODO: AdMob 콘솔에서 배너 단위 생성 후 채울 것

export function getBannerUnitId(): string {
  if (!admob) return '';
  if (USE_TEST_ADS || !REAL_BANNER_ID) return admob.TestIds.BANNER;
  return REAL_BANNER_ID;
}
```

### import 정리

`redeemAdCredit` import 제거 (usage.ts에서 더 안 씀):
```typescript
// 기존: import { redeemAdCredit, UsageInfo } from './usage';
import { UsageInfo } from './usage';
```

---

## 수정 파일 5: `src/services/usage.ts`

`redeemAdCredit` 함수 삭제 (더 이상 호출 없음).
`fetchTodayUsage` 함수는 유지.

---

## 신규 파일: `src/hooks/useGenerationGate.ts`

클라이언트 게이팅 로직 공용화 (홈+메시징 둘 다 사용).

```typescript
// 생성 전 광고/제한 게이팅
import { fetchTodayUsage, UsageInfo } from '../services/usage';
import { showInterstitialThenRun } from '../services/ads';

export interface GateResult {
  canGenerate: boolean;
  skipAd: boolean;      // true면 광고 없이 무료
  abuseCap: boolean;    // true면 남용 상한 도달 (드묾)
}

export async function checkGenerationGate(): Promise<GateResult> {
  const usage = await fetchTodayUsage();
  if (!usage) return { canGenerate: true, skipAd: true, abuseCap: false };
  const abuseCap = usage.used >= usage.limit;
  const skipAd = usage.used === 0; // 오늘 첫 번째 생성 = 무료
  return { canGenerate: !abuseCap, skipAd, abuseCap };
}

/**
 * 게이팅 체크 후 전면광고(필요 시) + callback 실행
 * - 남용 상한 도달 시 callback 없이 경고 반환
 */
export async function runWithGate(
  callback: () => void,
  onAbuseCap?: () => void,
): Promise<void> {
  const gate = await checkGenerationGate();
  if (gate.abuseCap) {
    onAbuseCap?.();
    return;
  }
  await showInterstitialThenRun(callback, gate.skipAd);
}
```

---

## 신규 파일: `src/components/AppBanner.tsx`

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { getBannerUnitId } from '../services/ads';

// 안전 require (네이티브 모듈 없는 Expo Go에서도 동작)
let admob: any = null;
try { admob = require('react-native-google-mobile-ads'); } catch {}

export default function AppBanner() {
  if (!admob || !getBannerUnitId()) return null;
  const { BannerAd, BannerAdSize } = admob;
  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={getBannerUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 4 },
});
```

---

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- `showRewardedAndGrant`, `isRewardedAvailable` export 없음 (호출 측 HomeScreen에서도 제거됐는지 확인)
- `redeemAdCredit` import 없음
- `generate-activity`, `generate-food` 엣지함수에 `model: MODEL_HAIKU` 있음
- `_shared/limit.ts`에 `ABUSE_CAP = 50` + `Feature`에 `'fortune'` 포함
