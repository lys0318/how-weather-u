import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';

type Provider = 'google' | 'kakao';

/**
 * 게스트 → 정식 계정 전환.
 *
 * 전환 유도가 홈·히스토리·설정 세 곳에 필요한데 화면마다 로딩 상태와 에러 처리를
 * 따로 두면 어긋나기 쉬워 한곳에 모은다. 설정 화면에만 있던 기존 경로는 구글만
 * 호출하고 있어서, 카카오로 가입하려는 사용자는 전환할 방법이 아예 없었다.
 */
export function useGuestUpgrade() {
  const { signInWithGoogle, signInWithKakao } = useAuth();
  const { t } = useI18n();
  const [upgrading, setUpgrading] = useState<Provider | null>(null);

  const run = async (provider: Provider) => {
    if (upgrading) return; // 중복 탭 방지
    setUpgrading(provider);
    try {
      await (provider === 'kakao' ? signInWithKakao() : signInWithGoogle());
      // 성공 시 세션이 바뀌며 화면이 자동 전환되므로 여기서 할 일은 없다
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('login.genericError');
      Alert.alert(t('login.failTitle'), msg);
    } finally {
      setUpgrading(null);
    }
  };

  return {
    upgrading,
    busy: upgrading !== null,
    upgradeWithGoogle: () => run('google'),
    upgradeWithKakao: () => run('kakao'),
  };
}
