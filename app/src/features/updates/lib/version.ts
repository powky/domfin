import Constants from 'expo-constants';

/** This app's version, from app.json: "0.1.0". */
export const appVersion = Constants.expoConfig?.version ?? '0.0.0';

/** Whether version a ("0.2.0", "v1.0.0") comes after b, like domfin-api's `updates.Newer`. */
export function isNewer(a: string, b: string) {
  const parse = (version: string) =>
    version
      .replace(/^v/, '')
      .split('-')[0]
      .split('.')
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const [pa, pb] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const [x, y] = [pa[i] ?? 0, pb[i] ?? 0];
    if (x !== y) return x > y;
  }
  return false;
}
