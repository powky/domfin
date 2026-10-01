import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useReducedMotionAtLaunch } from 'react-native-reanimated';

/**
 * Live "reduce motion" preference. Reanimated's own hook only reads the
 * setting at launch; this one also follows changes while the app is open
 * (iOS/Android accessibility settings, `prefers-reduced-motion` on the web).
 */
let systemValue: boolean | null = null;
let override: boolean | null = null;
let subscribed = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

function setSystemValue(value: boolean) {
  if (value === systemValue) return;
  systemValue = value;
  notify();
}

function subscribe(listener: () => void) {
  if (!subscribed) {
    subscribed = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemValue, () => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemValue);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => override ?? systemValue;

/**
 * Forces reduced motion on or off regardless of the system setting (`null`
 * follows the system again). Meant for an in-app setting and for testing.
 */
export function setReducedMotionOverride(value: boolean | null) {
  override = value;
  notify();
}

// Lets you preview reduced motion from the dev console: `__setReducedMotion(true)`.
if (__DEV__) {
  (globalThis as { __setReducedMotion?: typeof setReducedMotionOverride }).__setReducedMotion =
    setReducedMotionOverride;
}

/** Whether animations should avoid movement: fades only, values jump. */
export function useReducedMotion() {
  const atLaunch = useReducedMotionAtLaunch();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? atLaunch;
}
