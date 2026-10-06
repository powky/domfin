// Lets other apps (Mail, Files, WhatsApp, Drive) share statement PDFs, or
// zips of folders with them, with Domfin, which imports them
// (src/features/imports/api/useSharedStatements.ts). expo-sharing adds a share
// extension on iOS and the intent filters on Android; this asks it for PDFs
// and zips only, one or several at a time.
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withPlugins } = require('expo/config-plugins');

// iOS shows Domfin in the share sheet when every item shared is a PDF or a zip.
const ONLY_PDFS_AND_ZIPS =
  'SUBQUERY (extensionItems, $item, $item.attachments.@count > 0 AND ' +
  'SUBQUERY ($item.attachments, $attachment, ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "com.adobe.pdf" ' +
  'OR ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "public.zip-archive")' +
  '.@count == $item.attachments.@count).@count >= 1';

const TYPES = ['application/pdf', 'application/zip'];

// expo-sharing's extension target. The share sheet shows the extension by
// its display name, which expo-sharing leaves as the target's.
const EXTENSION = 'expo-sharing-extension';
const DISPLAY_NAME = /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/;

/** Names the share extension as the app: "Domfin" under its icon, not "expo-sharing-extension". */
function withExtensionName(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, EXTENSION, 'Info.plist');
      const info = fs.readFileSync(file, 'utf8');
      if (!DISPLAY_NAME.test(info)) throw new Error(`with-statement-sharing: no CFBundleDisplayName in ${file}`);
      fs.writeFileSync(file, info.replace(DISPLAY_NAME, `$1${config.name}$2`));
      return config;
    },
  ]);
}

module.exports = function withStatementSharing(config) {
  // Mods run from the last added to the first: added before expo-sharing's,
  // this one runs after it writes the extension's Info.plist.
  return withPlugins(withExtensionName(config), [
    [
      'expo-sharing',
      {
        ios: { enabled: true, activationRule: ONLY_PDFS_AND_ZIPS },
        android: {
          enabled: true,
          singleShareMimeTypes: TYPES,
          multipleShareMimeTypes: TYPES,
        },
      },
    ],
  ]);
};
