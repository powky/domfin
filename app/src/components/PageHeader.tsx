import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AmountsToggle } from '@/components/AmountsToggle';
import { BackLink } from '@/components/BackLink';
import { LogoMark } from '@/components/brand/Logo';
import { Text } from '@/components/ui';
import { usePhoneLayout } from '@/theme';

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
  const phone = usePhoneLayout();
  const subtitleRow = subtitle ? (
    <View style={styles.subtitle}>
      {subtitleIcon}
      <Text variant="caption" tone="secondary" style={styles.subtitleText}>
        {subtitle}
      </Text>
    </View>
  ) : null;

  if (phone) {
    const buttons = (
      <View style={styles.buttons}>
        {mobileAction}
        <AmountsToggle />
      </View>
    );
    const header = (
      <View style={styles.phoneStack}>
        <View style={styles.titleRow}>
          {back ? null : <LogoMark size={32} />}
          <Text variant="display" style={styles.phoneTitle} numberOfLines={2}>
            {title}
          </Text>
          {back ? null : buttons}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
        {subtitleRow}
      </View>
    );
    if (!back) return header;
    return (
      <View style={styles.withBack}>
        <View style={styles.backRow}>
          <BackLink href={back.href} label={back.label} />
          {buttons}
        </View>
        {header}
      </View>
    );
  }

  const header = (
    <View style={styles.desktopRow}>
      <View style={styles.titleBlock}>
        <Text variant="display" numberOfLines={2}>
          {title}
        </Text>
        {subtitleRow}
      </View>
      <View style={styles.actions}>
        {actions}
        {desktopAction}
        <AmountsToggle />
      </View>
    </View>
  );
  if (!back) return header;
  return (
    <View style={styles.withBack}>
      <BackLink href={back.href} label={back.label} />
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
  phoneStack: {
    gap: theme.space[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
  },
  phoneTitle: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  // On a narrow desktop the buttons go under the title instead of squeezing it.
  desktopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    rowGap: theme.space[3],
    columnGap: theme.space[6],
  },
  titleBlock: {
    flexShrink: 1,
    gap: theme.space[1],
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
}));
