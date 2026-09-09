import { AppState, AppStateStatus } from 'react-native';

/**
 * 외부 앱으로 전환된 OAuth 로그인이 끝나기를 기다린다.
 *
 * 카카오톡이 설치돼 있으면 카카오 인증 페이지가 뜨자마자 카카오톡 앱으로 전환되고,
 * 그 순간 Custom Tab은 dismiss를 돌려준다. 하지만 로그인은 아직 진행 중이다.
 * 고정 타이머로 끊으면 사용자가 승인 버튼을 누르기 전에 실패 처리된다(실제로
 * 3초 타이머 때문에 카카오 로그인이 매번 실패했다).
 *
 * 그래서 시간이 아니라 "사용자가 우리 앱으로 돌아왔는가"를 기준으로 판단한다.
 *  - 딥링크 도착 → 성공 (URL 반환)
 *  - 외부 앱에 다녀온 뒤 복귀했는데 링크가 없음 → 실패 (null)
 *  - 아무 일 없이 상한 경과 → 실패 (null). 무한 대기 방지용.
 */
export interface WaitOptions {
  /** 복귀 후 링크를 조금 더 기다리는 시간. 복귀 직후 도착하는 경우가 있다. */
  returnGraceMs?: number;
  /** 전체 대기 상한 */
  maxWaitMs?: number;
  /** 테스트 주입용. 기본은 실제 AppState. */
  appState?: Pick<typeof AppState, 'currentState' | 'addEventListener'>;
}

export function waitForLinkOrReturn(
  linkPromise: Promise<string>,
  opts: WaitOptions = {},
): Promise<string | null> {
  const returnGraceMs = opts.returnGraceMs ?? 2500;
  const maxWaitMs = opts.maxWaitMs ?? 3 * 60 * 1000;
  const appState = opts.appState ?? AppState;

  return new Promise((resolve) => {
    let done = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(hardStop);
      if (graceTimer) clearTimeout(graceTimer);
      sub.remove();
      resolve(v);
    };

    linkPromise.then(finish).catch(() => {});

    const hardStop = setTimeout(() => finish(null), maxWaitMs);

    // 외부 앱으로 전환됐다가(=background) 돌아온(=active) 경우만 "사용자가 끝냈다"로 본다.
    // 전환 없이 곧바로 active 이벤트가 오는 경우에 조기 종료하지 않도록 하기 위함.
    let wentBackground = appState.currentState !== 'active';

    const sub = appState.addEventListener('change', (state: AppStateStatus) => {
      if (done) return;
      if (state !== 'active') {
        wentBackground = true;
        return;
      }
      if (!wentBackground) return;
      if (graceTimer) return; // 이미 판정 대기 중
      graceTimer = setTimeout(() => finish(null), returnGraceMs);
    });
  });
}
