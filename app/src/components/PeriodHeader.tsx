import { Link } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, FileUp, Landmark } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PageHeader } from '@/components/PageHeader';
import { Button, Select, Text, Touchable } from '@/components/ui';
import { i18n } from '@/i18n';
import { formatDate } from '@/lib/dates';
import {
  formatRange,
  periodPresets,
  rangeForPreset,
  shiftRange,
  type MonthRange,
  type PeriodPreset,
} from '@/lib/period';

export type PeriodHeaderProps = PeriodControlsProps & {
  title: string;
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
};

/**
 * Page header for period-based screens (Spending, Net worth, Transactions…):
 * title, latest statement, period stepper, preset dropdown and Import
 * statements (desktop) / accounts shortcut (phones).
 */
export function PeriodHeader({ title, latestStatement, ...period }: PeriodHeaderProps) {
  const { t } = useTranslation();
  return (
    <PageHeader
      title={title}
      subtitle={formatLatestStatement(latestStatement)}
      actions={<PeriodControls {...period} />}
      desktopAction={<ImportButton />}
      mobileAction={
        <Link href="/accounts" asChild>
          <Button icon={Landmark} iconOnly accessibilityLabel={t('nav.accounts')} />
        </Link>
      }
    />
  );
}

/** State for a period picker: a preset plus the (possibly shifted) range. */
export function usePeriod(initial: PeriodPreset = 'ytd') {
  const [preset, setPresetState] = useState<PeriodPreset>(initial);
  const [range, setRange] = useState<MonthRange>(() => rangeForPreset(initial));
  const setPreset = (next: PeriodPreset) => {
    setPresetState(next);
    setRange(rangeForPreset(next));
  };
  return { preset, range, setPreset, setRange };
}

export type PeriodControlsProps = {
  range: MonthRange;
  preset: PeriodPreset;
  onRangeChange: (range: MonthRange) => void;
  onPresetChange: (preset: PeriodPreset) => void;
};

/** "‹ Jan 2026 – Sep 2026 ›" stepper plus the preset dropdown. */
export function PeriodControls({ range, preset, onRangeChange, onPresetChange }: PeriodControlsProps) {
  const { t } = useTranslation();
  const previous = shiftRange(range, -1);
  const next = shiftRange(range, 1);
  return (
    <>
      <View style={styles.stepper}>
        <StepButton
          icon={ChevronLeft}
          onPress={previous ? () => onRangeChange(previous) : undefined}
          accessibilityLabel={t('period.previous')}
        />
        <Text variant="bodyStrong" style={styles.stepperLabel} numberOfLines={1}>
          {formatRange(range)}
        </Text>
        <StepButton
          icon={ChevronRight}
          onPress={next ? () => onRangeChange(next) : undefined}
          accessibilityLabel={t('period.next')}
        />
      </View>
      <Select
        icon={CalendarDays}
        options={periodPresets.map((value) => ({ value, label: t(`period.presets.${value}`) }))}
        value={preset}
        onChange={onPresetChange}
        accessibilityLabel={t('period.label')}
        hideIconOnPhone
      />
    </>
  );
}

/** Goes to the page that imports statements, where the data comes from. */
export function ImportButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link href="/imports" asChild>
      <Button
        icon={FileUp}
        iconOnly={iconOnly}
        label={iconOnly ? undefined : t('nav.imports')}
        accessibilityLabel={t('nav.imports')}
      />
    </Link>
  );
}

/** "From your statements · latest Sep 28, 2026" subtitle text. */
export function formatLatestStatement(date?: string) {
  return date ? i18n.t('period.latestStatement', { date: formatDate(date) }) : i18n.t('period.noStatements');
}

function StepButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
}: {
  icon: typeof ChevronLeft;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { theme } = useUnistyles();
  const disabled = !onPress;
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      surfaceStyle={[styles.stepButton, disabled && styles.stepButtonDisabled]}
      hoverStyle={disabled ? undefined : styles.stepButtonHovered}
    >
      <Icon size={16} strokeWidth={2} color={disabled ? theme.colors.text.tertiary : theme.colors.text.primary} />
    </Touchable>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Separate square buttons around a plain label, as in the designs.
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: { xs: theme.space[1.5], md: theme.space[2] },
  },
  stepperLabel: {
    paddingHorizontal: theme.space[0.5],
    fontSize: { xs: theme.font.size.md, md: theme.font.size.base },
  },
  stepButton: {
    width: { xs: 32, md: 36 },
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stepButtonDisabled: {
    backgroundColor: theme.colors.background,
  },
  stepButtonHovered: {
    backgroundColor: theme.colors.surfaceHover,
  },
}));
