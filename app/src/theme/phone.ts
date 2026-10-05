import { useUnistyles } from 'react-native-unistyles';

/**
 * Below `md`: the phone layout (tab bar, stacked rows). Components pick
 * their layout with this and draw only that one, instead of hiding the
 * other with `display: 'none'`, which crashes React Native's layout in debug
 * builds when the views around it change (facebook/react-native#52349).
 */
export function usePhoneLayout() {
  const { rt } = useUnistyles();
  return rt.breakpoint === 'xs' || rt.breakpoint === 'sm';
}
