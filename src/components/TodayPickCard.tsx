// 홈의 '오늘 가기 좋은 곳' — 날씨 맵 추천 1곳. 누르면 지도 탭에서 그 장소를 연다.
// 서버가 처음엔 몇 초 걸릴 수 있어, 오늘 받아둔 추천을 먼저 보여주고 뒤에서 새로 받는다.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getLastCoords, getCachedPick, setCachedPick } from '../utils/storage';
import { fetchTopPick, ymdFor, crowdLevel, CROWD_COLOR, distanceLabel, Recommendation } from '../services/tourMap';
import { isInKorea } from '../services/kma';
import { CONDITION_META } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';
import { useI18n } from '../i18n';

interface Props {
  /** 날씨가 새로 들어오면(위치가 바뀌었을 수 있음) 다시 고른다 */
  stamp: unknown;
  /** 카드 틀 — 보여줄 게 없으면 틀까지 숨긴다 (빈 칸이 남지 않게) */
  style?: StyleProp<ViewStyle>;
}

type State = { kind: 'hidden' } | { kind: 'loading' } | { kind: 'ready'; pick: Recommendation };

export default function TodayPickCard({ stamp, style }: Props) {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const [state, setState] = useState<State>({ kind: 'hidden' });

  // 홈에 돌아올 때마다 갱신 (같은 좌표는 10분간 캐시라 서버를 다시 부르지 않는다)
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const c = await getLastCoords();
      if (!c || !isInKorea(c.lat, c.lon)) {
        if (alive) setState({ kind: 'hidden' });
        return;
      }
      const cached = await getCachedPick<Recommendation>(c.lat, c.lon);
      if (alive) setState((s) => (cached ? { kind: 'ready', pick: cached } : s.kind === 'ready' ? s : { kind: 'loading' }));
      try {
        const r = await fetchTopPick(c.lat, c.lon, ymdFor('today'));
        if (!alive) return;
        if (r) {
          setState({ kind: 'ready', pick: r });
          setCachedPick(c.lat, c.lon, r);
        } else {
          setState({ kind: 'hidden' });
        }
      } catch {
        // 새로 못 받으면 보여주던 걸 그대로 두고, 아무것도 없었으면 숨긴다
        if (alive) setState((s) => (s.kind === 'ready' ? s : { kind: 'hidden' }));
      }
    })();
    return () => { alive = false; };
  }, [stamp]));

  if (state.kind === 'hidden') return null;

  const head = (
    <View style={styles.head}>
      <Text style={styles.headIcon}>🗺️</Text>
      <Text style={styles.headTitle}>{t('map.pickTitle')}</Text>
      <View style={{ flex: 1 }} />
      {state.kind === 'ready' && <Text style={styles.more}>{t('map.pickMore')} ›</Text>}
    </View>
  );

  if (state.kind === 'loading') {
    return (
      <View style={style}>
        {head}
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.ember} />
          <Text style={styles.loadingText}>{t('map.loading')}</Text>
        </View>
      </View>
    );
  }

  const { place, reason } = state.pick;
  const level = crowdLevel(place.crowdRate);
  const temp = place.weather?.tempNow ?? place.weather?.tempMax;

  return (
    <TouchableOpacity style={style} activeOpacity={0.8} onPress={() => navigation.navigate('Map', { focus: place })}>
      {head}
      <Text style={styles.name} numberOfLines={1}>{place.title}</Text>
      <Text style={styles.why}>{t(`map.reason.${reason}`)}</Text>
      <View style={styles.meta}>
        <View style={[styles.dot, { backgroundColor: CROWD_COLOR[level] }]} />
        <Text style={styles.metaText}>
          {t(`map.${level}`)}
          {place.crowdLive ? ` · ${t('map.live')}` : ''}
          {temp === null || temp === undefined
            ? ''
            : ` · ${place.weather ? CONDITION_META[place.weather.sky].emoji : ''}${temp}°`}
          {` · ${distanceLabel(place.distanceM, t)}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 2 },
  headIcon: { fontSize: 16 },
  headTitle: { fontFamily: FONTS.serifKoBold, fontSize: 15, color: COLORS.ink },
  more: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.ember },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingVertical: 14 },
  loadingText: { fontFamily: FONTS.serifKo, fontSize: 13.5, color: COLORS.ink3 },
  name: { fontFamily: FONTS.serifKoBold, fontSize: 19, color: COLORS.ink, paddingHorizontal: 2 },
  why: { fontFamily: FONTS.serifKo, fontSize: 13.5, color: COLORS.ink2, marginTop: 4, paddingHorizontal: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.ink3 },
});
