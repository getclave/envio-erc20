export function roundTimestamp(timestamp: number, ms: number = 86400) {
  return (Math.floor(timestamp / ms) * ms).toString();
}
