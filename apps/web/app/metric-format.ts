/** One place that turns a metric's raw value and unit into the string a
 * reader sees. A 0/1 designation flag reads as Yes/No with its actual value
 * kept visible (raw value and unit must always be shown), instead of
 * "1 binary (0/1)". */
export function formatMetricValue(raw: number, unit: string): string {
  if (unit.toLowerCase().startsWith("binary")) {
    return `${raw >= 1 ? "Yes" : "No"} (flag = ${raw})`;
  }
  // Enough digits to be exact for people, few enough to read: 85.625 shows as 85.6.
  const digits = Math.abs(raw) >= 100 ? 0 : Math.abs(raw) >= 10 ? 1 : 2;
  return `${raw.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit}`;
}
