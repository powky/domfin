export const settings = {
  settings: {
    title: 'Settings',
    language: {
      title: 'Language',
      description: "Domfin uses your device's language unless you pick one here.",
      system: 'System',
      systemHint: 'Following your device: {{language}}.',
      savedHint: 'Saved on this device.',
    },
    appearance: {
      title: 'Appearance',
      description: "Domfin uses your device's light or dark mode unless you pick one here.",
      system: 'System',
      light: 'Light',
      dark: 'Dark',
      systemLightHint: 'Following your device: light mode.',
      systemDarkHint: 'Following your device: dark mode.',
      savedHint: 'Saved on this device.',
    },
    format: {
      title: 'Amounts and dates',
      description: "They follow the language you pick and your device's region.",
      amount: 'Amount',
      date: 'Date',
      percent: 'Percentage',
    },
  },
} as const;
