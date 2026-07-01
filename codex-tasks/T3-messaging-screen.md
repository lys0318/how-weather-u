# T3 — 메시징 탭 신설

**의존 태스크**: T2(SkyLetter, AppBanner), T5(useGenerationGate)
**영향 받는 태스크**: T4(운세 카드 추가)

## 목표

새 탭 "메시징"을 추가하고, 홈에서 제거된 활동/음식 추천을 여기로 이동.
운세 카드도 이 탭에 들어간다 (T4에서 추가).

탭 순서: **홈 · 메시징 · 히스토리 · 설정**

---

## 수정 파일 1: `App.tsx`

### MainTabParamList에 Messaging 추가

```typescript
export type MainTabParamList = {
  Home: undefined;
  Messaging: undefined;  // 추가
  History: undefined;
  Settings: undefined;
};
```

### MainTabs()에 탭 추가

현재 Home 탭과 History 탭 사이에 삽입:

```typescript
import MessagingScreen from './src/screens/MessagingScreen';

// Tab.Navigator 내부, Home 탭 다음에:
<Tab.Screen
  name="Messaging"
  component={MessagingScreen}
  options={{
    title: t('tabs.messaging'),
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="chatbubble-ellipses" size={size} color={color} />
    ),
  }}
/>
```

---

## 신규 파일: `src/screens/MessagingScreen.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import SkyLetter from '../components/SkyLetter';
import AppBanner from '../components/AppBanner';
import { useActivity } from '../hooks/useActivity';
import { useFood } from '../hooks/useFood';
import { useWeather } from '../hooks/useWeather';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

// 활동/음식 추천 카드 — 기존 HomeScreen에서 이동
// RecCard는 기존 HomeScreen의 카드 UI를 분리하거나 인라인으로 작성

export default function MessagingScreen() {
  const { t } = useI18n();
  const { weather, refresh, loading: weatherLoading } = useWeather();
  const { activity, loadActivity, loading: actLoading } = useActivity(weather);
  const { food, loadFood, loading: foodLoading } = useFood(weather);

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={weatherLoading} onRefresh={refresh} />}
    >
      <View style={styles.content}>
        {/* 오늘의 메시지 — SkyLetter 공용 컴포넌트 */}
        {weather && <SkyLetter weather={weather} />}

        {/* 활동 추천 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('activity.title') ?? '오늘의 활동'}</Text>
          {/* 기존 HomeScreen 활동 카드 JSX 이동 */}
          <TouchableOpacity style={styles.genBtn} onPress={loadActivity} disabled={actLoading}>
            <Text style={styles.genBtnText}>{actLoading ? '생성 중...' : '활동 추천 받기'}</Text>
          </TouchableOpacity>
          {activity && <Text style={styles.result}>{activity}</Text>}
        </View>

        {/* 음식 추천 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('food.title') ?? '오늘의 음식'}</Text>
          <TouchableOpacity style={styles.genBtn} onPress={loadFood} disabled={foodLoading}>
            <Text style={styles.genBtnText}>{foodLoading ? '생성 중...' : '음식 추천 받기'}</Text>
          </TouchableOpacity>
          {food && <Text style={styles.result}>{food}</Text>}
        </View>

        {/* 운세 — T4에서 추가 */}
        {/* <FortuneSection weather={weather} /> */}

        <AppBanner />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: FONTS.body, fontSize: 16, color: COLORS.ink1, fontWeight: '600' },
  genBtn: { backgroundColor: COLORS.ember, borderRadius: RADII.button, padding: 14, alignItems: 'center' },
  genBtnText: { fontFamily: FONTS.body, color: '#fff', fontSize: 15 },
  result: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink1, lineHeight: 22 },
});
```

### 구현 전략

1. `useActivity`, `useFood` 훅은 현재 HomeScreen에서 가져다 쓰고 있음 — 그대로 재사용.
2. 활동/음식 카드 UI는 HomeScreen의 기존 JSX를 최대한 재활용 (복붙 후 화면에 맞게 조정).
3. `useWeather` 훅이 없으면 HomeScrenn의 weather 패턴을 따라 위치 기반으로 날씨 가져오기.
   - 참고: HomeScreen은 `useWeather` 훅을 통해 날씨를 가져옴 (`src/hooks/useWeather.ts`).

---

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- 탭 바에 "메시징" 탭 표시 (아이콘: `chatbubble-ellipses`)
- 탭 순서: 홈 · 메시징 · 히스토리 · 설정
- 메시징 탭에서 활동/음식 추천 동작
- 메시징 탭에서 메시지(편지) 동작 (SkyLetter 통해)
