import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedMessage } from '../services/message';

// 키 상수
const KEYS = {
  ONBOARDED: 'hasOnboarded',
  PREFERENCE: 'preference',
  INTERVAL_HOURS: 'intervalHours',
  DO_NOT_DISTURB_ENABLED: 'dndEnabled',
  DO_NOT_DISTURB_START: 'dndStart', // 방해금지 시작 시각 (0~23)
  DO_NOT_DISTURB_END: 'dndEnd',     // 방해금지 종료 시각 (0~23)
  MESSAGES: 'messages',
  BOOKMARKS: 'bookmarks',
  NOTIFICATIONS_ENABLED: 'notificationsEnabled', // 푸시 알림 켬/끔
  NOTIF_SLOTS: 'notifSlots',                     // 받을 시간대 (아침/점심/저녁)
  GUIDE_DISMISSED: 'guideDismissedDate',         // 사용 안내 '오늘 하루 안 보기' 날짜
} as const;

// ─── 사용 안내 모달: 오늘 하루 안 보기 ───────────────────────
function kstTodayStr(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10); // YYYY-MM-DD (KST)
}
export async function isGuideDismissedToday(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.GUIDE_DISMISSED);
  return v === kstTodayStr();
}
export async function dismissGuideToday(): Promise<void> {
  await AsyncStorage.setItem(KEYS.GUIDE_DISMISSED, kstTodayStr());
}

// ─── 알림 활성화 (사용자 의도) ───────────────────────────
// 기본값 false: 사용자가 설정에서 직접 켜야 알림이 옴.
export async function getNotificationsEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.NOTIFICATIONS_ENABLED);
  return v === 'true';
}
export async function setNotificationsEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.NOTIFICATIONS_ENABLED, value ? 'true' : 'false');
}

// ─── 알림 시간대 선택 (아침/점심/저녁) ───────────────────
export type NotifSlot = 'morning' | 'lunch' | 'evening';
const DEFAULT_SLOTS: NotifSlot[] = ['morning', 'lunch', 'evening'];

export async function getNotifSlots(): Promise<NotifSlot[]> {
  const v = await AsyncStorage.getItem(KEYS.NOTIF_SLOTS);
  if (!v) return DEFAULT_SLOTS; // 처음 켤 때 기본은 셋 다
  try {
    const arr = JSON.parse(v) as NotifSlot[];
    const valid = arr.filter((s) => s === 'morning' || s === 'lunch' || s === 'evening');
    return valid;
  } catch {
    return DEFAULT_SLOTS;
  }
}
export async function setNotifSlots(slots: NotifSlot[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.NOTIF_SLOTS, JSON.stringify(slots));
}

// ─── 온보딩 ────────────────────────────────────────────
export async function getHasOnboarded(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.ONBOARDED);
  return v === 'true';
}
export async function setHasOnboarded(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDED, value ? 'true' : 'false');
}

// ─── 취향 ──────────────────────────────────────────────
export async function getPreference(): Promise<'comfort' | 'cheer'> {
  const v = await AsyncStorage.getItem(KEYS.PREFERENCE);
  return v === 'cheer' ? 'cheer' : 'comfort';
}
export async function setPreference(value: 'comfort' | 'cheer'): Promise<void> {
  await AsyncStorage.setItem(KEYS.PREFERENCE, value);
}

// ─── 알림 주기 ─────────────────────────────────────────
export async function getIntervalHours(): Promise<1 | 2 | 3> {
  const v = await AsyncStorage.getItem(KEYS.INTERVAL_HOURS);
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3) return n;
  return 2; // 기본값
}
export async function setIntervalHours(value: 1 | 2 | 3): Promise<void> {
  await AsyncStorage.setItem(KEYS.INTERVAL_HOURS, String(value));
}

// ─── 방해금지 시간대 ────────────────────────────────────
export async function getDndEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_ENABLED);
  return v !== 'false'; // 기본값 true
}
export async function setDndEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_ENABLED, value ? 'true' : 'false');
}

