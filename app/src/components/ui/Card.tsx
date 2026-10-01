import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Reveal } from '@/components/motion';

import { Text } from './Text';

export type CardProps = ViewProps & {
  title?: string;
  actions?: ReactNode;
};

/** Surface for a section of a screen. Rises into place with its siblings when the screen opens. */
export function Card({ title, actions, children, style, ...props }: CardProps) {
  return (
    <Reveal {...props} style={[styles.card, style]}>
      {(title || actions) && (
        <View style={styles.header}>
          {title ? <Text variant="title">{title}</Text> : <View />}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      )}
      {children}
    </Reveal>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.layout.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: {
      xs: theme.space[4],
      md: theme.space[5],
    },
    gap: theme.space[4],
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: theme.space[3],
    columnGap: theme.space[4],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
}));
