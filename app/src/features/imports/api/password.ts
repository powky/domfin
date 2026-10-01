import { useEffect, useState } from 'react';

import { apiDelete, apiGet, apiSend } from '@/services/api/client';

/** Whether domfin-api has a password for statement PDFs: saved from Settings, or in its environment. Never which. */
export type PdfPassword = { saved: boolean; environment: boolean };

type State = { status: 'loading' | 'ready' | 'offline'; password: PdfPassword };

const fetchPassword = () => apiGet<PdfPassword>('/statements/password');

/** The PDF password's status, and saving or forgetting it in domfin-api. */
export function usePdfPassword() {
  const [state, setState] = useState<State>({ status: 'loading', password: { saved: false, environment: false } });
  const refresh = () =>
    fetchPassword()
      .then((password) => setState({ status: 'ready', password }))
      .catch(() => setState((current) => ({ ...current, status: 'offline' })));
  useEffect(() => {
    let active = true;
    fetchPassword()
      .then((password) => active && setState({ status: 'ready', password }))
      .catch(() => active && setState((current) => ({ ...current, status: 'offline' })));
    return () => {
      active = false;
    };
  }, []);
  return {
    ...state,
    save: (password: string) => apiSend('PUT', '/statements/password', { password }).then(refresh),
    forget: () => apiDelete('/statements/password').then(refresh),
  };
}
