import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  FileUp,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Spin } from '@/components/motion';
import { Button, Card, ProgressBar, Text } from '@/components/ui';
import { formatDate } from '@/lib/dates';

import type { ImportQueue } from '../api/importQueue';
import { accountLabel, sectionLabels } from '../lib/labels';
import { canRetry, progressOf, type QueuedStatement } from '../lib/queue';
import type { ImportResult } from '../types';

type UploadCardProps = {
  queue: ImportQueue;
  onChoose: () => void;
  onRetry: () => void;
  /** This build of the app has no file picker. */
  pickerUnavailable: boolean;
};

const ICON = 18;

/** The button that picks PDFs and, as they import, how each one goes. */
export function UploadCard({ queue, onChoose, onRetry, pickerUnavailable }: UploadCardProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { entries, running } = queue;
  const progress = progressOf(entries);
  const retry = running ? 0 : entries.filter(canRetry).length;
  // What kept PDFs from reaching domfin-api, once each.
  const errors = [...new Set(entries.flatMap((entry) => (entry.error ? [entry.error] : [])))];

  return (
    <Card title={t('imports.upload.title')}>
      <View style={styles.intro}>
        <Text tone="secondary">{t('imports.upload.description')}</Text>
        {Platform.OS === 'web' ? null : <Text tone="secondary">{t('imports.upload.share')}</Text>}
        <Text variant="caption" tone="tertiary">
          {t('imports.upload.supported')}
        </Text>
      </View>
      <View style={styles.action}>
        <Button variant="primary" icon={FileUp} label={t('imports.upload.choose')} onPress={onChoose} />
      </View>
      {pickerUnavailable ? <Alert message={t('imports.errors.picker_unavailable')} /> : null}
      {entries.length > 0 ? (
        <View style={styles.results}>
          <View style={styles.progress}>
            <Text variant="overline" tone="tertiary">
              {running
                ? t('imports.upload.progress', { current: progress.current, total: progress.total })
                : t('imports.upload.results')}
            </Text>
            {running ? (
              <ProgressBar value={progress.finished / progress.total} color={theme.colors.accent.default} />
            ) : null}
          </View>
          {errors.map((error) => (
            <Alert key={error} message={t(`imports.errors.${error}`)} />
          ))}
          {entries.map((entry, index) => (
            <QueuedRow key={entry.id} entry={entry} divided={index > 0} />
          ))}
          {retry > 0 ? (
            <View style={styles.action}>
              <Button icon={RotateCcw} label={t('imports.upload.retry', { count: retry })} onPress={onRetry} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Alert({ message }: { message: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.error} accessibilityRole="alert">
      <TriangleAlert size={ICON} strokeWidth={2} color={theme.colors.accent.default} />
      <Text variant="bodyMedium" style={styles.errorText}>
        {message}
      </Text>
    </View>
  );
}

/** A PDF waiting, importing, or that didn't reach domfin-api; once it answers, its result. */
function QueuedRow({ entry, divided }: { entry: QueuedStatement; divided: boolean }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  if (entry.state === 'done' && entry.result) return <ResultRow result={entry.result} divided={divided} />;

  const detail = entry.state === 'importing' || entry.state === 'waiting' ? entry.state : 'notImported';
  const icon =
    entry.state === 'importing' ? (
      <Spin size={ICON}>
        <LoaderCircle size={ICON} strokeWidth={2} color={theme.colors.accent.default} />
      </Spin>
    ) : entry.state === 'waiting' ? (
      <Clock size={ICON} strokeWidth={2} color={theme.colors.text.tertiary} />
    ) : (
      <CircleX size={ICON} strokeWidth={2} color={theme.colors.negative} />
    );
  return (
    <View style={[styles.row, divided && styles.divider]}>
      {icon}
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {entry.file.name}
        </Text>
        <Text variant="caption" tone="secondary">
          {t(`imports.upload.${detail}`)}
        </Text>
      </View>
    </View>
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
      <Icon size={ICON} strokeWidth={2} color={color} />
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
  progress: {
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
