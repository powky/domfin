import type { ImportError, ImportResult } from '../types';

/** A PDF to import: a browser `File` on the web, a file URI on iOS and Android. */
export type StatementFile = { name: string; type: string; uri?: string; file?: Blob };

/** Where a PDF came from: the file picker, or another app's share sheet. */
export type StatementSource = 'picker' | 'share';

/** A PDF in the import queue, and how it went. */
export type QueuedStatement = {
  id: number;
  file: StatementFile;
  source: StatementSource;
  state: 'waiting' | 'importing' | 'done' | 'error';
  /** domfin-api's answer, once there is one. */
  result?: ImportResult;
  /** Why the upload failed, when domfin-api didn't answer. */
  error?: ImportError;
};

// What can go differently a second time: with the password saved, or when domfin-api can save.
const RETRYABLE: ReadonlySet<string> = new Set(['missing_password', 'wrong_password', 'not_saved']);

/** Whether trying a PDF again could import it. */
export function canRetry(entry: QueuedStatement) {
  if (entry.state === 'error') return true;
  return entry.state === 'done' && entry.result?.status === 'failed' && RETRYABLE.has(entry.result.reason ?? '');
}

/** Whether a PDF couldn't be opened for lack of the right password. */
export function needsPassword(entries: readonly QueuedStatement[]) {
  return entries.some(
    (entry) => entry.result?.reason === 'missing_password' || entry.result?.reason === 'wrong_password',
  );
}

/** How far the queue is: the PDFs finished, the one going (1-based) and how many there are. */
export function progressOf(entries: readonly QueuedStatement[]) {
  const finished = entries.filter((entry) => entry.state === 'done' || entry.state === 'error').length;
  return { finished, current: Math.min(finished + 1, entries.length), total: entries.length };
}

/** What a share sheet hands over for a file: expo-sharing's resolved payload. */
export type SharedPayload = {
  /** What the other app shared: on Android its `content://` URI. */
  value: string;
  /** Domfin's copy of the file. */
  contentUri: string | null;
  contentMimeType: string | null;
  mimeType?: string;
  originalName: string | null;
};

/**
 * The PDFs among what another app shared, each once. expo-sharing copies
 * each file into a folder under its own name, so two PDFs with the same name
 * (two statements both called "estado.pdf") leave a single copy. On Android
 * those are read from what the other app shared instead; on iOS the copy is
 * all there is, and only the last one arrives.
 */
export function sharedStatements(payloads: readonly SharedPayload[]): StatementFile[] {
  const pdfs = payloads.filter((payload): payload is SharedPayload & { contentUri: string } =>
    Boolean(payload.contentUri && isPdf(payload)),
  );
  const copies = new Map<string, number>();
  for (const payload of pdfs) copies.set(payload.contentUri, (copies.get(payload.contentUri) ?? 0) + 1);

  const seen = new Set<string>();
  const files: StatementFile[] = [];
  for (const payload of pdfs) {
    const shared = (copies.get(payload.contentUri) ?? 0) > 1 && payload.value.startsWith('content://');
    const uri = shared ? payload.value : payload.contentUri;
    if (seen.has(uri)) continue;
    seen.add(uri);
    files.push({ uri, name: payload.originalName || nameOf(uri), type: 'application/pdf' });
  }
  return files;
}

function isPdf(payload: SharedPayload) {
  const type = (payload.contentMimeType ?? payload.mimeType ?? '').toLowerCase();
  return type === 'application/pdf' || /\.pdf$/i.test(payload.originalName ?? payload.contentUri ?? '');
}

/** "file:///…/Estado%20de%20cuenta.pdf" → "Estado de cuenta.pdf". */
function nameOf(uri: string) {
  const last = uri.replace(/[?#].*$/, '').split('/').pop() ?? '';
  try {
    return decodeURIComponent(last) || 'statement.pdf';
  } catch {
    return last || 'statement.pdf';
  }
}
