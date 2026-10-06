/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { en } from './en';
import { phone as enPhone } from './en/phone';
import { es } from './es';
import { phone as esPhone } from './es/phone';
import { withOverrides, type Texts } from './types';

/** What only makes sense next to domfin-api, on the computer it runs on. */
const COMPUTER = /domfin-api|esta computadora|this computer|terminal/i;

/** Texts the phone never shows: its engine only hears the app, and has no environment to read a password from. */
const NEVER_ON_PHONE = ['imports.errors.local_only', 'imports.password.environment'];

/** Every text by its key, like "imports.subtitle". */
function flatten(texts: Texts, prefix = ''): [string, string][] {
  return Object.entries(texts).flatMap(([key, text]) =>
    typeof text === 'string' ? [[`${prefix}${key}`, text] as [string, string]] : flatten(text, `${prefix}${key}.`),
  );
}

describe('the phone app’s texts', () => {
  for (const [language, shown] of [
    ['en', withOverrides(en, enPhone)],
    ['es', withOverrides(es, esPhone)],
  ] as const) {
    it(`never mention domfin-api or the computer it runs on (${language})`, () => {
      const wrong = flatten(shown).filter(([key, text]) => COMPUTER.test(text) && !NEVER_ON_PHONE.includes(key));
      assert.deepEqual(wrong, []);
    });
  }

  it('replace only theirs, in a copy', () => {
    const shown = withOverrides(es, esPhone);
    assert.equal(shown.imports.subtitle, esPhone.imports.subtitle);
    assert.equal(shown.imports.title, es.imports.title);
    assert.notEqual(es.imports.subtitle, esPhone.imports.subtitle, 'the dictionary itself stays as it was');
  });
});
