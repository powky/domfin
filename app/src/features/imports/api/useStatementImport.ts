import { useCallback, useState } from 'react';

import { apiPostForm } from '@/services/api/client';

import { importErrorOf } from '../lib/errors';
import { statementForm } from '../lib/form';
import type { ImportError, ImportResult } from '../types';

export type ImportState =
  | { status: 'idle' }
  | { status: 'uploading'; files: number }
  | { status: 'done'; results: ImportResult[] }
  | { status: 'error'; error: ImportError | 'picker_unavailable' };

/**
 * Picks PDFs and sends them to domfin-api, which imports what it recognizes.
 * `onImported` runs after every upload that got an answer.
 */
export function useStatementImport(onImported?: () => void) {
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  const choose = useCallback(async () => {
    // Loaded on demand: a native build made before the picker was added
    // lacks its module, and a top-level import would stop the app from opening.
    let picked;
    try {
      const { getDocumentAsync } = await import('expo-document-picker');
      picked = await getDocumentAsync({ type: 'application/pdf', multiple: true, base64: false });
    } catch {
      setState({ status: 'error', error: 'picker_unavailable' });
      return;
    }
    if (picked.canceled || picked.assets.length === 0) return;

    setState({ status: 'uploading', files: picked.assets.length });
    try {
      const { results } = await apiPostForm<{ results: ImportResult[] }>(
        '/statements/import',
        statementForm(picked.assets),
      );
      setState({ status: 'done', results });
      onImported?.();
    } catch (error) {
      setState({ status: 'error', error: importErrorOf(error) });
    }
  }, [onImported]);

  return { state, choose };
}
