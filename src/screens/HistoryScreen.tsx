import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMessages, toggleBookmark, StoredMessage } from '../utils/storage';

type Tab = 'all' | 'bookmark';

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMessages = useCallback(async () => {
    const all = await getMessages();
    setMessages(all);
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
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isBookmarked: !m.isBookmarked } : m))
    );
  };

  const handleShare = async (msg: StoredMessage) => {
    const date = formatDate(msg.generatedAt);
    await Share.share({
      message: `${msg.weatherEmoji} ${date}\n\n${msg.text}\n\n— 하우웨더유 (How Weather You)`,
    });
  };

  const displayed = tab === 'all' ? messages : messages.filter((m) => m.isBookmarked);

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
        <Text style={styles.heading}>메시지 기록</Text>
        <Text style={styles.count}>{messages.length}개</Text>
      </View>

      {/* 7일 보존 안내 */}
      <Text style={styles.retentionNotice}>
        메시지는 7일간 보관되고 자동으로 삭제돼요 · 북마크는 영구 보관 ★
      </Text>

      {/* 탭 */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && styles.tabActive]}
          onPress={() => setTab('all')}
        >
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>전체</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'bookmark' && styles.tabActive]}
          onPress={() => setTab('bookmark')}
        >
          <Text style={[styles.tabText, tab === 'bookmark' && styles.tabTextActive]}>
            ★ 북마크
          </Text>
        </TouchableOpacity>
      </View>

      {/* 메시지 리스트 */}
      {displayed.length === 0 ? (
        <EmptyState tab={tab} />
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
            />
          )}
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
}

function MessageCard({ message, showDateHeader, onBookmarkToggle, onShare }: CardProps) {
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
function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyEmoji}>{tab === 'all' ? '🌤️' : '★'}</Text>
      <Text style={styles.emptyTitle}>
        {tab === 'all' ? '아직 받은 메시지가 없어요' : '북마크한 메시지가 없어요'}
      </Text>
      <Text style={styles.emptyDesc}>
        {tab === 'all'
          ? '홈에서 메시지를 생성하거나\n알림을 설정해보세요'
          : '마음에 드는 메시지에 ☆을 눌러\n저장해두세요'}
      </Text>
    </View>
  );
}

// ── 날짜 포맷 헬퍼 ───────────────────────────────────────────
function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = toDateStr(d.toISOString()) === toDateStr(now.toISOString());
  const isYesterday =
    toDateStr(d.toISOString()) ===
    toDateStr(new Date(now.getTime() - 86400000).toISOString());

  if (isToday) return '오늘';
  if (isYesterday) return '어제';

  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}:${m}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
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
