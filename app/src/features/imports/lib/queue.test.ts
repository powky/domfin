/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ImportResult } from '../types';
import { canRetry, needsPassword, progressOf, sharedStatements, type QueuedStatement, type SharedPayload } from './queue';

let next = 0;

/** A PDF in the queue, waiting unless told otherwise. */
function entry(extra: Partial<QueuedStatement> = {}): QueuedStatement {
  next += 1;
  return {
    id: next,
    file: { name: `estado-${next}.pdf`, type: 'application/pdf', uri: `file:///cache/estado-${next}.pdf` },
    source: 'share',
    state: 'waiting',
    ...extra,
  };
}

const failed = (reason: ImportResult['reason']): Partial<QueuedStatement> => ({
  state: 'done',
  result: { file: 'estado.pdf', status: 'failed', reason },
});

/** What expo-sharing hands over on Android: the shared URI, and Domfin's copy named after the file. */
const android = (name: string, id: number, mimeType = 'application/pdf'): SharedPayload => ({
  value: `content://com.example.files/document/${id}`,
  contentUri: `file:/data/user/0/com.powky.domfin/cache/${name}`,
  contentMimeType: mimeType,
  mimeType,
  originalName: name,
});

/** What it hands over on iOS: the copy in the app group, as the value too. */
const ios = (name: string): SharedPayload => {
  const uri = `file:///private/var/mobile/Containers/Shared/AppGroup/ABC/${encodeURIComponent(name)}`;
  return { value: uri, contentUri: uri, contentMimeType: 'application/pdf', mimeType: 'application/pdf', originalName: name };
};

describe('the import queue', () => {
  it('tries again what failed for a reason that can change', () => {
    assert.equal(canRetry(entry({ state: 'error', error: 'offline' })), true);
    assert.equal(canRetry(entry(failed('missing_password'))), true);
    assert.equal(canRetry(entry(failed('wrong_password'))), true);
    assert.equal(canRetry(entry(failed('not_saved'))), true);
    // The same PDF would fail the same way.
    assert.equal(canRetry(entry(failed('unreadable'))), false);
    assert.equal(canRetry(entry({ state: 'done', result: { file: 'otro.pdf', status: 'skipped', reason: 'unsupported' } })), false);
    assert.equal(canRetry(entry({ state: 'done', result: { file: 'estado.pdf', status: 'added' } })), false);
    assert.equal(canRetry(entry()), false);
  });

  it('asks for the password only when a PDF needs it', () => {
    assert.equal(needsPassword([entry(failed('unreadable')), entry({ state: 'error', error: 'offline' })]), false);
    assert.equal(needsPassword([entry(), entry(failed('missing_password'))]), true);
    assert.equal(needsPassword([entry(failed('wrong_password'))]), true);
  });

  it('counts the PDFs finished and the one going', () => {
    assert.deepEqual(progressOf([]), { finished: 0, current: 0, total: 0 });
    const entries = [
      entry({ state: 'done', result: { file: 'a.pdf', status: 'added' } }),
      entry({ state: 'error', error: 'offline' }),
      entry({ state: 'importing' }),
      entry(),
    ];
    assert.deepEqual(progressOf(entries), { finished: 2, current: 3, total: 4 });
    // When one is retried, the count keeps going up.
    assert.deepEqual(progressOf([entry(), entry({ state: 'done', result: { file: 'b.pdf', status: 'added' } })]), {
      finished: 1,
      current: 2,
      total: 2,
    });
  });
});

describe('PDFs shared from another app', () => {
  it('keeps the PDFs, each once, with their names', () => {
    const files = sharedStatements([
      android('popular-ahorro.pdf', 1),
      android('foto.jpg', 2, 'image/jpeg'),
      android('popular-tarjeta.pdf', 3),
      android('popular-tarjeta.pdf', 3),
    ]);
    assert.deepEqual(
      files.map((file) => [file.name, file.uri]),
      [
        ['popular-ahorro.pdf', 'file:/data/user/0/com.powky.domfin/cache/popular-ahorro.pdf'],
        ['popular-tarjeta.pdf', 'content://com.example.files/document/3'],
      ],
    );
  });

  it('reads two PDFs with the same name on Android from what was shared', () => {
    // Both copies went to cache/estado.pdf: the second overwrote the first.
    const files = sharedStatements([android('estado.pdf', 10), android('estado.pdf', 11)]);
    assert.deepEqual(
      files.map((file) => file.uri),
      ['content://com.example.files/document/10', 'content://com.example.files/document/11'],
    );
  });

  it('sends a single copy on iOS when two have the same name', () => {
    assert.equal(sharedStatements([ios('estado.pdf'), ios('estado.pdf')]).length, 1);
  });

  it('knows a PDF by its name when the type is generic, and names it after its file', () => {
    const [file] = sharedStatements([
      { ...ios('Estado de cuenta.pdf'), contentMimeType: 'application/octet-stream', originalName: null },
    ]);
    assert.equal(file.name, 'Estado de cuenta.pdf');
    assert.equal(file.type, 'application/pdf');
    assert.deepEqual(sharedStatements([{ ...ios('nota.txt'), contentMimeType: 'text/plain' }]), []);
    assert.deepEqual(sharedStatements([{ ...ios('vacío.pdf'), contentUri: null }]), []);
  });
});
