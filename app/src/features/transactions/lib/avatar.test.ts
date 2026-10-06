/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { avatarLook } from './avatar';

const logos = new Set(['uber', 'claro']);
const hasLogo = (id: string) => logos.has(id);

describe('avatarLook', () => {
  it("shows a known merchant's logo, when the app has it", () => {
    assert.deepEqual(avatarLook({ merchantId: 'uber' }, hasLogo), { logo: 'uber' });
    assert.deepEqual(avatarLook({ merchantId: 'unknown-chain' }, hasLogo), { initial: true });
  });

  it('draws an icon for what no company is behind', () => {
    assert.deepEqual(avatarLook({ operation: 'payroll' }, hasLogo), { icon: 'payroll' });
    assert.deepEqual(avatarLook({ operation: 'card' }, hasLogo), { icon: 'card' });
    assert.deepEqual(avatarLook({ operation: 'payment' }, hasLogo), { icon: 'card' });
    assert.deepEqual(avatarLook({ operation: 'something-new' }, hasLogo), { icon: 'account' });
    assert.deepEqual(avatarLook({ person: true }, hasLogo), { icon: 'person' });
    assert.deepEqual(avatarLook({ undetailedCash: true }, hasLogo), { icon: 'cash' });
  });

  it("uses the initial for anything else", () => {
    assert.deepEqual(avatarLook({}, hasLogo), { initial: true });
  });
});
