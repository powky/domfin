import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AmountsToggle } from '@/components/AmountsToggle';
import { BackLink } from '@/components/BackLink';
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
  /** "‹ All accounts" above a detail page's title. */
  back?: { href: Href; label: string };
};

/**
 * Page title block. On phones it carries the logo (there is no sidebar)
 * and stacks: title row, actions, subtitle. Every page has the eye that
 * hides amounts, last among its buttons. A detail page's back link takes
 * the logo's place on phones, with the buttons beside it, so a long name
 * gets the whole width.
 */
export function PageHeader({
  title,
  subtitle,
  subtitleIcon,
  actions,
  desktopAction,
  mobileAction,
  back,
}: PageHeaderProps) {
  const subtitleContent = (
    <>
      {subtitleIcon}
      <Text variant="caption" tone="secondary" style={styles.subtitleText}>
        {subtitle}
      </Text>
    </>
  );

  const phoneButtons = (
    <View style={[styles.phoneButtons, styles.mobileOnly]}>
      {mobileAction}
      <AmountsToggle />
    </View>
  );

  const header = (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <View style={styles.titleRow}>
          {back ? null : (
            <View style={styles.mobileOnly}>
              <LogoMark size={32} />
            </View>
          )}
          <Text variant="display" style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {back ? null : phoneButtons}
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

  if (!back) return header;
  return (
    <View style={styles.withBack}>
      <View style={styles.backRow}>
        <BackLink href={back.href} label={back.label} />
        {phoneButtons}
      </View>
      {header}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  withBack: {
    gap: { xs: theme.space[2], md: theme.space[1] },
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
  },
  // On a narrow desktop the buttons go under the title instead of squeezing it.
  container: {
    flexDirection: { xs: 'column', md: 'row' },
    flexWrap: { xs: 'nowrap', md: 'wrap' },
    alignItems: { xs: 'stretch', md: 'flex-start' },
    justifyContent: 'space-between',
    rowGap: theme.space[3],
    columnGap: theme.space[6],
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
  phoneButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
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
