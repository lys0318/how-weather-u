import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedMessage } from '../services/message';

// 키 상수
const KEYS = {
  ONBOARDED: 'hasOnboarded',
  PREFERENCE: 'preference',
  INTERVAL_HOURS: 'intervalHours',
  DO_NOT_DISTURB_START: 'dndStart', // 방해금지 시작 시각 (0~23)
  DO_NOT_DISTURB_END: 'dndEnd',     // 방해금지 종료 시각 (0~23)
  MESSAGES: 'messages',
  BOOKMARKS: 'bookmarks',
} as const;

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
export async function getDndRange(): Promise<{ start: number; end: number }> {
  const [s, e] = await Promise.all([
    AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_START),
    AsyncStorage.getItem(KEYS.DO_NOT_DISTURB_END),
  ]);
  return {
    start: s !== null ? Number(s) : 23, // 기본 밤 11시
    end: e !== null ? Number(e) : 7,    // 기본 아침 7시
  };
}
export async function setDndRange(start: number, end: number): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_START, String(start)),
    AsyncStorage.setItem(KEYS.DO_NOT_DISTURB_END, String(end)),
  ]);
}

// ─── 메시지 히스토리 ────────────────────────────────────
export interface StoredMessage {
  id: string;
  text: string;
  generatedAt: string; // ISO string
  weatherCondition: string;
  weatherEmoji: string;
  isBookmarked: boolean;
}

export async function getMessages(): Promise<StoredMessage[]> {
  const v = await AsyncStorage.getItem(KEYS.MESSAGES);
  if (!v) return [];
  try {
    return JSON.parse(v) as StoredMessage[];
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
  };

  const existing = await getMessages();
  // 최대 100개 유지
  const updated = [stored, ...existing].slice(0, 100);
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(updated));
  return stored;
}

export async function toggleBookmark(id: string): Promise<void> {
  const messages = await getMessages();
  const updated = messages.map((m) =>
    m.id === id ? { ...m, isBookmarked: !m.isBookmarked } : m
  );
  await AsyncStorage.setItem(KEYS.MESSAGES, JSON.stringify(updated));
}

export async function getBookmarks(): Promise<StoredMessage[]> {
  const messages = await getMessages();
  return messages.filter((m) => m.isBookmarked);
}
