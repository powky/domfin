import { Car, HandCoins, House, PiggyBank, TrendingUp } from 'lucide-react-native';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Avatar } from '@/components/ui';

import type { Institution } from '../types';

export type InstitutionAvatarProps = {
  institution: Institution;
  /** `xs` sits inline with a line of text, like a page subtitle. */
  size?: 'xs' | 'sm' | 'md';
};

const icons = { property: House, shares: TrendingUp, debt: HandCoins, pension: PiggyBank, vehicle: Car };
const iconSizes = { xs: 10, sm: 12, md: 16 };

/**
 * The institution's logo, or its initials on its brand color when there is
 * none; an asset no bank holds shows its kind's icon.
 */
export function InstitutionAvatar({ institution, size = 'md' }: InstitutionAvatarProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ size });
  if (!institution.icon) {
    return <Avatar initials={institution.initials} tone={institution.tone} source={institution.logo} size={size} />;
  }
  const Icon = icons[institution.icon];
  return (
    <View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants">
      <Icon size={iconSizes[size]} strokeWidth={1.75} color={theme.colors.avatar.neutral.foreground} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  icon: {
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.avatar.neutral.background,
    // Same sizes as the shared Avatar.
    variants: {
      size: {
        xs: { width: 20, height: 20 },
        sm: { width: 24, height: 24 },
        md: { width: 32, height: 32 },
      },
    },
  },
}));
