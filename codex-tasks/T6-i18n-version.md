# T6 — i18n 추가 + 버전 업 + 정리

**의존 태스크**: T1~T5 모두 완료 후
**작업 순서**: 가장 마지막

## 목표

1. 신규 화면/컴포넌트에 필요한 번역 문구 추가
2. 버전 번호 3곳 동시 업데이트
3. CODEX_TASKS.md 완료 체크

---

## 수정 파일 1: `src/i18n/translations.ts`

### 추가할 번역 키

기존 파일 구조 확인 후 아래 키들을 적절한 위치에 추가.

```typescript
// tabs
'tabs.messaging': { ko: '메시징', en: 'Messaging' },

// messaging screen
'messaging.title': { ko: '메시징', en: 'Messaging' },

// fortune
'fortune.title': { ko: '오늘의 운세', en: "Today's Fortune" },
'fortune.button': { ko: '운세 보기', en: 'Get Fortune' },
'fortune.loading': { ko: '운세 읽는 중...', en: 'Reading fortune...' },

// life index
'lifeIndex.title': { ko: '생활지수', en: 'Life Index' },
'lifeIndex.laundry': { ko: '빨래', en: 'Laundry' },
'lifeIndex.umbrella': { ko: '우산', en: 'Umbrella' },
'lifeIndex.mask': { ko: '마스크', en: 'Mask' },

// hourly forecast
'forecast.hourly': { ko: '시간별 예보', en: 'Hourly' },
'forecast.now': { ko: '지금', en: 'Now' },

// weekly forecast
'forecast.weekly': { ko: '주간 예보', en: 'Weekly' },
'forecast.today': { ko: '오늘', en: 'Today' },
```

### 광고 안내 문구 갱신 (새 정책)

기존 `guide.*` 키들 (충전/보상형 관련)은 사용 안 하게 되므로,
새 안내 문구로 교체:

```typescript
'guide.firstFree': { ko: '오늘 첫 번째는 광고 없이 무료예요', en: 'First one today is ad-free' },
'guide.afterFirst': { ko: '이후엔 짧은 광고를 보고 이용해요', en: 'A short ad plays for the rest' },
```

---

## 수정 파일 2: 버전 번호 3곳 동시 업데이트

**버전**: 1.1.0 / versionCode 28 (대규모 개편이므로 마이너 버전 올림)

### `app.json`

```json
"version": "1.1.0",
"android": {
  "versionCode": 28
}
```

### `android/app/build.gradle`

```gradle
versionCode 28
versionName "1.1.0"
```

### `src/screens/SettingsScreen.tsx`

버전 표시 문자열 `v1.0.24` → `v1.1.0`으로 변경.

---

## CODEX_TASKS.md 업데이트

모든 태스크 완료 후 `CODEX_TASKS.md`의 상태 열을 `✅ 완료`로 변경.

---

## 완료 기준

- `npx tsc --noEmit` 오류 없음
- `npx expo install --check` 의존성 문제 없음
- 버전 번호 3곳 모두 `1.1.0` / `28`
- CODEX_TASKS.md 모든 태스크 완료 표시
