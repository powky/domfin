import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components/ui';

export function LogoMark({ size = 28 }: { size?: number }) {
  const { theme } = useUnistyles();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityLabel="Domfin">
      <Circle cx={16} cy={16} r={16} fill={theme.colors.brand.mark} />
      <Path
        d="M7 22.5c3.2-.2 5.6-1.3 7.4-3.4 2-2.4 2.8-5.6 3.1-10.1 2.4 2.6 4.5 6.5 5.1 10.2.3 1.3.9 2.5 2.4 3.3H7Z"
        fill={theme.colors.brand.sail}
      />
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
