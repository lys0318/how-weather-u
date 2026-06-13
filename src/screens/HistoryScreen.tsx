import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMessages, toggleBookmark, StoredMessage } from '../utils/storage';
import { fetchCloudBookmarks, cloudToStoredMessage } from '../services/bookmarks';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareableCard } from '../components/ShareableCard';
import {
  TIME_OF_DAY_KO,
  TIME_OF_DAY_EN,
  DAY_OF_WEEK_EN_SHORT,
  MONTH_EN_SHORT,
  getTimeOfDay,
  WeatherCondition,
  CONDITION_META,
} from '../constants/weather';
import { useI18n, getCurrentLang, translate } from '../i18n';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'all' | 'bookmark';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export default function HistoryScreen() {
  const { t, lang } = useI18n();
  const { isGuest } = useAuth();
  const [tab, setTab] = useState<Tab>('all');
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [cloudBookmarks, setCloudBookmarks] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMessages = useCallback(async () => {
    const [local, cloud] = await Promise.all([
      getMessages(),
      fetchCloudBookmarks(),
    ]);

    // 클라우드 북마크 → StoredMessage 형식 + Set으로 변환 (matching용)
    const cloudLocalIds = new Set(cloud.map((b) => b.local_id));

    // 로컬 메시지의 isBookmarked를 클라우드 기준으로 보정
    // (다른 기기에서 북마크한 경우 반영)
    const reconciledLocal = local.map((m) => ({
      ...m,
      isBookmarked: cloudLocalIds.has(m.id) || m.isBookmarked,
    }));

    // 클라우드에만 있고 로컬엔 없는 북마크 (만료된 기기 변경 등)
    const localIds = new Set(local.map((m) => m.id));
    const cloudOnly = cloud
      .filter((b) => !localIds.has(b.local_id))
      .map(cloudToStoredMessage);

    setMessages(reconciledLocal);
    setCloudBookmarks([...reconciledLocal.filter((m) => m.isBookmarked), ...cloudOnly]);
    setLoading(false);
  }, []);

  // 화면 포커스될 때마다 새로 로드
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadMessages();
    }, [loadMessages])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  };

  const handleBookmarkToggle = async (id: string) => {
    await toggleBookmark(id);
    // 토글 결과를 양쪽 상태에 반영
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isBookmarked: !m.isBookmarked } : m))
    );
    setCloudBookmarks((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target) {
        // 북마크 해제 → 리스트에서 제거
        return prev.filter((m) => m.id !== id);
      }
      // 새로 북마크 → 전체 메시지에서 찾아서 추가
      const fromMessages = messages.find((m) => m.id === id);
      if (fromMessages) {
        return [{ ...fromMessages, isBookmarked: true }, ...prev];
      }
      return prev;
    });
  };

  // 공유용 카드 ref + 현재 공유 중인 메시지
  const cardRef = useRef<View>(null);
  const [shareMsg, setShareMsg] = useState<StoredMessage | null>(null);

  const handleShare = async (msg: StoredMessage) => {
    try {
      // 카드 데이터 세팅 → 다음 프레임에 렌더링
      setShareMsg(msg);
      await new Promise((resolve) => setTimeout(resolve, 80)); // 렌더 대기

      if (!cardRef.current) throw new Error('카드 ref 비어있음');
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        const date = formatDate(msg.generatedAt);
        await Share.share({
          message: `${msg.weatherEmoji} ${date}\n\n${msg.text}\n\n${t('home.shareSignature')}`,
        });
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('home.shareDialogTitle'),
        UTI: 'public.png',
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : t('home.shareFailTitle');
      Alert.alert(t('home.shareFailTitle'), t('home.shareFailBody', { msg: errMsg }));
      const date = formatDate(msg.generatedAt);
      await Share.share({
        message: `${msg.weatherEmoji} ${date}\n\n${msg.text}\n\n${t('home.shareSignature')}`,
      }).catch(() => {});
    }
  };

  // 공유 카드용 라벨 헬퍼 (현재 언어)
  const buildDateLabel = (iso: string): string => {
    const d = new Date(iso);
    if (getCurrentLang() === 'en') {
      const todEn = TIME_OF_DAY_EN[getTimeOfDay(d.getHours())];
      return `${DAY_OF_WEEK_EN_SHORT[d.getDay()]}, ${MONTH_EN_SHORT[d.getMonth()]} ${d.getDate()} ${todEn}`;
    }
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const tod = TIME_OF_DAY_KO[getTimeOfDay(d.getHours())];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일 ${tod}`;
  };

  const displayed = tab === 'all' ? messages : cloudBookmarks;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.heading}>{t('history.title')}</Text>
        <Text style={styles.count}>
          {tab === 'all'
            ? t('history.countAll', { n: messages.length })
            : t('history.countBmk', { n: cloudBookmarks.length })}
        </Text>
      </View>

      {/* 보존 안내 */}
      <Text style={styles.retentionNotice}>
        {tab === 'all' ? t('history.retentionAll') : t('history.retentionBmk')}
      </Text>

      {/* 탭 */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && styles.tabActive]}
          onPress={() => setTab('all')}
        >
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>{t('history.tabAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'bookmark' && styles.tabActive]}
          onPress={() => setTab('bookmark')}
        >
          <Text style={[styles.tabText, tab === 'bookmark' && styles.tabTextActive]}>
            {t('history.tabBookmarks')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 메시지 리스트 */}
      {displayed.length === 0 ? (
        <EmptyState tab={tab} t={t} isGuest={isGuest} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ffffff"
            />
          }
          renderItem={({ item, index }) => (
            <MessageCard
              message={item}
              showDateHeader={shouldShowDateHeader(displayed, index)}
              onBookmarkToggle={handleBookmarkToggle}
              onShare={handleShare}
              t={t}
            />
          )}
        />
      )}

      {/* 공유용 카드 (캡처용 invisible 렌더링) */}
      {shareMsg && (
        <ShareableCard
          ref={cardRef}
          text={shareMsg.text}
          weatherEmoji={shareMsg.weatherEmoji}
          conditionKo={
            lang === 'en'
              ? CONDITION_META[shareMsg.weatherCondition as WeatherCondition]?.en
              : CONDITION_META[shareMsg.weatherCondition as WeatherCondition]?.ko
          }
          dateLabel={buildDateLabel(shareMsg.generatedAt)}
        />
      )}
    </View>
  );
}

// ── 날짜 헤더 표시 여부 ──────────────────────────────────────
function shouldShowDateHeader(list: StoredMessage[], index: number): boolean {
  if (index === 0) return true;
  const cur = toDateStr(list[index].generatedAt);
  const prev = toDateStr(list[index - 1].generatedAt);
  return cur !== prev;
}

function toDateStr(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

// ── 메시지 카드 ──────────────────────────────────────────────
interface CardProps {
  message: StoredMessage;
  showDateHeader: boolean;
  onBookmarkToggle: (id: string) => void;
  onShare: (msg: StoredMessage) => void;
  t: TFn;
}

function MessageCard({ message, showDateHeader, onBookmarkToggle, onShare, t }: CardProps) {
  return (
    <>
      {showDateHeader && (
        <Text style={styles.dateHeader}>{formatDateHeader(message.generatedAt)}</Text>
      )}
      <View style={styles.card}>
        {/* 날씨 + 시간 */}
        <View style={styles.cardTop}>
          <View style={styles.cardMeta}>
            <Text style={styles.weatherEmoji}>{message.weatherEmoji}</Text>
            {message.kind && message.kind !== 'message' && (
              <View style={styles.kindTag}>
                <Text style={styles.kindTagText}>
                  {message.kind === 'activity' ? t('history.tagActivity') : t('history.tagFood')}
                </Text>
              </View>
            )}
            <Text style={styles.time}>{formatTime(message.generatedAt)}</Text>
          </View>
          <View style={styles.cardActions}>
            <TouchableOpacity
              onPress={() => onShare(message)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.actionIcon}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onBookmarkToggle(message.id)}
              style={styles.actionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.actionIcon, message.isBookmarked && styles.bookmarked]}>
                {message.isBookmarked ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* 메시지 텍스트 */}
        <Text style={styles.messageText}>{message.text}</Text>
      </View>
    </>
  );
}

// ── 빈 상태 ─────────────────────────────────────────────────
function EmptyState({ tab, t, isGuest }: { tab: Tab; t: TFn; isGuest: boolean }) {
  // 게스트는 저장이 안 되므로 전용 안내
  if (isGuest) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyEmoji}>👤</Text>
        <Text style={styles.emptyTitle}>{t('history.guestEmptyTitle')}</Text>
        <Text style={styles.emptyDesc}>{t('history.guestEmptyDesc')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.center}>
      <Text style={styles.emptyEmoji}>{tab === 'all' ? '🌤️' : '★'}</Text>
      <Text style={styles.emptyTitle}>
        {tab === 'all' ? t('history.emptyTitleAll') : t('history.emptyTitleBmk')}
      </Text>
      <Text style={styles.emptyDesc}>
        {tab === 'all' ? t('history.emptyDescAll') : t('history.emptyDescBmk')}
      </Text>
    </View>
  );
}

// ── 날짜 포맷 헬퍼 (현재 언어) ───────────────────────────────
function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = toDateStr(d.toISOString()) === toDateStr(now.toISOString());
  const isYesterday =
    toDateStr(d.toISOString()) ===
    toDateStr(new Date(now.getTime() - 86400000).toISOString());

  if (isToday) return translate('history.today');
  if (isYesterday) return translate('history.yesterday');

  if (getCurrentLang() === 'en') {
    return `${DAY_OF_WEEK_EN_SHORT[d.getDay()]}, ${MONTH_EN_SHORT[d.getMonth()]} ${d.getDate()}`;
  }
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const hour = h % 12 === 0 ? 12 : h % 12;
  if (getCurrentLang() === 'en') {
    return `${hour}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${hour}:${m}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (getCurrentLang() === 'en') {
    return `${DAY_OF_WEEK_EN_SHORT[d.getDay()]}, ${MONTH_EN_SHORT[d.getMonth()]} ${d.getDate()} ${formatTime(iso)}`;
  }
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${formatTime(iso)}`;
}

// ── 스타일 ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  center: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    flex: 1,
  },
  count: {
    fontSize: 13,
    color: '#555',
  },
  retentionNotice: {
    fontSize: 11,
    color: '#555',
    paddingHorizontal: 24,
    marginBottom: 12,
    lineHeight: 16,
  },
  // 탭
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: '#2e2e2e',
  },
  tabText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  // 리스트
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  dateHeader: {
    fontSize: 12,
    color: '#444',
    marginTop: 20,
    marginBottom: 8,
    fontWeight: '600',
  },
  // 카드
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weatherEmoji: {
    fontSize: 20,
  },
  kindTag: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindTagText: {
    fontSize: 11,
    color: '#aaa',
    fontWeight: '600',
  },
  time: {
    fontSize: 12,
    color: '#555',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    padding: 2,
  },
  actionIcon: {
    fontSize: 18,
    color: '#555',
  },
  bookmarked: {
    color: '#f5c518',
  },
  messageText: {
    fontSize: 15,
    color: '#dddddd',
    lineHeight: 24,
  },
  // 빈 상태
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    lineHeight: 22,
  },
});