export async function getDndRange(): Promise<{ enabled: boolean; start: number; end: number }> {
  const [enabled, s, e] = await Promise.all([
    AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_ENABLED),
    AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_START),
    AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_END),
  ]);
  const startNum = s !== null ? Number(s) : 1;
  const endNum   = e !== null ? Number(e) : 6;
  return {
    enabled: enabled !== 'false',
    // 0~23 범위 밖(구버전 -1 등)이면 기본값으로 복구
    start: startNum >= 0 && startNum <= 23 ? startNum : 1,
    end:   endNum   >= 0 && endNum   <= 23 ? endNum   : 6,
  };
}
export async function setDndRange(enabled: boolean, start: number, end: number): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_ENABLED, enabled ? 'true' : 'false'),
    AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_START, String(start)),
    AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_END, String(end)),
  ]);
}

// ─── 메시지 히스토리 ────────────────────────────────────
export type EntryKind = 'message' | 'activity' | 'food';

export interface StoredMessage {
  id: string;
  text: string;
  generatedAt: string; // ISO string
  weatherCondition: string;
  weatherEmoji: string;
  isBookmarked: boolean;
  kind?: EntryKind; // 없으면 'message'로 간주 (구버전 호환)
}

// 메시지 자동 보존 기간: 7일 (북마크된 메시지는 무기한 보존)
const MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function getMessages(): Promise<StoredMessage[]> {
  const v = await AsyncStorage.getItem(KEYS.MESSAGES);
  if (!v) return [];
  try {
    const all = JSON.parse(v) as StoredMessage[];
    const cutoff = Date.now() - MESSAGE_RETENTION_MS;
    // 북마크 OR 7일 이내 메시지만 유지
    const filtered = all.filter(m => {
      if (m.isBookmarked) return true;
      const t = new Date(m.generatedAt).getTime();
      return !isNaN(t) && t >= cutoff;
    });
    // 줄어든 만큼 저장소에도 반영 (다음 읽기 시 빠르게)
    if (filtered.length !== all.length) {
      AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(filtered)).catch(() => {});
    }
    return filtered;
  } catch {
    return [];
  }
}

export async function saveMessage(msg: GeneratedMessage, emoji: string): Promise<StoredMessage> {
  const stored: StoredMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: msg.text,
    generatedAt: msg.generatedAt.toISOString(),
    weatherCondition: msg.context.condition,
    weatherEmoji: emoji,
    isBookmarked: false,
    kind: 'message',
  };

  const existing = await getMessages();
  // 최대 100개 유지
  const updated = [stored, ...existing].slice(0, 100);
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(updated));
  return stored;
}

/**
 * 활동/음식 추천 텍스트를 히스토리에 저장
 */
export async function saveEntry(
  text: string,
  emoji: string,
  weatherCondition: string,
  kind: EntryKind,
): Promise<StoredMessage> {
  const stored: StoredMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    generatedAt: new Date().toISOString(),
    weatherCondition,
    weatherEmoji: emoji,
    isBookmarked: false,
    kind,
  };
  const existing = await getMessages();
  const updated = [stored, ...existing].slice(0, 100);
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(updated));
  return stored;
}

export async function toggleBookmark(id: string): Promise<void> {
  const messages = await getMessages();
  const target = messages.find((m) => m.id === id);
  if (!target) return;

  const newState = !target.isBookmarked;
  const updated = messages.map((m) =>
    m.id === id ? { ...m, isBookmarked: newState } : m
  );
  // 로컬 즉시 반영 (낙관적 업데이트)
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(updated));

  // 클라우드 동기화 (실패해도 로컬은 유지됨)
  try {
    // 순환 import 방지 위해 동적 require
    const { uploadBookmark, deleteCloudBookmark } = await import('../services/bookmarks');
    if (newState) {
      await uploadBookmark({ ...target, isBookmarked: true });
    } else {
      await deleteCloudBookmark(target.id);
    }
  } catch (e) {
    console.warn('[bookmark cloud sync] failed:', e);
  }
}

export async function getBookmarks(): Promise<StoredMessage[]> {
  const messages = await getMessages();
  return messages.filter((m) => m.isBookmarked);
}
