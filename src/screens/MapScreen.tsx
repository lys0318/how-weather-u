// 날씨 맵 — 지금은 지도만. 장소·혼잡도는 공공데이터 승인 후 얹는다.
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NaverMapView } from '@mj-studio/react-native-naver-map';
import { getLastCoords } from '../utils/storage';
import { COLORS } from '../constants/theme';

// 마지막 위치를 모를 때(첫 실행 등) 기준점 — 서울시청
const FALLBACK = { latitude: 37.5665, longitude: 126.978 };

export default function MapScreen() {
  const [center, setCenter] = useState(FALLBACK);

  // 날씨에 쓰는 마지막 좌표 재사용 — 지도 때문에 GPS를 새로 켜지 않는다
  useEffect(() => {
    getLastCoords()
      .then((c) => {
        if (c) setCenter({ latitude: c.lat, longitude: c.lon });
      })
      .catch(() => {});
  }, []);

  return (
    <View style={styles.fill}>
      <NaverMapView
        style={styles.fill}
        initialCamera={{ ...center, zoom: 12 }}
        isShowZoomControls={false}
        isShowScaleBar={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.paper },
});
