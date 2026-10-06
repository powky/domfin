import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { importStatements } from './importQueue';

/**
 * PDFs and zips. Windows' browsers call a zip application/x-zip-compressed,
 * and some only go by the extension; iOS leaves out what it doesn't know.
 */
const PICKABLE = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  ...(Platform.OS === 'web' ? ['.zip'] : []),
];

/**
 * Picks PDFs, or zips of folders with PDFs, and imports them (see
 * importQueue). `unavailable` when this build of the app has no file picker.
 */
export function useStatementPicker() {
  const [unavailable, setUnavailable] = useState(false);

  const choose = useCallback(async () => {
    // Loaded on demand: a native build made before the picker was added
    // lacks its module, and a top-level import would stop the app from opening.
    let picked;
    try {
      const { getDocumentAsync } = await import('expo-document-picker');
      picked = await getDocumentAsync({ type: PICKABLE, multiple: true, base64: false });
    } catch {
      setUnavailable(true);
      return;
    }
    if (picked.canceled) return;
    importStatements(
      picked.assets.map((asset) => ({
        name: asset.name,
        type: asset.mimeType ?? 'application/pdf',
        uri: asset.uri,
        file: asset.file,
      })),
      'picker',
    );
  }, []);

  return { choose, unavailable };
}
