// 네이티브 광고 카드 — 앱 톤(크림/테라코타)에 맞춰 콘텐츠처럼. 'AD' 라벨로 정책 준수.
// 로드 실패/네이티브 모듈 없으면 아무것도 렌더하지 않음 (graceful degrade).

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getNativeUnitId } from '../services/ads';
import { COLORS, FONTS, RADII } from '../constants/theme';
import { useI18n } from '../i18n';

let admob: any = null;
try { admob = require('react-native-google-mobile-ads'); } catch {}

export default function NativeAdCard() {
  const { t } = useI18n();
  const [nativeAd, setNativeAd] = useState<any>(null);
  const unitId = getNativeUnitId();

  useEffect(() => {
    if (!admob || !unitId) return;
    let mounted = true;
    let loaded: any = null;
    admob.NativeAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true })
      .then((ad: any) => {
        if (mounted) { loaded = ad; setNativeAd(ad); }
        else ad.destroy();
      })
      .catch(() => {});
    return () => {
      mounted = false;
      if (loaded) loaded.destroy();
    };
  }, [unitId]);

  if (!admob || !nativeAd) return null;
  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = admob;
  const iconUrl = nativeAd.icon?.url;

  return (
    <NativeAdView nativeAd={nativeAd} style={styles.card}>
      <View style={styles.head}>
        {iconUrl ? <Image source={{ uri: iconUrl }} style={styles.icon} /> : null}
        <View style={{ flex: 1 }}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={1}>{nativeAd.headline}</Text>
          </NativeAsset>
          {nativeAd.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={styles.advertiser} numberOfLines={1}>{nativeAd.advertiser}</Text>
            </NativeAsset>
          ) : null}
        </View>
        <Text style={styles.adBadge}>{t('common.adLabel')}</Text>
      </View>

      {nativeAd.body ? (
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={styles.body} numberOfLines={2}>{nativeAd.body}</Text>
        </NativeAsset>
      ) : null}

      {nativeAd.mediaContent ? (
        <NativeMediaView style={styles.media} resizeMode="cover" />
      ) : null}

      {nativeAd.callToAction ? (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{nativeAd.callToAction}</Text>
          </View>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 9, backgroundColor: COLORS.paper2 },
  headline: { fontFamily: FONTS.serifKoBold, fontSize: 15, color: COLORS.ink },
  advertiser: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.ink3, marginTop: 2 },
  adBadge: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: COLORS.emberD,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: 'rgba(194,104,63,0.30)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  body: { fontFamily: FONTS.serifKo, fontSize: 14, lineHeight: 21, color: COLORS.ink2 },
  media: { width: '100%', height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.paper2 },
  cta: {
    backgroundColor: COLORS.ember,
    borderRadius: RADII.btn,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: { color: COLORS.emberText, fontSize: 14, fontWeight: '600' },
});
