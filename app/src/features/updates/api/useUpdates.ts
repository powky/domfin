import { useEffect, useSyncExternalStore } from 'react';

import { apiGet } from '@/services/api/client';

import { appVersion, isNewer } from '../lib/version';

type UpdatesResponse = { version?: string; latest?: string; url?: string };

type State = {
  status: 'loading' | 'ready' | 'offline';
  /** The versions running: this app's and domfin-api's. */
  app: string;
  api?: string;
  /** Domfin's latest release on GitHub, and its page. */
  latest?: string;
  url?: string;
};

let state: State = { status: 'loading', app: appVersion };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

/** Asks domfin-api once a session, which asks GitHub at most twice a day. */
function load() {
  request ??= apiGet<UpdatesResponse>('/updates')
    .then(({ version, latest, url }) => {
      state = { status: 'ready', app: appVersion, api: version, latest, url };
    })
    .catch(() => {
      state = { ...state, status: 'offline' };
    })
    .finally(() => listeners.forEach((listener) => listener()));
  return request;
}

/** The versions running and Domfin's latest release; `available` when it's newer than either. */
export function useUpdates() {
  useEffect(() => {
    load();
  }, []);
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const latest = current.latest;
  const available = !!latest && (isNewer(latest, current.app) || (!!current.api && isNewer(latest, current.api)));
  return { ...current, available };
}
