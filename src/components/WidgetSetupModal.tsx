import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  ToastAndroid,
  Alert,
} from 'react-native';
import { WeatherInfo } from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import {
  StoredMessage,
  WidgetChoice,
  getWidgetChoice,
  setWidgetChoice,
  getMessages,
} from '../utils/storage';
import { fetchCloudBookmarks, cloudToStoredMessage } from '../services/bookmarks';
import { pinWidget } from '../services/widget';
import { resolveWidgetLine, pushWidget } from '../services/widgetContent';

interface Props {
  visible: boolean;
  onClose: () => void;
  weather?: WeatherInfo;
}

// 위젯 미리보기 — 실제 네이티브 위젯과 같은 톤(반투명 차콜) 카드
function Preview({ head, city, range, message, showMessage }: {
  head: string; city: string; range: string; message: string; showMessage: boolean;
}) {
  return (
    <View style={styles.preview}>
      <View style={styles.previewTopRow}>
        <Text style={styles.previewHead}>{head}</Text>
        <Text style={styles.previewCity} numberOfLines={1}>{city}</Text>
      </View>
      <Text style={styles.previewRange}>{range}</Text>
      {showMessage ? <Text style={styles.previewMsg} numberOfLines={2}>{message}</Text> : null}
    </View>
  );
}

export default function WidgetSetupModal({ visible, onClose, weather }: Props) {
  const { t, lang } = useI18n();
  const { isGuest } = useAuth();
  const [choice, setChoice] = useState<WidgetChoice>({ kind: 'auto' });
  const [msgs, setMsgs] = useState<StoredMessage[]>([]);

  useEffect(() => {
    if (!visible) return;
    getWidgetChoice().then(setChoice).catch(() => {});
    (async () => {
      const local = (await getMessages()).filter((m) => (m.kind ?? 'message') === 'message');
      let cloud: StoredMessage[] = [];
      if (!isGuest) {
        try {
          cloud = (await fetchCloudBookmarks())
            .map(cloudToStoredMessage)
            .filter((m) => (m.kind ?? 'message') === 'message');
        } catch {
          // 무시 — 로컬만 표시
        }
      }
      const map = new Map<string, StoredMessage>();
      for (const m of [...cloud, ...local]) if (!map.has(m.id)) map.set(m.id, m);
      const list = Array.from(map.values());
      list.sort(
        (a, b) =>
          Number(b.isBookmarked) - Number(a.isBookmarked) ||
          b.generatedAt.localeCompare(a.generatedAt),
      );
      setMsgs(list);
    })().catch(() => {});
  }, [visible, isGuest]);

  // 미리보기 표시 문자열
  const head = weather ? `${weather.emoji} ${weather.temp}°` : '🌤️ --°';
  const city = weather
    ? weather.city && weather.city !== '내 위치'
      ? weather.city
      : t('weather.myLocation')
    : '';
  const range = weather ? t('weather.tempRange', { min: weather.tempMin, max: weather.tempMax }) : '';
  let message = weather ? resolveWidgetLine(weather, choice, msgs, lang, new Date().getHours()) : '';
  if (message.length > 90) message = message.slice(0, 88) + '…';

  const choose = async (c: WidgetChoice) => {
    setChoice(c);
    await setWidgetChoice(c);
    await pushWidget();
  };

  const add = async (size: 'medium' | 'small') => {
    const r = await pinWidget(size);
    if (r === 'ok') ToastAndroid.show(t('widget.added'), ToastAndroid.LONG);
    else Alert.alert(t('widget.section'), t('widget.unsupported'));
  };

  const optActive = (kind: WidgetChoice['kind'], id?: string) =>
    choice.kind === kind && (kind !== 'message' || (choice.kind === 'message' && choice.id === id));

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.bg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('widget.section')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* 미리보기 + 추가 */}
            <Text style={styles.sectionLabel}>{t('widget.previewLabel')}</Text>

            <View style={styles.previewBlock}>
              <Preview head={head} city={city} range={range} message={message} showMessage />
              <TouchableOpacity style={styles.addBtn} onPress={() => add('medium')} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>{t('widget.addMedium')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.previewBlock}>
              <View style={styles.previewSmallWrap}>
                <Preview head={head} city={city} range={range} message={message} showMessage={false} />
              </View>
              <TouchableOpacity style={styles.addBtn} onPress={() => add('small')} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>{t('widget.addSmall')}</Text>
              </TouchableOpacity>
            </View>

            {/* 표시 메시지 선택 */}
            <Text style={[styles.sectionLabel, { marginTop: 18 }]}>{t('widget.pickTitle')}</Text>

            <TouchableOpacity style={[styles.opt, optActive('auto') && styles.optActive]} onPress={() => choose({ kind: 'auto' })}>
              <Text style={styles.optRadio}>{optActive('auto') ? '◉' : '○'}</Text>
              <Text style={styles.optText}>{t('widget.optAuto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.opt, optActive('brief') && styles.optActive]} onPress={() => choose({ kind: 'brief' })}>
              <Text style={styles.optRadio}>{optActive('brief') ? '◉' : '○'}</Text>
              <Text style={styles.optText}>{t('widget.optBrief')}</Text>
            </TouchableOpacity>

            {msgs.map((m) => {
              const on = optActive('message', m.id);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.opt, on && styles.optActive]}
                  onPress={() => choose({ kind: 'message', id: m.id, text: m.text })}
                >
                  <Text style={styles.optRadio}>{on ? '◉' : '○'}</Text>
                  <Text style={styles.optText} numberOfLines={2}>
                    {m.isBookmarked ? '★ ' : ''}{m.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 12 }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: COLORS.ink, fontFamily: FONTS.serifKoBold, fontSize: 18 },
  close: { color: COLORS.ink3, fontSize: 20, paddingHorizontal: 4 },
  sectionLabel: { color: COLORS.ink2, fontSize: 13, fontWeight: '600', marginBottom: 8 },

  previewBlock: { marginBottom: 12 },
  previewSmallWrap: { width: '55%' },
  preview: {
    backgroundColor: '#141922',
    borderRadius: 20,
    padding: 14,
  },
  previewTopRow: { flexDirection: 'row', alignItems: 'center' },
  previewHead: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  previewCity: { color: '#D8FFFFFF', fontSize: 13, marginLeft: 8, flex: 1, textAlign: 'right' },
  previewRange: { color: '#B8FFFFFF', fontSize: 12, marginTop: 4 },
  previewMsg: { color: '#FFFFFF', fontSize: 14, marginTop: 8 },

  addBtn: {
    marginTop: 8,
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnText: { color: COLORS.emberText, fontFamily: FONTS.serifKoBold, fontSize: 14 },

  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: RADII.btn,
    marginBottom: 4,
  },
  optActive: { backgroundColor: COLORS.emberSoft },
  optRadio: { color: COLORS.ember, fontSize: 16, width: 24 },
  optText: { color: COLORS.ink, fontSize: 14, flex: 1 },
});
