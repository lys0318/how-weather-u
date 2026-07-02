import { NativeModules, Platform } from 'react-native';

export interface WidgetPayload {
  head: string;    // "🌤️ 24°"
  city: string;    // "안양시 만안구"
  range: string;   // "최저 20° / 최고 29°"
  message: string; // 표시 한 줄
}

interface WidgetBridgeSpec {
  setData(json: string): void;
  requestPin(size: string): Promise<string>;
}
const Bridge: WidgetBridgeSpec | undefined = NativeModules.WidgetBridge;

// 위젯 데이터 갱신 (안드로이드/브리지 없으면 no-op).
export async function updateWidgetData(p: WidgetPayload): Promise<void> {
  if (Platform.OS !== 'android' || !Bridge) return;
  try {
    Bridge.setData(JSON.stringify(p));
  } catch {
    // 위젯 미추가 등 — 무해
  }
}

// 인앱 위젯 추가 요청. 'unsupported'면 RN에서 수동 추가 안내.
export async function pinWidget(size: 'medium' | 'small'): Promise<'ok' | 'unsupported' | 'error'> {
  if (Platform.OS !== 'android' || !Bridge) return 'unsupported';
  try {
    const r = await Bridge.requestPin(size);
    return r === 'ok' ? 'ok' : 'unsupported';
  } catch {
    return 'error';
  }
}
