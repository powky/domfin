// The share sheet opens the app at domfin://expo-sharing when another app
// shares PDFs with Domfin (expo-sharing); useSharedStatements imports them.
const SHARED = /^[a-z][\w+.-]*:\/\/expo-sharing(?:[/?#]|$)/i;

/** Where a link from outside the app opens it: the shared PDFs, in Importar estados. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return SHARED.test(path) ? '/imports' : path;
}
