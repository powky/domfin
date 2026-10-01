/**
 * Rough caption width of a y-axis tick ("RD$417.5K"), to size the axis
 * before it renders: capitals and "$" are wide, dots and spaces narrow.
 */
export function tickWidth(text: string) {
  let width = 0;
  for (const char of text) {
    if (/[A-Z$]/.test(char)) width += 9;
    else if (/[.,\s]/.test(char)) width += 3.5;
    else width += 7.2;
  }
  return Math.ceil(width);
}
