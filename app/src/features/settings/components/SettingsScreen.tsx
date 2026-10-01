import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { CurrencyCard } from '@/features/currency';
import { PdfPasswordCard } from '@/features/imports';
import { PayrollCard, RulesCard } from '@/features/ledger';
import { AboutCard } from '@/features/updates';

import { FormatPreviewCard } from './FormatPreviewCard';
import { LanguageCard } from './LanguageCard';

/** The screen's cards, in order: a feature adds its settings by adding its card here. */
const sections: ComponentType[] = [
  PdfPasswordCard,
  PayrollCard,
  RulesCard,
  LanguageCard,
  CurrencyCard,
  FormatPreviewCard,
  AboutCard,
];

export function SettingsScreen() {
  const { t } = useTranslation();
  return (
    <Screen header={<PageHeader title={t('settings.title')} />}>
      <View style={styles.grid}>
        {sections.map((Section, index) => (
          <View key={index} style={styles.cell}>
            <Section />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Two cards per row from `lg` up, one per row below.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.space[4],
  },
  cell: {
    flexGrow: 1,
    flexBasis: { xs: '100%', lg: '40%' },
    minWidth: 0,
  },
}));
