import { Platform } from 'react-native';

/**
 * Thin HTTP client for domfin-api. Screens never call it directly:
 * each feature wraps it in its own hooks (see features/<feature>/api).
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (await response.json()) as T;
}

/** Sends a multipart form (files) and reads the JSON answer. */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  if (Platform.OS !== 'web') {
    const { status, body } = await sendForm(`${BASE_URL}${path}`, form);
    if (status < 200 || status >= 300) throw new ApiError(status, body);
    return JSON.parse(body) as T;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
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
function sendForm(url: string, form: FormData) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.setRequestHeader('Accept', 'application/json');
    request.onload = () => resolve({ status: request.status, body: request.responseText });
    // Like fetch when nothing answers (see importErrorOf).
    request.onerror = () => reject(new TypeError('Network request failed'));
    request.send(form);
  });
}

/** Sends a JSON body with PUT, POST or PATCH and reads the JSON answer, if any. */
export async function apiSend<T = void>(method: 'PUT' | 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new ApiError(response.status, await response.text());
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Deletes what a path names. */
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new ApiError(response.status, await response.text());
}
