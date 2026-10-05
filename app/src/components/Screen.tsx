import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { EntranceScope, Reveal, useScreenArrival } from '@/components/motion';
import { useArrivalDirection } from '@/components/navigation/direction';

export type ScreenProps = {
  header?: ReactNode;
  children: ReactNode;
};

/**
 * Scrollable page container with consistent gutters and max width. It slides
 * in from the side the user is navigating towards, and its header and cards
 * rise into place one after another.
 */
export function Screen({ header, children }: ScreenProps) {
  const arrival = useScreenArrival(useArrivalDirection());
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      // iOS moves what's typed in above the keyboard; taps on buttons work with it open.
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <EntranceScope>
        <Animated.View style={[styles.inner, arrival]}>
          {header ? <Reveal>{header}</Reveal> : null}
          {children}
        </Animated.View>
      </EntranceScope>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  container: {
    paddingTop: {
      xs: theme.space[4],
      md: theme.space[6],
    },
    paddingBottom: theme.space[6],
    paddingHorizontal: {
      xs: theme.space[4],
      md: theme.space[6],
    },
  },
  inner: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    gap: theme.space[4],
  },
}));
