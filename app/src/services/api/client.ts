import { AppState } from 'react-native';

import { DomfinEngine } from '../../../modules/domfin-engine';

/**
 * Thin HTTP client for domfin-api. Screens never call it directly:
 * each feature wraps it in its own hooks (see features/<feature>/api).
 */

/** domfin-api on this computer: the launcher's port, or 8080. */
const COMPUTER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

let base: Promise<string> | undefined;

/**
 * Where the API answers. An app with the engine built in (the iOS proof of
 * concept, modules/domfin-engine) starts it and uses its port; the rest talk
 * to domfin-api.
 */
function apiBase() {
  base ??= DomfinEngine ? startEngine(DomfinEngine) : Promise.resolve(COMPUTER_URL);
  return base;
}

async function startEngine(engine: NonNullable<typeof DomfinEngine>) {
  const began = Date.now();
  try {
    const port = await engine.start();
    if (__DEV__) console.log(`motor de Domfin: listo en ${Date.now() - began} ms, puerto ${port}`);
    return `http://localhost:${port}`;
  } catch (error) {
    base = undefined;
    throw error;
  }
}

/** fetch from the API; while developing with the engine, Metro's console shows how long each answer took. */
async function apiFetch(path: string, init: RequestInit) {
  const began = Date.now();
  const response = await fetch(`${await apiBase()}${path}`, init);
  if (__DEV__ && DomfinEngine) {
    console.log(`motor de Domfin: ${init.method ?? 'GET'} ${path} ${response.status} en ${Date.now() - began} ms`);
  }
  return response;
}

// Back from the background, iOS may have closed the engine's socket: start
// opens it again, on the same port.
if (DomfinEngine) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') DomfinEngine?.start().catch(() => undefined);
  });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (await response.json()) as T;
}

/** Sends a multipart form (files) and reads the JSON answer. */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (await response.json()) as T;
}

/** Sends a JSON body with PUT, POST or PATCH and reads the JSON answer, if any. */
export async function apiSend<T = void>(method: 'PUT' | 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method,
    body: JSON.stringify(body),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Deletes what a path names. */
export async function apiDelete(path: string): Promise<void> {
  const response = await apiFetch(path, { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new ApiError(response.status, await response.text());
}
