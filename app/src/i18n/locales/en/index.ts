import { accounts } from './accounts';
import { assets } from './assets';
import { backup } from './backup';
import { budget } from './budget';
import { cashFlow } from './cashFlow';
import { classification } from './classification';
import { common } from './common';
import { currency } from './currency';
import { imports } from './imports';
import { loans } from './loans';
import { netWorth } from './netWorth';
import { possessions } from './possessions';
import { salary } from './salary';
import { settings } from './settings';
import { spending } from './spending';
import { transactions } from './transactions';
import { updates } from './updates';

/** The source dictionary: every other language translates these keys. */
export const en = {
  ...common,
  ...settings,
  ...currency,
  ...cashFlow,
  ...spending,
  ...budget,
  ...salary,
  ...transactions,
  ...netWorth,
  ...accounts,
  ...loans,
  ...imports,
  ...classification,
  ...assets,
  ...possessions,
  ...updates,
  ...backup,
} as const;

export type Dictionary = typeof en;
