import type { Institution } from '../types';

/** Official logos from each bank's website, fitted to a 192 px circle. */
const logos = {
  popular: require('../../../../assets/institutions/popular.png'), // popularenlinea.com
  qik: require('../../../../assets/institutions/qik.png'), // qik.do
  banreservas: require('../../../../assets/institutions/banreservas.png'), // banreservas.com
  bhd: require('../../../../assets/institutions/bhd.png'), // bhd.com.do
};

/** The banks domfin-api reads statements from, by its id for them. */
const banks: Record<string, Omit<Institution, 'syncedAt'>> = {
  popular: { name: 'Banco Popular', initials: 'P', tone: 'blue', logo: logos.popular },
  qik: { name: 'Qik', initials: 'Q', tone: 'blue', logo: logos.qik },
  banreservas: { name: 'Banreservas', initials: 'BR', tone: 'blue', logo: logos.banreservas },
  bhd: { name: 'BHD', initials: 'B', tone: 'green', logo: logos.bhd },
};

/** A bank by domfin-api's id for it ("popular"), with the date of its latest statement. */
export function institutionFor(id: string, syncedAt = ''): Institution {
  return {
    ...(banks[id] ?? { name: id, initials: id.charAt(0).toUpperCase(), tone: 'neutral' }),
    syncedAt,
  };
}
