import { AppState, Platform } from 'react-native';

import { DomfinEngine } from '../../../modules/domfin-engine';

/**
 * Thin HTTP client for domfin-api. Screens never call it directly:
 * each feature wraps it in its own hooks (see features/<feature>/api).
 */

/** domfin-api on this computer: the launcher's port, or 8080. */
const COMPUTER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Where the API answers, and the headers each request to it carries. */
type Api = { url: string; headers: Record<string, string> };

/** A request's options, with its headers as a plain object. */
type Init = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

let base: Promise<Api> | undefined;

/**
 * Where the API answers. An app with the engine built in (iOS and Android,
 * modules/domfin-engine) starts it and uses its port; the web talks to
 * domfin-api.
 */
function apiBase() {
  base ??= DomfinEngine ? startEngine(DomfinEngine) : Promise.resolve({ url: COMPUTER_URL, headers: {} });
  return base;
}

async function startEngine(engine: NonNullable<typeof DomfinEngine>): Promise<Api> {
  const began = Date.now();
  try {
    const { port, token } = await engine.start();
    if (__DEV__) console.log(`motor de Domfin: listo en ${Date.now() - began} ms, puerto ${port}`);
    // Other apps on the phone reach 127.0.0.1 too: the engine only answers requests with its token.
    return { url: `http://localhost:${port}`, headers: { Authorization: `Bearer ${token}` } };
  } catch (error) {
    if (__DEV__) console.warn('motor de Domfin: no arrancó', error);
    base = undefined;
    throw error;
  }
}

/** fetch from the API; while developing with the engine, Metro's console shows how long each answer took. */
async function apiFetch(path: string, init: Init) {
  const began = Date.now();
  const { url, headers } = await apiBase();
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (__DEV__ && DomfinEngine) {
    console.log(`motor de Domfin: ${init.method ?? 'GET'} ${path} ${response.status} en ${Date.now() - began} ms`);
  }
  return response;
}

// Back from the background, the system may have closed the engine's socket:
// start opens it again, on the same port.
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

export async function apiGet<T>(path: string, init?: Init): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (await response.json()) as T;
}

/** Sends a multipart form (files) and reads the JSON answer. */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  if (Platform.OS !== 'web') {
    const began = Date.now();
    const { url, headers } = await apiBase();
    const { status, body } = await sendForm(`${url}${path}`, form, headers);
    if (__DEV__ && DomfinEngine) console.log(`motor de Domfin: POST ${path} ${status} en ${Date.now() - began} ms`);
    if (status < 200 || status >= 300) throw new ApiError(status, body);
    return JSON.parse(body) as T;
  }
  const response = await apiFetch(path, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (await response.json()) as T;
}

/**
 * POSTs a form with XMLHttpRequest. On iOS and Android the app's fetch is
 * expo/fetch, which can't send React Native's `{ uri, name, type }` files;
 * XMLHttpRequest still can, with their names.
 */
function sendForm(url: string, form: FormData, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Accept', 'application/json');
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.onload = () => resolve({ status: request.status, body: request.responseText });
    // Like fetch when nothing answers (see importErrorOf).
    request.onerror = () => reject(new TypeError('Network request failed'));
    request.send(form);
  });
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
