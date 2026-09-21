// 날씨 맵 — 주변 관광지를 기온 마커로 보여주고, 테두리 색으로 혼잡 예측을 나타낸다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, Linking, Modal,
} from 'react-native';
import { NaverMapView, NaverMapMarkerOverlay, NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLastCoords } from '../utils/storage';
import { getCurrentCoords } from '../services/weather';
import {
  fetchMapPlaces, fetchRegionPlaces, fetchRegions, medianCenter, COORD_REGIONS,
  crowdLevel, CROWD_COLOR, ymdFor, recommendPlaces, MapPlace, DayKey, RegionGroup, RegionItem,
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
  // 위치를 알아내기 전에 불러오면 서울(폴백) 장소가 뜬다 → 좌표가 정해진 뒤에 부른다
  const [coordsReady, setCoordsReady] = useState(false);
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const myRef = useRef<{ latitude: number; longitude: number } | null>(null);
  useEffect(() => { myRef.current = myCoords; }, [myCoords]);
  // 카메라를 state로 고정하면 사용자가 확대·이동할 때마다 원래 자리로 되돌려버린다
  // → 지도는 자유롭게 두고, 옮길 때만 ref로 직접 명령한다.
  const mapRef = useRef<NaverMapViewRef>(null);
  const [zoom, setZoom] = useState(12);
  const moveTo = useCallback((lat: number, lon: number, z = 13) => {
    mapRef.current?.animateCameraTo({ latitude: lat, longitude: lon, zoom: z, duration: 500 });
  }, []);
  // 지역 선택 — null이면 '내 주변' 모드
  const [region, setRegion] = useState<RegionItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [regions, setRegions] = useState<RegionGroup[] | null>(null);
  const [pickSido, setPickSido] = useState<RegionGroup | null>(null);
  const [day, setDay] = useState<DayKey>('today');
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  // 상세 카드 높이 — 카드가 떠 있으면 '내 위치' 버튼을 그 위로 올린다 (가려지던 문제)
  const [sheetH, setSheetH] = useState(0);

  // 지도 때문에 GPS를 새로 켜지 않는다 — 저장된 좌표 우선, 없을 때만 위치 조회
  useEffect(() => {
    (async () => {
      const saved = await getLastCoords().catch(() => null);
      if (saved) {
        const c = { latitude: saved.lat, longitude: saved.lon };
        setCenter(c); setMyCoords(c);
      } else {
        try {
          const c = await getCurrentCoords();
          const co = { latitude: c.lat, longitude: c.lon };
          setCenter(co); setMyCoords(co);
        } catch {
          // 권한이 없으면 서울 기준으로 둘러보게 둔다
        }
      }
      setCoordsReady(true);
    })();
  }, []);

  const load = useCallback(async (lat: number, lon: number, key: DayKey, reg: RegionItem | null) => {
    setLoading(true);
    setError(null);
    try {
      const ymd = ymdFor(key);
      let list: MapPlace[];
      if (reg) {
        const coord = COORD_REGIONS[reg.cd];
        const me = myRef.current;
        list = coord
          ? await fetchMapPlaces(coord.lat, coord.lon, ymd)
          : await fetchRegionPlaces(reg.cd, ymd, me ? { lat: me.latitude, lon: me.longitude } : null);
        const mc = medianCenter(list);
        if (mc) moveTo(mc.latitude, mc.longitude, 12);
      } else {
        list = await fetchMapPlaces(lat, lon, ymd);
      }
      setPlaces(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.genError'));
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [t, moveTo]);

  useEffect(() => {
    if (!coordsReady) return;
    load(center.latitude, center.longitude, day, region);
  }, [coordsReady, center.latitude, center.longitude, day, region, load]);

  const openPicker = async () => {
    setPickSido(null);
    setPickerOpen(true);
    if (!regions) {
      try { setRegions(await fetchRegions()); } catch { setRegions([]); }
    }
  };

  // 도심은 장소가 몰려 있어 마커가 서로 덮인다 → 일정 간격 안에는 하나만 남긴다.
  // 우선순위: 혼잡 정보가 있는 곳 > 가까운 곳.
  const markers = useMemo(() => {
    // 확대할수록 촘촘히 보여준다 (줌 12에서 약 1.1km 간격 기준)
    const MIN_GAP_DEG = 0.011 * Math.pow(2, 12 - zoom);
    const cap = zoom >= 13 ? 40 : 20;
    const ranked = [...places].sort((a, b) => {
      const ac = a.crowdRate === null ? 1 : 0;
      const bc = b.crowdRate === null ? 1 : 0;
      return ac !== bc ? ac - bc : a.distanceM - b.distanceM;
    });
    const kept: MapPlace[] = [];
    for (const p of ranked) {
      if (kept.length >= cap) break;
      const tooClose = kept.some(
        (k) => Math.abs(k.lat - p.lat) < MIN_GAP_DEG && Math.abs(k.lon - p.lon) < MIN_GAP_DEG,
      );
      if (!tooClose) kept.push(p);
    }
    return kept;
  }, [places, zoom]);

  // 추천 3곳 — 날씨·혼잡도·거리로 점수를 매긴다 (서버 호출 없음)
  const recs = useMemo(() => recommendPlaces(places, region ? Infinity : 30), [places, region]);

  const openDirections = (p: MapPlace) => {
    // 네이버 지도 앱이 없으면 웹으로 열린다
    const url = `nmap://place?lat=${p.lat}&lng=${p.lon}&name=${encodeURIComponent(p.title)}&appname=com.howweatheryou.app`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://map.naver.com/p/search/${encodeURIComponent(p.title)}`).catch(() => {});
    });
  };

  return (
    <View style={styles.fill}>
      {/* 좌표가 정해진 뒤에 지도를 올린다 — initialCamera가 내 위치로 잡히도록 */}
      {coordsReady && (
      <NaverMapView
        style={styles.fill}
        ref={mapRef}
        initialCamera={{ ...center, zoom: 12 }}
        isShowZoomControls={false}
        isShowScaleBar={false}
        onTapMap={() => setSelected(null)}
        locationOverlay={myCoords ? { isVisible: true, position: myCoords } : undefined}
        onCameraChanged={({ zoom: z }) => {
          if (typeof z === 'number') {
            const rounded = Math.round(z * 2) / 2;
            if (rounded !== zoom) setZoom(rounded);
          }
        }}
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
      )}

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

      <TouchableOpacity style={[styles.regionBtn, { top: insets.top + 60 }]} onPress={openPicker}>
        <Text style={styles.regionBtnText} numberOfLines={1}>
          📍 {region ? region.nm : t('map.nearMe')} ▾
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.ember} />
          <Text style={styles.loadingText}>{t('map.loading')}</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{error}</Text>
          <TouchableOpacity onPress={() => load(center.latitude, center.longitude, day, region)}>
            <Text style={styles.retry}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && places.length === 0 && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t('map.empty')}</Text>
        </View>
      )}

      {/* 내 위치로 */}
      {myCoords && (
        <TouchableOpacity
          style={[styles.myLoc, { bottom: selected ? sheetH + 20 : 150 }]}
          onPress={() => {
            setSelected(null);
            setRegion(null);
            moveTo(myCoords.latitude, myCoords.longitude, 13);
            setCenter(myCoords);
          }}
        >
          <Text style={styles.myLocText}>{t('map.myLocation')}</Text>
        </TouchableOpacity>
      )}

      {/* 추천 3곳 — 장소를 고르면 상세 카드로 바뀐다 */}
      {!selected && !loading && recs.length > 0 && (
        <View style={styles.recWrap}>
          <Text style={styles.recTitle}>{t('map.recTitle')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recRow}>
            {recs.map(({ place, reason }) => (
              <TouchableOpacity
                key={place.id}
                style={styles.recCard}
                onPress={() => {
                  setSelected(place);
                  moveTo(place.lat, place.lon, 14);
                }}
              >
                <Text style={styles.recName} numberOfLines={1}>{place.title}</Text>
                <Text style={styles.recWhy} numberOfLines={2}>{t(`map.reason.${reason}`)}</Text>
                <View style={styles.recMeta}>
                  <View style={[styles.dot, { backgroundColor: CROWD_COLOR[crowdLevel(place.crowdRate)] }]} />
                  <Text style={styles.recMetaText}>
                    {/* 마커와 같은 값(지금 기온, 미래 날짜면 최고)을 써야 서로 달라 보이지 않는다 */}
                    {(() => {
                      const tv = place.weather?.tempNow ?? place.weather?.tempMax;
                      return tv === null || tv === undefined ? '' : `${tv}° · `;
                    })()}
                    {place.distanceM >= 1000
                      ? t('map.distanceKm', { km: (place.distanceM / 1000).toFixed(1) })
                      : t('map.distanceM', { m: place.distanceM })}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 선택한 장소 */}
      {selected && (
        <View style={styles.sheet} onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
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
      {/* 지역 선택 — 시/도 → 시/군/구 */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={[styles.picker, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.pickerHead}>
              {pickSido ? (
                <TouchableOpacity onPress={() => setPickSido(null)}>
                  <Text style={styles.pickerNav}>‹ {t('map.back')}</Text>
                </TouchableOpacity>
              ) : <View />}
              <Text style={styles.pickerTitle}>{pickSido ? pickSido.regnNm : t('map.regionTitle')}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={styles.pickerNav}>{t('map.close')}</Text>
              </TouchableOpacity>
            </View>
            {!regions ? (
              <ActivityIndicator color={COLORS.ember} style={{ marginVertical: 30 }} />
            ) : (
              <ScrollView contentContainerStyle={styles.pickerGrid}>
                {!pickSido && (
                  <TouchableOpacity
                    style={[styles.pickerChip, !region && styles.pickerChipOn]}
                    onPress={() => {
                      setPickerOpen(false);
                      setRegion(null);
                      if (myCoords) { moveTo(myCoords.latitude, myCoords.longitude, 12); setCenter(myCoords); }
                    }}
                  >
                    <Text style={[styles.pickerChipText, !region && styles.pickerChipTextOn]}>{t('map.nearMe')}</Text>
                  </TouchableOpacity>
                )}
                {(pickSido ? pickSido.list : regions).map((it: any) => {
                  const isSido = !pickSido;
                  const key = isSido ? it.regnCd : it.cd;
                  const label = isSido ? it.regnNm : it.nm;
                  const on = !isSido && region?.cd === it.cd;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.pickerChip, on && styles.pickerChipOn]}
                      onPress={() => {
                        if (isSido) {
                          // 시군구가 하나뿐이면(세종 등) 바로 고른다
                          if (it.list.length === 1) {
                            setPickerOpen(false); setSelected(null); setRegion(it.list[0]);
                          } else {
                            setPickSido(it);
                          }
                        } else {
                          setPickerOpen(false); setSelected(null); setRegion(it);
                        }
                      }}
                    >
                      <Text style={[styles.pickerChipText, on && styles.pickerChipTextOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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

  regionBtn: {
    position: 'absolute', right: 12, maxWidth: 190,
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  regionBtnText: { fontFamily: FONTS.serifKo, fontSize: 13, color: COLORS.ink },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(43,38,32,0.35)', justifyContent: 'flex-end' },
  picker: {
    maxHeight: '78%', backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet, borderTopRightRadius: RADII.sheet,
    paddingTop: 14, paddingHorizontal: 14,
  },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pickerTitle: { fontFamily: FONTS.serifKo, fontSize: 16, color: COLORS.ink },
  pickerNav: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.ember, minWidth: 44 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  pickerChip: {
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line,
  },
  pickerChipOn: { backgroundColor: COLORS.ember, borderColor: COLORS.ember },
  pickerChipText: { fontFamily: FONTS.serifKo, fontSize: 13, color: COLORS.ink },
  pickerChipTextOn: { color: COLORS.emberText },

  myLoc: {
    position: 'absolute', right: 12,
    backgroundColor: COLORS.card, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.line,
    paddingVertical: 9, paddingHorizontal: 12,
  },
  myLocText: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.ink2 },

  recWrap: { position: 'absolute', left: 0, right: 0, bottom: 8 },
  recTitle: {
    fontFamily: FONTS.mono, fontSize: 11, color: COLORS.ink2,
    marginLeft: 14, marginBottom: 6,
    backgroundColor: COLORS.card, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.line,
  },
  recRow: { paddingHorizontal: 10, gap: 8 },
  recCard: {
    width: 190, backgroundColor: COLORS.card,
    borderRadius: RADII.card, borderWidth: 1, borderColor: COLORS.line,
    padding: 10, gap: 3,
  },
  recName: { fontFamily: FONTS.serifKo, fontSize: 14, color: COLORS.ink },
  recWhy: { fontFamily: FONTS.serifKo, fontSize: 11.5, color: COLORS.ink2, lineHeight: 16 },
  recMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  recMetaText: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.ink3 },

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
