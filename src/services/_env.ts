// React Native의 글로벌 __DEV__ 를 TypeScript에서 안전하게 import
// (Metro가 자동 정의하지만 TS 컴파일러에선 알 수 없음)

declare const __DEV__: boolean;
export { __DEV__ };
