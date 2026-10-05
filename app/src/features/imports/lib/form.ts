import type { StatementFile } from './queue';

/** A file as React Native's XMLHttpRequest uploads it on iOS and Android (see apiPostForm). */
type NativeFile = { uri: string; name: string; type: string };

/**
 * The form domfin-api's `POST /statements/import` expects: every PDF under
 * `files`. On the web they're `File`s; on iOS and Android, file URIs.
 */
export function statementForm(files: readonly StatementFile[]) {
  const form = new FormData();
  for (const file of files) {
    if (file.file) {
      form.append('files', file.file, file.name);
    } else if (file.uri) {
      const native: NativeFile = { uri: file.uri, name: file.name, type: file.type };
      form.append('files', native as unknown as Blob);
    }
  }
  return form;
}
