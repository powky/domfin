import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';

/** The D, with a peak for its hole: Δ, change, and up. Also in scripts/icons.sh and docs/images/logo.svg. */
const LETTER =
  'M10.1 7.5H16a8.5 8.5 0 0 1 0 17h-5.9a1.6 1.6 0 0 1-1.6-1.6V9.1a1.6 1.6 0 0 1 1.6-1.6ZM12.8 19.58a.8.8 0 0 0 .73 1.12h6.14a.8.8 0 0 0 .73-1.12l-3.07-6.93a.8.8 0 0 0-1.46 0Z';

export function LogoMark({ size = 28 }: { size?: number }) {
  const { theme } = useUnistyles();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Domfin">
      <Rect width={32} height={32} rx={8} fill={theme.colors.brand.mark} />
      <Path d={LETTER} fillRule="evenodd" fill={theme.colors.brand.letter} />
    </Svg>
  );
}

export function Logo() {
  return (
    <View style={styles.row}>
      <LogoMark />
      <Text variant="heading">Domfin</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2.5],
  },
}));
