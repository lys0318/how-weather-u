import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { bumpGenCount, isReviewPrompted, setReviewPrompted } from '../utils/storage';

// 만족 시점(누적 생성 3회) 도달 시 인앱 리뷰 1회 요청 — 구글 쿼터가 노출 여부 최종 결정.
const REVIEW_AFTER_GENS = 3;
const STORE_URL = 'market://details?id=com.howweatheryou.app';
const STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.howweatheryou.app';

// 생성 성공 시 호출.
export async function maybeAskReview(): Promise<void> {
  try {
    const n = await bumpGenCount();
    if (n < REVIEW_AFTER_GENS || (await isReviewPrompted())) return;
    if (!(await StoreReview.hasAction())) return;
    await setReviewPrompted(); // 먼저 마킹 — OS가 조용히 무시해도 재시도 안 함
    await StoreReview.requestReview();
  } catch {
    // 리뷰 요청 실패는 무해
  }
}

// 설정 "리뷰 남기기" — 플레이스토어 상세 페이지로 이동.
export async function openStoreListing(): Promise<void> {
  try {
    await Linking.openURL(STORE_URL);
  } catch {
    Linking.openURL(STORE_WEB_URL).catch(() => {});
  }
}
