# 하우웨더유 v2 대규모 개편 — Codex 작업 가이드

> **작업 순서**: T1 → T5 → T2 → T3 → T4 → T6 (의존성 순)
> 각 태스크는 `codex-tasks/` 디렉터리의 개별 MD 파일에 상세 스펙이 있다.

## 프로젝트 핵심 정보

- **앱**: React Native + Expo SDK 54 + TypeScript (Old Architecture, `newArchEnabled: false`)
- **백엔드**: Supabase Edge Functions (Deno) — project ref `uxjpsnkecvztwlcbwwuq`
- **AI**: Claude API — 메시지는 `claude-sonnet-4-6`, 나머지는 `claude-haiku-4-5`
- **날씨**: 한국 = 기상청(KMA) API, 해외 = OpenWeather
- **광고**: `react-native-google-mobile-ads` v15 (전면 + 배너)
- **테마 상수**: `src/constants/theme.ts` (COLORS/FONTS/RADII)

## 태스크 목록

| 태스크 | 파일 | 우선순위 | 상태 |
|--------|------|----------|------|
| T1 | [codex-tasks/T1-weather-data.md](codex-tasks/T1-weather-data.md) | 1 — 다른 태스크 기반 | ⬜ 미완 |
| T2 | [codex-tasks/T2-home-screen.md](codex-tasks/T2-home-screen.md) | 3 — T1 완료 후 | ⬜ 미완 |
| T3 | [codex-tasks/T3-messaging-screen.md](codex-tasks/T3-messaging-screen.md) | 4 — T2 완료 후 | ⬜ 미완 |
| T4 | [codex-tasks/T4-fortune-service.md](codex-tasks/T4-fortune-service.md) | 5 — T3 완료 후 | ⬜ 미완 |
| T5 | [codex-tasks/T5-ad-policy.md](codex-tasks/T5-ad-policy.md) | 2 — T1과 병렬 가능 | ⬜ 미완 |
| T6 | [codex-tasks/T6-i18n-version.md](codex-tasks/T6-i18n-version.md) | 6 — 최후 | ⬜ 미완 |

태스크 완료 시 위 표의 `⬜ 미완`을 `✅ 완료`로 변경한다.

## 절대 지켜야 할 규칙

1. **한국어 주석/문자열은 반드시 UTF-8**로 저장. Codex에서 파일 저장 시 인코딩 깨짐 버그 있음 — 한국어 포함 파일 수정 후 반드시 확인.
2. **`forecast`(3h×4) 필드는 절대 삭제/변경 금지** — 서버 엣지함수 payload에서 사용 중.
3. **`docs/store-listing.md`는 건드리지 말 것** — URL이 `https://how-weather-u.pages.dev/`로 세팅돼 있어야 함.
4. **새 의존성 추가 후 반드시 `npx expo install --check`** — SDK 버전 충돌 위험.
5. **광고 ID `USE_TEST_ADS = false` 유지** — 실제 광고 운영 중.

## 검증 체크리스트 (모든 태스크 완료 후)

```bash
cd howweateryou
npx tsc --noEmit                    # 타입 오류 없어야 함
npx expo install --check            # 의존성 버전 정합성
```

육안 확인:
- [ ] 홈: 현재날씨 → 메시지 버튼+편지 → 시간별 가로스크롤 → 주간 3~4일 → 생활지수 3카드 → 하단 배너
- [ ] 메시징 탭: 메시지/활동/음식/운세 + 배너. 탭 순서: 홈·메시징·히스토리·설정
- [ ] 광고: 1회차 무료, 2회차부터 전면광고. 충전/보상형 UI 없음
- [ ] 기존 기능 회귀 없음: 히스토리·공유·알림·설정
