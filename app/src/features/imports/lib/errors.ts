import { ApiError } from '@/services/api/client';

import type { ImportError } from '../types';

/** Sorts a failed request into what the screen can tell the user. */
export function importErrorOf(error: unknown): ImportError {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'local_only';
    if (error.status === 413) return 'too_large';
    if (error.status === 503) return 'unavailable';
    return 'failed';
  }
  // fetch rejects with a TypeError when nothing answers.
  if (error instanceof TypeError) return 'offline';
  return 'failed';
}
