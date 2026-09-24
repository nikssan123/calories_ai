import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { InsetGroup, InsetRow } from '@/components/InsetGroup';
import { Switch } from '@/components/Switch';
import { analyticsAvailable, setConsent, storedConsent } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { type as t, useColors } from '@/theme';

/**
 * The measurement answer from the end of setup, where it can be changed.
 *
 * The sheet promises "change this any time under You", and consent that can
 * only be given is not consent — so this row is the other half of
 * `MeasureAsk`, not an extra. Off until somebody said yes; nothing in between.
 *
 * Absent on a build with nothing to measure with (iOS, for now), because a
 * switch that moves nothing would be a promise the app is not keeping.
 */
export function MeasureSettings() {
  const colors = useColors();
  const tr = useT();
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void storedConsent().then((consent) => {
      if (live) setOn(consent === 'granted');
    });
    return () => {
      live = false;
    };
  }, []);

  if (!analyticsAvailable || on === null) return null;

  return (
    <InsetGroup title={tr('setup.privacy')}>
      <InsetRow first>
        <View style={styles.label}>
          <Text style={[t.body, { color: colors.foreground }]}>{tr('setup.measureAds')}</Text>
          <Text style={[t.footnote, { color: colors.mutedForeground }]}>{tr('setup.measureAdsHint')}</Text>
        </View>
        <Switch
          value={on}
          onValueChange={(value) => {
            setOn(value);
            void setConsent(value ? 'granted' : 'denied');
          }}
          accessibilityLabel={tr('setup.measureAds')}
        />
      </InsetRow>
    </InsetGroup>
  );
}

const styles = StyleSheet.create({
  label: { flex: 1, gap: 2 },
});
