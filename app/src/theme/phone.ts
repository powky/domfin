import { useUnistyles } from 'react-native-unistyles';

/**
 * Below `md`: the phone layout (tab bar, stacked rows). Components that
 * re-render often pick their layout with this instead of hiding the other
 * one with `display: 'none'`, which can trip React Native's layout in debug
 * builds (facebook/react-native#52349).
 */
export function usePhoneLayout() {
  const { rt } = useUnistyles();
  return rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
}
