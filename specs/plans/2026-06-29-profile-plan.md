# 구글 프로필 (스펙 B) — 구현 계획

> **For agentic workers:** superpowers:executing-plans로 태스크별. 코드 디테일은 `specs/2026-06-29-profile-design.md` 참조.

**Goal:** 구글 사용자가 선택 프로필(호칭/나이대/직업/관심사/고민) 작성 → 메시지 개인화.

**Architecture:** Supabase `profiles`(RLS+CASCADE) ↔ `profile.ts`(캐시 조회) → `message.ts`가 페이로드에 실음 → `generate-message`가 `<user_profile>` 격리 주입. 설정 Modal 폼. message만 재배포.

## Global Constraints
- 자유텍스트 정제·격리(스펙 A `sanitizeUserText`/`sanitizeFreeText` 재사용). 자유텍스트 상한 200.
- 주입 **메시지만**. `_shared` 미수정 → **generate-message만 재배포**.
- 프로필 전부 선택. 게스트 숨김. 클라우드 PII → 프라이버시 갱신.
- working dir `howweateryou`. 검증 `npx tsc --noEmit`.

---

### Task 1: DB 마이그레이션 + 적용
- Create `supabase/migrations/003_profiles.sql` (스펙 §1 스키마 + RLS 4정책, bookmarks 패턴).
- 적용: Supabase MCP `apply_migration`(name `003_profiles`).
- [ ] 작성 → 적용 → `list_tables`로 profiles + RLS 확인 → 커밋.

### Task 2: `src/services/profile.ts`
- `Profile` 인터페이스(nickname/ageBand/occupation/interests/concern, 전부 옵션).
- `getMyProfile():Promise<Profile|null>` — supabase select `profiles` where user_id=auth.uid() (maybeSingle). 모듈 캐시 `_cache`.
- `upsertMyProfile(p):Promise<void>` — supabase upsert(user_id 포함) → `_cache=p`.
- `getCachedProfile():Promise<Profile|null>` — 캐시 있으면 반환, 없으면 getMyProfile.
- `invalidateProfileCache()`.
- bookmarks.ts의 supabase import/패턴 따름.
- [ ] tsc → 커밋.

### Task 3: i18n `profile.*` (ko/en)
- `translations.ts` ko+en에 `profile` 객체: title, nicknamePh, age10s/20s/30s/40s/50s/private, occStudent/Worker/Homemaker/Jobseeker/Etc, interestsPh, concernPh, save, ageLabel/occLabel/interestsLabel/concernLabel(폼 라벨). `settings.profileRow`('내 프로필' / 'My profile').
- [ ] tsc → 커밋.

### Task 4: `src/components/ProfileEditor.tsx`
- Props `{ visible; onClose }`. 열릴 때 `getMyProfile()`로 state 초기화.
- 폼: 호칭 TextInput(20), 나이대 칩 택1, 직업 칩 택1, 관심사 TextInput(100), 고민 TextInput(200, multiline). [저장]→`upsertMyProfile`→onClose.
- Modal + ScrollView. 칩/입력 스타일 InputSheet/MessagingScreen 패턴.
- [ ] tsc → 커밋.

### Task 5: SettingsScreen — 내 프로필 행
- import ProfileEditor. state `profileOpen`.
- 언어 카드 근처에 **!isGuest일 때만** TouchableOpacity 행(`settings.profileRow`) → setProfileOpen(true).
- `<ProfileEditor visible={profileOpen} onClose={()=>setProfileOpen(false)} />`.
- [ ] tsc → 커밋.

### Task 6: message.ts — 프로필 페이로드
- import `getCachedProfile`.
- `generateMessage` 안에서 `const profile = await getCachedProfile();` → 페이로드 `profile: profile ?? undefined`. (자유텍스트는 서버 sanitize가 처리하니 클라선 그대로 전달; 단 길이는 입력 maxLength로 제한됨.)
- [ ] tsc → 커밋.

### Task 7: 엣지 generate-message — 프로필 격리 주입
- `RequestBody += profile?: { nickname?; ageBand?; occupation?; interests?; concern? }`.
- 파일 **로컬** 라벨맵 `AGE_BAND[lang]`, `OCC[lang]`(스펙 §4; `_shared` 안 건드림).
- `profileBlock` 구성: `<user_profile>` 격리(자유텍스트 `sanitizeUserText`, enum→라벨). 빈 줄 생략, 프로필 없으면 블록 생략. `userPrompt` ko/en 끝에 `${profileBlock}` (noteBlock 옆).
- 시스템 규칙 한 줄에 `<user_profile>` 포함하도록 보강(기존 mood/situation 규칙 확장).
- [ ] **generate-message만 재배포**(`npx supabase functions deploy generate-message ... --no-verify-jwt`).

### Task 8: 프라이버시 갱신
- `docs/privacy-policy.html` 수집항목 표에 행: `프로필(선택) | 호칭·나이대·직업·관심사·고민 | 앱 내 직접 입력`. 이용목적에 "메시지 개인화". 보유기간 "탈퇴 시 삭제".
- `docs/privacy-policy-en.html` 동일(영문).
- [ ] 커밋 → push(Pages 반영).

### Task 9: 검증 + 빌드
- tsc, expo install --check(신규 dep 없음).
- 수동: 프로필 저장→메시지 반영, 게스트 행 없음, 인젝션(고민칸) 무시, 탈퇴 후 profiles 행 삭제(대시보드).
- 버전업(1.1.5/vc33) + AAB 빌드.

## 검증 대응(스펙 §7)
T1(테이블/RLS), T6+T7(주입), T7(인젝션), T1 CASCADE+기존 delete-account(탈퇴삭제), T5(게스트), T8(프라이버시).
