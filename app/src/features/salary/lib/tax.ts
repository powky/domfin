/** What the employee pays the TSS out of the salary (Ley 87-01): 2.87% to the AFP and 3.04% to the SFS. It comes off before the ISR. */
export const AFP_RATE = 0.0287;
export const SFS_RATE = 0.0304;
export const TSS_RATE = AFP_RATE + SFS_RATE;

/**
 * The DGII's yearly ISR scale for salaries in 2026, in cents: from each
 * amount on, a fixed tax plus a rate on what's above it. 2027 brings a new
 * one.
 */
const ISR_SCALE = [
  { from: 416_220_01, base: 0, rate: 0.15 },
  { from: 624_329_01, base: 31_216_00, rate: 0.2 },
  { from: 867_123_01, base: 79_776_00, rate: 0.25 },
];

/** The yearly ISR on a taxable income, in cents. */
export function annualIsr(taxable: number) {
  const bracket = ISR_SCALE.findLast((step) => taxable >= step.from);
  return bracket ? Math.round(bracket.base + (taxable - bracket.from) * bracket.rate) : 0;
}

/**
 * What a month's gross salary pays by law, in cents, the way payrolls figure
 * it: the AFP and the SFS on the salary, and a twelfth of a year's ISR at
 * that salary, less the TSS.
 */
export function deductionsByLaw(gross: number) {
  return {
    isr: Math.round(annualIsr(gross * 12 * (1 - TSS_RATE)) / 12),
    afp: Math.round(gross * AFP_RATE),
    sfs: Math.round(gross * SFS_RATE),
  };
}
