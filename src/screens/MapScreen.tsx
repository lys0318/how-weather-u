// 날씨 맵 — 주변 관광지를 기온 마커로 보여주고, 테두리 색으로 혼잡 예측을 나타낸다.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, Linking,
} from 'react-native';
import { NaverMapView, NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLastCoords } from '../utils/storage';
import { getCurrentCoords } from '../services/weather';
import {
  fetchMapPlaces, crowdLevel, CROWD_COLOR, ymdFor, MapPlace, DayKey,
} from '../services/tourMap';
import { CONDITION_META } from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

const FALLBACK = { latitude: 37.5665, longitude: 126.978 }; // 서울시청
const DAYS: DayKey[] = ['today', 'tomorrow', 'weekend'];

export default function MapScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets(); // 상태바 아래로 내려야 칩이 눌린다
  const [center, setCenter] = useState(FALLBACK);
  // 지도 카메라 — 장소를 불러오면 그 중심으로 옮긴다(마커가 화면 밖에 있으면 아무것도 안 보이므로)
  const [camera, setCamera] = useState({ ...FALLBACK, zoom: 12 });
  const [day, setDay] = useState<DayKey>('today');
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapPlace | null>(null);

  // 지도 때문에 GPS를 새로 켜지 않는다 — 저장된 좌표 우선, 없을 때만 위치 조회
  useEffect(() => {
    (async () => {
      const saved = await getLastCoords().catch(() => null);
      if (saved) { setCenter({ latitude: saved.lat, longitude: saved.lon }); return; }
      try {
        const c = await getCurrentCoords();
        setCenter({ latitude: c.lat, longitude: c.lon });
      } catch {
        // 권한이 없으면 서울 기준으로 둘러보게 둔다
      }
    })();
  }, []);

  const load = useCallback(async (lat: number, lon: number, key: DayKey) => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMapPlaces(lat, lon, ymdFor(key));
      setPlaces(list);
      const shown = list.slice(0, 12);
      if (shown.length > 0) {
        setCamera({
          latitude: shown.reduce((a, p) => a + p.lat, 0) / shown.length,
          longitude: shown.reduce((a, p) => a + p.lon, 0) / shown.length,
          zoom: 12,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.genError'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(center.latitude, center.longitude, day);
  }, [center.latitude, center.longitude, day, load]);

  // 도심은 장소가 몰려 있어 마커가 서로 덮인다 → 일정 간격 안에는 하나만 남긴다.
  // 우선순위: 혼잡 정보가 있는 곳 > 가까운 곳.
  const markers = useMemo(() => {
    const MIN_GAP_DEG = 0.011; // 위경도 약 1.1km — 줌 12에서 알약 마커가 안 겹치는 간격
    const ranked = [...places].sort((a, b) => {
      const ac = a.crowdRate === null ? 1 : 0;
      const bc = b.crowdRate === null ? 1 : 0;
      return ac !== bc ? ac - bc : a.distanceM - b.distanceM;
    });
    const kept: MapPlace[] = [];
    for (const p of ranked) {
      if (kept.length >= 18) break;
      const tooClose = kept.some(
        (k) => Math.abs(k.lat - p.lat) < MIN_GAP_DEG && Math.abs(k.lon - p.lon) < MIN_GAP_DEG,
      );
      if (!tooClose) kept.push(p);
    }
    return kept;
  }, [places]);

  const openDirections = (p: MapPlace) => {
    // 네이버 지도 앱이 없으면 웹으로 열린다
    const url = `nmap://place?lat=${p.lat}&lng=${p.lon}&name=${encodeURIComponent(p.title)}&appname=com.howweatheryou.app`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(p.title)}`).catch(() => {});
    });
  };

  return (
    <View style={styles.fill}>
      <NaverMapView
        style={styles.fill}
        camera={camera}
        isShowZoomControls={false}
        isShowScaleBar={false}
        onTapMap={() => setSelected(null)}
      >
        {markers.map((p) => {
          const level = crowdLevel(p.crowdRate);
          const color = CROWD_COLOR[level];
          const temp = p.weather?.tempNow ?? p.weather?.tempMax;
          const label = temp === null || temp === undefined ? '--' : `${temp}°`;
          const emoji = p.weather ? CONDITION_META[p.weather.sky].emoji : '';
          return (
            <NaverMapMarkerOverlay
              key={p.id}
              latitude={p.lat}
              longitude={p.lon}
              anchor={{ x: 0.5, y: 1 }}
              width={64}
              height={32}
              onTap={() => setSelected(p)}
            >
              <View key={`${p.id}/${label}/${color}`} collapsable={false} style={[styles.pin, { borderColor: color }]}>
                <Text style={styles.pinText}>{emoji}{label}</Text>
              </View>
            </NaverMapMarkerOverlay>
          );
        })}
      </NaverMapView>

      {/* 날짜 선택 */}
      <View style={[styles.dayRow, { top: insets.top + 8 }]}>
        {DAYS.map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => { setSelected(null); setDay(k); }}
            style={[styles.dayChip, day === k && styles.dayChipOn]}
          >
            <Text style={[styles.dayText, day === k && styles.dayTextOn]}>{t(`map.${k}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 범례 */}
      <View style={[styles.legend, { top: insets.top + 60 }]}>
        {(['quiet', 'normal', 'busy'] as const).map((lv) => (
          <View key={lv} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: CROWD_COLOR[lv] }]} />
            <Text style={styles.legendText}>{t(`map.${lv}`)}</Text>
          </View>
        ))}
      </View>

      {!loading && !error && places.length > 0 && (
        <View style={[styles.countChip, { top: insets.top + 60 }]}>
          <Text style={styles.countText}>{t('map.count', { n: places.length })}</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.ember} />
          <Text style={styles.loadingText}>{t('map.loading')}</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{error}</Text>
          <TouchableOpacity onPress={() => load(center.latitude, center.longitude, day)}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && places.length === 0 && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t('map.empty')}</Text>
        </View>
      )}

      {/* 선택한 장소 */}
      {selected && (
        <View style={styles.sheet}>
          <ScrollView horizontal={false} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetTop}>
              {selected.image ? (
                <Image source={{ uri: selected.image }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}><Text style={styles.thumbEmoji}>🏞️</Text></View>
              )}
              <View style={styles.sheetInfo}>
                <Text style={styles.sheetTitle} numberOfLines={2}>{selected.title}</Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  {selected.distanceM >= 1000
                    ? t('map.distanceKm', { km: (selected.distanceM / 1000).toFixed(1) })
                    : t('map.distanceM', { m: selected.distanceM })}
                  {selected.addr ? ` · ${selected.addr}` : ''}
                </Text>
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { borderColor: CROWD_COLOR[crowdLevel(selected.crowdRate)] }]}>
                    <Text style={[styles.badgeText, { color: CROWD_COLOR[crowdLevel(selected.crowdRate)] }]}>
                      {t(`map.${crowdLevel(selected.crowdRate)}`)}
                    </Text>
                  </View>
                  {selected.weather && (
                    <Text style={styles.wx}>
                      {CONDITION_META[selected.weather.sky].emoji}{' '}
                      {selected.weather.tempMin}° / {selected.weather.tempMax}°
                      {selected.weather.pop !== null ? ` · ${t('map.rainPct', { pct: selected.weather.pop })}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.directions} onPress={() => openDirections(selected)}>
              <Text style={styles.directionsText}>{t('map.directions')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.paper },

  pin: {
    width: 64, height: 32,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  pinText: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink, fontWeight: '700' },

  dayRow: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', gap: 6,
    backgroundColor: COLORS.card, borderRadius: 20, padding: 4,
    borderWidth: 1, borderColor: COLORS.line,
  },
  dayChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  dayChipOn: { backgroundColor: COLORS.ember },
  dayText: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ink2 },
  dayTextOn: { color: COLORS.emberText, fontWeight: '700' },

  legend: {
    position: 'absolute', left: 12,
    backgroundColor: COLORS.card, borderRadius: RADII.card,
    borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 6, paddingHorizontal: 9, gap: 4,
  },
  countChip: {
    position: 'absolute', right: 12,
    backgroundColor: COLORS.card, borderRadius: RADII.card,
    borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  countText: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.ink2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.ink2 },

  loading: {
    position: 'absolute', alignSelf: 'center', top: '45%',
    backgroundColor: COLORS.card, borderRadius: RADII.card,
    borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', gap: 6,
  },
  loadingText: { fontFamily: FONTS.serifKo, fontSize: 13, color: COLORS.ink2, textAlign: 'center' },
  retry: { fontFamily: FONTS.serifKo, fontSize: 13, color: COLORS.ember, fontWeight: '700', marginTop: 4 },

  sheet: {
    position: 'absolute', left: 10, right: 10, bottom: 10,
    backgroundColor: COLORS.card, borderRadius: RADII.card,
    borderWidth: 1, borderColor: COLORS.line,
    padding: 12,
  },
  sheetTop: { flexDirection: 'row', gap: 10 },
  thumb: { width: 84, height: 84, borderRadius: 10, backgroundColor: COLORS.paper2 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 28 },
  sheetInfo: { flex: 1, gap: 4 },
  sheetTitle: { fontFamily: FONTS.serifKo, fontSize: 16, color: COLORS.ink },
  sheetSub: { fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink3 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: FONTS.mono, fontSize: 11, fontWeight: '700' },
  wx: { fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.ink2 },

  directions: {
    marginTop: 10, backgroundColor: COLORS.ember,
    borderRadius: RADII.btn, paddingVertical: 11, alignItems: 'center',
  },
  directionsText: { fontFamily: FONTS.serifKo, fontSize: 14, color: COLORS.emberText, fontWeight: '700' },
});
