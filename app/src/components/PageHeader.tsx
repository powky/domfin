import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AmountsToggle } from '@/components/AmountsToggle';
import { LogoMark } from '@/components/brand/Logo';
import { Text } from '@/components/ui';

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Shown before the subtitle, like the institution's logo on an account page. */
  subtitleIcon?: ReactNode;
  /** Controls shown next to the title on desktop and below it on phones. */
  actions?: ReactNode;
  /** Extra action only shown on desktop (end of the actions row). */
  desktopAction?: ReactNode;
  /** Action shown at the right of the title on phones. */
  mobileAction?: ReactNode;
};

/**
 * Page title block. On phones it carries the logo (there is no sidebar)
 * and stacks: title row, actions, subtitle. Every page has the eye that
 * hides amounts, last among its buttons.
 */
export function PageHeader({ title, subtitle, subtitleIcon, actions, desktopAction, mobileAction }: PageHeaderProps) {
  const subtitleContent = (
    <>
      {subtitleIcon}
      <Text variant="caption" tone="secondary" style={styles.subtitleText}>
        {subtitle}
      </Text>
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          <View style={styles.mobileOnly}>
            <LogoMark size={32} />
          </View>
          <Text variant="display" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {mobileAction ? <View style={styles.mobileOnly}>{mobileAction}</View> : null}
          <View style={styles.mobileOnly}>
            <AmountsToggle />
          </View>
        </View>
        {subtitle ? <View style={[styles.subtitle, styles.desktopOnly]}>{subtitleContent}</View> : null}
      </View>
      {/* On phones the eye sits in the title row: without other actions, this row is desktop only. */}
      <View style={[styles.actions, !actions && styles.desktopOnly]}>
        {actions}
        {desktopAction ? <View style={styles.desktopOnly}>{desktopAction}</View> : null}
        <View style={styles.desktopOnly}>
          <AmountsToggle />
        </View>
      </View>
      {subtitle ? <View style={[styles.subtitle, styles.mobileOnly]}>{subtitleContent}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: { xs: 'column', md: 'row' },
    alignItems: { xs: 'stretch', md: 'flex-start' },
    justifyContent: 'space-between',
    gap: { xs: theme.space[3], md: theme.space[6] },
  },
  titleBlock: {
    flexShrink: 1,
    gap: theme.space[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  title: {
    flex: { xs: 1, md: undefined },
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1.5],
  },
  subtitleText: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
  mobileOnly: {
    display: { xs: 'flex', md: 'none' },
  },
  desktopOnly: {
    display: { xs: 'none', md: 'flex' },
  },
}));
