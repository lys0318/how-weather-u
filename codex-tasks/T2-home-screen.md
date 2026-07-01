# T2 — 홈 화면 재편

**의존 태스크**: T1(hourly/daily 타입), T5(useGenerationGate, AppBanner)
**영향 받는 태스크**: T3 (SkyLetter 컴포넌트 공유)

## 목표

`HomeScreen.tsx`를 "현재 날씨 → 메시지 → 시간별 예보 → 주간 → 생활지수 → 배너" 구조로 재편.
활동/음식/보상형 UI 제거. 신규 컴포넌트 4개 추가.

---

## 신규 파일 1: `src/components/HourlyForecast.tsx`

시간별 가로 스크롤 컴포넌트.

```typescript
import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { HourlySlot, CONDITION_META } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  slots: HourlySlot[];
  currentHour: number;
}

export default function HourlyForecast({ slots, currentHour }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      {slots.map((s, i) => (
        <View key={i} style={[styles.cell, s.hour === currentHour && styles.current]}>
          <Text style={styles.time}>{s.hour === currentHour ? '지금' : `${s.hour}시`}</Text>
          <Text style={styles.icon}>{CONDITION_META[s.condition].emoji}</Text>
          <Text style={styles.temp}>{s.temp}°</Text>
          {s.pop > 0.1 && <Text style={styles.pop}>{Math.round(s.pop * 100)}%</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: 8 },
  cell: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 2, borderRadius: 12 },
  current: { backgroundColor: COLORS.ember + '22' },
  time: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink2 },
  icon: { fontSize: 22, marginVertical: 4 },
  temp: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink1, fontWeight: '600' },
  pop: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.sky },
});
```

---

## 신규 파일 2: `src/components/WeeklyForecast.tsx`

주간(3~4일) 목록 컴포넌트.

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DailySlot, CONDITION_META, DAY_OF_WEEK_KO } from '../constants/weather';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  days: DailySlot[];
}

export default function WeeklyForecast({ days }: Props) {
  return (
    <View style={styles.wrap}>
      {days.map((d, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.day}>{i === 0 ? '오늘' : DAY_OF_WEEK_KO[d.weekdayIdx].slice(0, 1) + '요일'}</Text>
          <Text style={styles.icon}>{CONDITION_META[d.condition].emoji}</Text>
          {d.pop > 0.1 && <Text style={styles.pop}>{Math.round(d.pop * 100)}%</Text>}
          <View style={styles.temps}>
            <Text style={styles.min}>{d.tempMin}°</Text>
            <Text style={styles.sep}> / </Text>
            <Text style={styles.max}>{d.tempMax}°</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.line },
  day: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink1, width: 48 },
  icon: { fontSize: 22, width: 32, textAlign: 'center' },
  pop: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.sky, width: 36 },
  temps: { flexDirection: 'row', marginLeft: 'auto' },
  min: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink3 },
  sep: { color: COLORS.ink3 },
  max: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink1, fontWeight: '600' },
});
```

---

## 신규 파일 3: `src/components/LifeIndex.tsx`

생활지수 3카드 (빨래/우산/마스크).

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WeatherInfo, computeUmbrella, laundryIndex, maskIndex } from '../constants/weather';
import { COLORS, FONTS, RADII } from '../constants/theme';

const LEVEL_COLORS = [COLORS.ember, '#F59E0B', '#EF4444']; // 0=좋음 1=보통 2=나쁨

interface Props { weather: WeatherInfo }

export default function LifeIndex({ weather }: Props) {
  const laundry = laundryIndex(weather);
  const umbrella = computeUmbrella(weather);
  const mask = maskIndex(weather);

  const cards = [
    { icon: '👕', label: '빨래', desc: laundry.ko, level: laundry.level },
    { icon: '☂️', label: '우산', desc: umbrella.reason, level: umbrella.needed ? 2 : 0 },
    { icon: '😷', label: '마스크', desc: mask.ko, level: mask.level },
  ];

  return (
    <View style={styles.row}>
      {cards.map((c, i) => (
        <View key={i} style={[styles.card, { borderColor: LEVEL_COLORS[c.level] + '66' }]}>
          <Text style={styles.icon}>{c.icon}</Text>
          <Text style={styles.label}>{c.label}</Text>
          <Text style={[styles.desc, { color: LEVEL_COLORS[c.level] }]}>{c.desc}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  card: { flex: 1, alignItems: 'center', padding: 12, borderRadius: RADII.card, backgroundColor: COLORS.card, borderWidth: 1 },
  icon: { fontSize: 24 },
  label: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink2, marginTop: 4 },
  desc: { fontFamily: FONTS.body, fontSize: 11, textAlign: 'center', marginTop: 2 },
});
```

