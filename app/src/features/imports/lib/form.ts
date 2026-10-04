import type { DocumentPickerAsset } from 'expo-document-picker';

/** A file as React Native's XMLHttpRequest uploads it on iOS and Android (see apiPostForm). */
type NativeFile = { uri: string; name: string; type: string };

/**
 * The form domfin-api's `POST /statements/import` expects: every PDF under
 * `files`. The web picker hands over `File`s; native ones, a file URI.
 */
export function statementForm(assets: DocumentPickerAsset[]) {
  const form = new FormData();
  for (const asset of assets) {
    if (asset.file) {
      form.append('files', asset.file, asset.name);
    } else {
      const file: NativeFile = { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf' };
      form.append('files', file as unknown as Blob);
    }
  }
  return form;
}
