// 홈의 '오늘 가기 좋은 곳' — 날씨 맵 추천 1곳. 누르면 지도 탭에서 그 장소를 연다.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getLastCoords } from '../utils/storage';
import { fetchTopPick, ymdFor, crowdLevel, CROWD_COLOR, distanceLabel, Recommendation } from '../services/tourMap';
import { CONDITION_META } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';
import { useI18n } from '../i18n';

interface Props {
  /** 날씨가 새로 들어오면(위치가 바뀌었을 수 있음) 다시 고른다 */
  stamp: unknown;
}

export default function TodayPickCard({ stamp }: Props) {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const [pick, setPick] = useState<Recommendation | null>(null);

  // 홈에 돌아올 때마다 갱신 (같은 좌표는 10분간 캐시라 서버를 다시 부르지 않는다)
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const c = await getLastCoords();
      if (!c) return;
      try {
        const r = await fetchTopPick(c.lat, c.lon, ymdFor('today'));
        if (alive) setPick(r);
      } catch {
        // 추천을 못 받으면 카드만 숨긴다
      }
    })();
    return () => { alive = false; };
  }, [stamp]));

  if (!pick) return null;
  const { place, reason } = pick;
  const level = crowdLevel(place.crowdRate);
  const temp = place.weather?.tempNow ?? place.weather?.tempMax;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Map', { focus: place })}>
      <View style={styles.head}>
        <Text style={styles.headIcon}>🗺️</Text>
        <Text style={styles.headTitle}>{t('map.pickTitle')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.more}>{t('map.pickMore')} ›</Text>
      </View>
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
  name: { fontFamily: FONTS.serifKoBold, fontSize: 19, color: COLORS.ink, paddingHorizontal: 2 },
  why: { fontFamily: FONTS.serifKo, fontSize: 13.5, color: COLORS.ink2, marginTop: 4, paddingHorizontal: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.ink3 },
});