---

## 신규 파일 4: `src/components/SkyLetter.tsx`

메시지 생성 UI 공용 컴포넌트. 현재 HomeScreen에 있는 편지 UI + 톤피커 + 공유 로직을 추출.

```typescript
// 현재 HomeScreen.tsx에서 메시지 관련 UI 부분을 이 컴포넌트로 추출한다.
// useMessage 훅 + 톤피커 + 편지 렌더링 + ShareableCard + 공유 버튼

import React from 'react';
import { View } from 'react-native';
import { useMessage } from '../hooks/useMessage';
import { WeatherInfo } from '../constants/weather';
// ... 기존 HomeScreen의 메시지 관련 state/JSX를 여기로 이동

interface Props {
  weather: WeatherInfo;
}

export default function SkyLetter({ weather }: Props) {
  // HomeScreen에서 메시지 관련 state와 JSX를 이동한다.
  // useMessage 훅 호출 포함.
  return (
    <View>
      {/* 톤피커 + 메시지 받기 버튼 + 편지 UI + 공유 버튼 */}
    </View>
  );
}
```

**구현 전략**: HomeScreen.tsx에서 메시지 관련 코드 블록을 식별해 이 파일로 이동.
`useMessage` 훅과 관련 state가 여기 들어온다.

---

## HomeScreen.tsx 수정 지침

### 제거할 항목

1. `useActivity`, `useFood` 훅 import 및 사용 (→ MessagingScreen으로 이동)
2. 활동/음식 추천 카드 JSX 전체
3. 활동/음식 ghost 버튼
4. `handleChargeOnly`, `handleWatchAdForCredit` 함수
5. 충전/보상형 버튼 UI
6. usage dots (현재 위치가 dots로 표시하는 부분)
7. `showRewardedAndGrant`, `isRewardedAvailable` 호출
8. `redeemAdCredit` 호출

### 추가할 항목

1. `import SkyLetter from '../components/SkyLetter'`
2. `import HourlyForecast from '../components/HourlyForecast'`
3. `import WeeklyForecast from '../components/WeeklyForecast'`
4. `import LifeIndex from '../components/LifeIndex'`
5. `import AppBanner from '../components/AppBanner'`
6. `import { runWithGate } from '../hooks/useGenerationGate'`

### 새 레이아웃 순서 (ScrollView 내부)

```
1. 현재 날씨 Hero (기존 유지)
2. <SkyLetter weather={weather} />
3. {weather.hourly && <HourlyForecast slots={weather.hourly} currentHour={currentHour} />}
4. {weather.daily && <WeeklyForecast days={weather.daily} />}
5. {weather && <LifeIndex weather={weather} />}
6. <AppBanner />
```

### 우산 배너 제거

기존 우산 관련 단독 배너(`computeUmbrella` 결과 표시하던 부분) → `LifeIndex`로 흡수됐으므로 제거.

---

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- HomeScreen에 활동/음식/충전/보상형 UI 없음
- `weather.hourly`가 있으면 HourlyForecast 렌더링
- `weather.daily`가 있으면 WeeklyForecast 렌더링
- LifeIndex 3카드 표시
- 하단 배너 표시
