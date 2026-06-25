import React from 'react';
import { View, StyleSheet } from 'react-native';
import { getBannerUnitId } from '../services/ads';

let admob: any = null;
try { admob = require('react-native-google-mobile-ads'); } catch {}

export default function AppBanner() {
  const unitId = getBannerUnitId();
  if (!admob || !unitId) return null;
  const { BannerAd, BannerAdSize } = admob;
  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 4 },
});
