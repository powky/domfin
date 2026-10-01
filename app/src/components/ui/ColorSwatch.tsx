import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type ColorSwatchProps = {
  color: string;
  shape?: 'dot' | 'square';
};

export function ColorSwatch({ color, shape = 'dot' }: ColorSwatchProps) {
  styles.useVariants({ shape });
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create((theme) => ({
  swatch: {
    width: 10,
    height: 10,
    variants: {
      shape: {
        dot: { borderRadius: theme.radius.full },
        square: { borderRadius: 3 },
      },
    },
  },
}));
