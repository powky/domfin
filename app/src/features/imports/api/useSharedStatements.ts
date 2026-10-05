import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { sharedStatements, type StatementFile } from '../lib/queue';
import { importStatements } from './importQueue';

/**
 * Imports the PDFs another app shares with Domfin (Mail, Files, WhatsApp,
 * Drive), and opens Importar estados to show how they go. expo-sharing
 * hands them over: its share extension on iOS, its intents on Android. The
 * app looks for them when it opens, when it comes back to the front and when
 * the share sheet opens it at domfin://expo-sharing (see app/+native-intent.ts).
 */
export function useSharedStatements() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let looking = false;
    let again = false;
    const look = async () => {
      if (looking) {
        again = true;
        return;
      }
      looking = true;
      try {
        do {
          again = false;
          const files = await takeShared();
          if (files.length > 0) {
            importStatements(files, 'share');
            router.navigate('/imports');
          }
        } while (again);
      } finally {
        looking = false;
      }
    };
    void look();
    const state = AppState.addEventListener('change', (status) => {
      if (status === 'active') void look();
    });
    const link = Linking.addEventListener('url', () => void look());
    return () => {
      state.remove();
      link.remove();
    };
  }, []);
}

/** The PDFs shared with the app since it last looked; it forgets them once taken. */
async function takeShared(): Promise<StatementFile[]> {
  // A build made before sharing was added lacks the module, and has nothing to take.
  if (!requireOptionalNativeModule('ExpoSharing')) return [];
  try {
    const sharing = await import('expo-sharing');
    if (sharing.getSharedPayloads().length === 0) return [];
    const payloads = await sharing.getResolvedSharedPayloadsAsync();
    sharing.clearSharedPayloads();
    return sharedStatements(payloads);
  } catch {
    // What couldn't be read: a build without the share extension's app group, a file already gone.
    return [];
  }
}
