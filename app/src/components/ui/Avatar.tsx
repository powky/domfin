import type { LucideIcon } from 'lucide-react-native';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { AvatarTone } from '@/theme';

import { Text } from './Text';

export type AvatarProps = {
  /** One or two characters shown in the circle. */
  initials: string;
  tone?: AvatarTone;
  /** Logo drawn instead of the initials, clipped to the circle (square images read best). */
  source?: ImageSourcePropType;
  /** Icon drawn instead of the initials, in the tone's foreground color. */
  icon?: LucideIcon;
  /** `xs` (20) sits inline with a line of text, `sm` (24) in compact rows, `md` (32) leads a list item. */
  size?: 'xs' | 'sm' | 'md';
};

/** Icon sizes for each avatar size. */
const iconSizes = { xs: 12, sm: 14, md: 18 } as const;

/** Circular avatar with a logo, an icon or initials. Decorative: the name it stands for is always shown next to it. */
export function Avatar({ initials, tone = 'neutral', source, icon: Icon, size = 'md' }: AvatarProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ size });

  if (source) {
    return (
      <View
        style={[styles.circle, styles.tone('outline'), styles.clip]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Image source={source} style={styles.logo} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={[styles.circle, styles.tone(tone)]} accessible={false} importantForAccessibility="no-hide-descendants">
      {Icon ? (
        <Icon size={iconSizes[size]} strokeWidth={1.75} color={theme.colors.avatar[tone].foreground} />
      ) : (
        <Text style={[styles.initials, styles.toneText(tone)]} numberOfLines={1}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: {
    borderRadius: theme.radius.full,
    borderWidth: theme.layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    variants: {
      size: {
        xs: { width: 20, height: 20 },
        sm: { width: 24, height: 24 },
        md: { width: 32, height: 32 },
      },
    },
  },
  clip: {
    overflow: 'hidden',
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.full,
  },
  initials: {
    fontFamily: theme.font.family.semibold,
    variants: {
      size: {
        xs: { fontSize: theme.font.size.xs, lineHeight: theme.font.lineHeight.xs },
        sm: { fontSize: theme.font.size.xs, lineHeight: theme.font.lineHeight.xs },
        md: { fontSize: theme.font.size.md, lineHeight: theme.font.lineHeight.md },
      },
    },
  },
  tone: (tone: AvatarTone) => ({
    backgroundColor: theme.colors.avatar[tone].background,
    borderColor: theme.colors.avatar[tone].border,
  }),
  toneText: (tone: AvatarTone) => ({
    color: theme.colors.avatar[tone].foreground,
  }),
}));
