import { CircleCheck, CircleMinus, CircleX, FileUp, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button, Card, Text } from '@/components/ui';
import { formatDate } from '@/lib/dates';

import type { ImportState } from '../api/useStatementImport';
import { accountLabel, sectionLabels } from '../lib/labels';
import type { ImportResult } from '../types';

type UploadCardProps = {
  state: ImportState;
  onChoose: () => void;
};

/** The button that picks PDFs and, after an upload, what happened to each file. */
export function UploadCard({ state, onChoose }: UploadCardProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const uploading = state.status === 'uploading';

  return (
    <Card title={t('imports.upload.title')}>
      <View style={styles.intro}>
        <Text tone="secondary">{t('imports.upload.description')}</Text>
        <Text variant="caption" tone="tertiary">
          {t('imports.upload.supported')}
        </Text>
      </View>
      <View style={styles.action}>
        <Button
          variant="primary"
          icon={FileUp}
          label={uploading ? t('imports.upload.uploading', { count: state.files }) : t('imports.upload.choose')}
          disabled={uploading}
          onPress={onChoose}
        />
      </View>
      {state.status === 'error' ? (
        <View style={styles.error} accessibilityRole="alert">
          <TriangleAlert size={18} strokeWidth={2} color={theme.colors.accent.default} />
          <Text variant="bodyMedium" style={styles.errorText}>
            {t(`imports.errors.${state.error}`)}
          </Text>
        </View>
      ) : null}
      {state.status === 'done' ? (
        <View style={styles.results}>
          <Text variant="overline" tone="tertiary">
            {t('imports.upload.results')}
          </Text>
          {state.results.map((result, index) => (
            <ResultRow key={`${result.file}-${index}`} result={result} divided={index > 0} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ResultRow({ result, divided }: { result: ImportResult; divided: boolean }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const issues = result.issues ?? [];

  let Icon: LucideIcon = CircleCheck;
  let color: string = theme.colors.positive;
  let title = result.file;
  let details: string[] = [];
  if (result.status === 'skipped') {
    Icon = CircleMinus;
    color = theme.colors.text.tertiary;
    details = [t('imports.reasons.unsupported')];
  } else if (result.status === 'failed') {
    Icon = CircleX;
    color = theme.colors.negative;
    details = [t(`imports.reasons.${result.reason ?? 'unreadable'}`, { detail: result.detail ?? '' })];
  } else if (result.account && result.date) {
    if (issues.length > 0) {
      Icon = TriangleAlert;
      color = theme.colors.accent.default;
    }
    title = accountLabel(result.account);
    const period =
      result.account.kind === 'loan' || result.account.kind === 'certificate'
        ? result.from
          ? t('imports.historyRange', { from: formatDate(result.from), to: formatDate(result.date) })
          : t('imports.historyDate', { date: formatDate(result.date) })
        : t('imports.cutDate', { date: formatDate(result.date) });
    details = [t(`imports.status.${result.status}`), period, ...sectionLabels(result.sections)];
  }

  return (
    <View style={[styles.row, divided && styles.divider]}>
      <Icon size={18} strokeWidth={2} color={color} />
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="secondary">
          {details.join(' · ')}
        </Text>
        {title !== result.file ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {result.file}
          </Text>
        ) : null}
        {issues.map((issue) => (
          <Text key={issue} variant="caption" tone="secondary">
            {issue}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  intro: {
    marginTop: -theme.space[2],
    gap: theme.space[1],
  },
  action: {
    flexDirection: 'row',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.accent.muted,
    backgroundColor: theme.colors.accent.subtle,
  },
  errorText: {
    flex: 1,
  },
  results: {
    gap: theme.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space[3],
    paddingVertical: theme.space[3],
  },
  divider: {
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: theme.space[0.5],
  },
}));
