import type { Plan } from '../api/assets';

export type ScheduleItem = {
  key: string;
  kind: 'reservation' | 'downPayment' | 'installment' | 'delivery';
  /** Installments: which one, of how many. */
  number?: number;
  count?: number;
  /** `YYYY-MM-DD`; a delivery without a date has none. */
  date?: string;
  /** Cents of the asset's currency. */
  amount: number;
  /** How much of it the payments made cover. */
  covered: number;
  status: 'paid' | 'partial' | 'due' | 'overdue';
};

/** "2026-01-31" plus 1 month is "2026-02-28": the day, or the month's last one. */
function addMonths(date: string, count: number) {
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + count, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const y = first.getUTCFullYear();
  const m = String(first.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** The installments' due dates, like domfin-api's `Installments.Dates`. */
export function installmentDates(installments: NonNullable<Plan['installments']>): string[] {
  const dates: string[] = [];
  if (installments.everyMonths < 1) return dates;
  for (let n = 0; n <= 600; n++) {
    const date = addMonths(installments.first, n * installments.everyMonths);
    if (date > installments.last) break;
    dates.push(date);
  }
  return dates;
}

/** What the plan asks before handover: reservation, down payment and installments. */
export function plannedBeforeDelivery(plan: Plan) {
  const installments = plan.installments ? plan.installments.amount * installmentDates(plan.installments).length : 0;
  return (plan.reservation?.amount ?? 0) + (plan.downPayment?.amount ?? 0) + installments;
}

/**
 * The plan's payments in order, with what's been paid set against them
 * oldest first: the reservation, the down payment, each installment and
 * what's left of the price on delivery.
 */
export function schedule(plan: Plan, paid: number, today: string): ScheduleItem[] {
  const items: Omit<ScheduleItem, 'covered' | 'status'>[] = [];
  if (plan.reservation) items.push({ key: 'reservation', kind: 'reservation', ...plan.reservation });
  if (plan.downPayment) items.push({ key: 'downPayment', kind: 'downPayment', ...plan.downPayment });
  if (plan.installments) {
    const dates = installmentDates(plan.installments);
    dates.forEach((date, index) =>
      items.push({
        key: `installment-${index}`,
        kind: 'installment',
        number: index + 1,
        count: dates.length,
        date,
        amount: plan.installments!.amount,
      }),
    );
  }
  const rest = plan.price - plannedBeforeDelivery(plan);
  if (plan.price > 0 && rest > 0) items.push({ key: 'delivery', kind: 'delivery', date: plan.delivery, amount: rest });

  let left = paid;
  return items.map((item) => {
    const covered = Math.max(Math.min(left, item.amount), 0);
    left -= covered;
    const status =
      covered >= item.amount ? 'paid' : covered > 0 ? 'partial' : item.date && item.date < today ? 'overdue' : 'due';
    return { ...item, covered, status };
  });
}
