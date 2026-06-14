// ============================================================
//  하우웨더유 — "하늘 편지 / Sky Letter" 디자인 토큰
//  따뜻한 크림 편지지 + 테라코타 포인트. 날씨 반응형 하늘.
// ============================================================

export const COLORS = {
  // 따뜻한 페이퍼 (배경/표면)
  paper: '#F3ECDF',
  paper2: '#ECE2D1',
  paper3: '#E3D7C2',
  card: '#FBF7EE', // 카드 표면
  noteTop: '#FBF7EF', // 편지 노트 상단
  noteBottom: '#F6EFE2', // 편지 노트 하단

  // 잉크 (텍스트)
  ink: '#2B2620',
  ink2: '#6B6253',
  ink3: '#9A9082',

  // 선
  line: 'rgba(43,38,32,0.13)',
  line2: 'rgba(43,38,32,0.07)',

  // 포인트
  ember: '#C2683F', // 테라코타 — 활성 톤 / CTA
  emberD: '#A6552F',
  emberText: '#FFF5EE',
  emberSoft: 'rgba(194,104,63,0.10)',
  teal: '#4C6E6B', // 조용한 보조
  danger: '#B25B4C', // 차분한 점토색 — 파괴적 동작

  // 하늘 위 텍스트 (on-sky)
  skyText: '#FFFFFF',
  skyText2: 'rgba(255,255,255,0.80)',
  skyText3: 'rgba(255,255,255,0.72)',
  skyGlass: 'rgba(255,255,255,0.16)',
  skyGlassLine: 'rgba(255,255,255,0.24)',
} as const;

// expo-font useFonts 에 등록하는 패밀리 키와 동일하게 사용
export const FONTS = {
  serifKo: 'GowunBatang', // 한글 명조 — 메시지/브랜드 (감성 본문)
  serifKoBold: 'GowunBatangBold',
  serifEn: 'Newsreader', // 영문/숫자 세리프
  serifEnLight: 'NewsreaderLight', // 온도 등 큰 숫자 (라이트)
  mono: 'SplineSansMono', // 데이터/시각/라벨
  monoMedium: 'SplineSansMonoMedium',
} as const;

export const RADII = {
  btn: 15,
  card: 16,
  note: 20,
  sheet: 26,
} as const;
