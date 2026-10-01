/** Who a transfer goes to or comes from, as a rule can find it again. */
export type Recipient = {
  /** Text a rule can look for in the description: the name, or the account number. */
  match: string;
  /** How to call them: "Ana Pérez", "cuenta ••6789". */
  label: string;
};

// How the Popular prints transfers to and from people, name last.
const byName = [
  /^MB (?:a|desde) \d+ (.+)$/i, // "MB a 0123456789 Ana Pérez"
  /^TOKE\*? (?:a|de) (.+?)(?: [A-Za-z0-9]{7})?$/i, // "TOKE a Ana P Perez aB12cD3"
  /^LBTR\/IB\/ VIA LBTR \d+ (.+?)(?: BANCO\b.*)?$/i, // "LBTR/IB/ VIA LBTR 1234567890 ANA PEREZ BANCO BHD"
];

// And the ones that only name an account.
const byAccount = [/^Transf\.? (?:via )?MB (?:a|desde) (\d{6,})/i, /^APP INTERB a (\d{6,})/i, /^Pago ACH MB a (\d{6,})/i];

/**
 * The person or account a bank transfer names, or null when the description
 * isn't one: what a rule needs to classify every transfer to them alike.
 */
export function recipientOf(description: string): Recipient | null {
  const text = description.replace(/\s+/g, ' ').trim();
  for (const pattern of byName) {
    const name = pattern.exec(text)?.[1]?.trim();
    if (name && name.length >= 3) return { match: name.toLowerCase(), label: name };
  }
  for (const pattern of byAccount) {
    const account = pattern.exec(text)?.[1];
    if (account) return { match: account, label: `••${account.slice(-4)}` };
  }
  return null;
}
