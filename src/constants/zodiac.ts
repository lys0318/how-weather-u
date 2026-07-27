// 띠(12지) · 별자리(12궁) — 운세 개인화용.
// 생년월일을 저장하지 않기 위해 사용자가 직접 고르는 방식을 쓴다.
// (연도/월일을 받아 계산하면 생년월일과 동등한 개인정보가 되므로 의도적으로 피함)

export type ZodiacAnimal =
  | 'rat' | 'ox' | 'tiger' | 'rabbit' | 'dragon' | 'snake'
  | 'horse' | 'goat' | 'monkey' | 'rooster' | 'dog' | 'pig';

export const ZODIAC_ANIMALS: ZodiacAnimal[] = [
  'rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake',
  'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig',
];

export const ANIMAL_EMOJI: Record<ZodiacAnimal, string> = {
  rat: '🐀', ox: '🐂', tiger: '🐅', rabbit: '🐇', dragon: '🐉', snake: '🐍',
  horse: '🐎', goat: '🐐', monkey: '🐒', rooster: '🐓', dog: '🐕', pig: '🐖',
};

export type StarSign =
  | 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo'
  | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export const STAR_SIGNS: StarSign[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

export const SIGN_EMOJI: Record<StarSign, string> = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋',
  leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏',
  sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
};

/**
 * 태어난 해 → 띠. 프로필 입력에는 쓰지 않고,
 * "몇 년생인지 모르겠다"는 사용자를 위한 보조 계산용으로만 노출한다.
 * 자년(rat) 기준: 1900, 1912, ... 2020
 */
export function animalFromYear(year: number): ZodiacAnimal {
  const idx = ((year - 1900) % 12 + 12) % 12;
  return ZODIAC_ANIMALS[idx];
}

// 각 별자리의 시작일 (월, 일). 시작일 이상이면 해당 별자리.
const SIGN_RANGES: { sign: StarSign; month: number; day: number }[] = [
  { sign: 'capricorn', month: 12, day: 22 },
  { sign: 'sagittarius', month: 11, day: 22 },
  { sign: 'scorpio', month: 10, day: 23 },
  { sign: 'libra', month: 9, day: 23 },
  { sign: 'virgo', month: 8, day: 23 },
  { sign: 'leo', month: 7, day: 23 },
  { sign: 'cancer', month: 6, day: 22 },
  { sign: 'gemini', month: 5, day: 21 },
  { sign: 'taurus', month: 4, day: 20 },
  { sign: 'aries', month: 3, day: 21 },
  { sign: 'pisces', month: 2, day: 19 },
  { sign: 'aquarius', month: 1, day: 20 },
];

/** 월/일 → 별자리. 1월 1~19일은 염소자리(전년 12/22 시작)로 처리된다. */
export function signFromDate(month: number, day: number): StarSign {
  for (const r of SIGN_RANGES) {
    if (month > r.month || (month === r.month && day >= r.day)) return r.sign;
  }
  return 'capricorn'; // 1/1 ~ 1/19
}
