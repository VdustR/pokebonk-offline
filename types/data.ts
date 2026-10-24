export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function record(value: unknown, label = 'object'): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid ${label}: expected object`);
  return value;
}
export function text(value: unknown, label = 'string'): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}: expected string`);
  return value;
}
export function finite(value: unknown, label = 'number'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}: expected finite number`);
  return value;
}
export function list<T>(value: unknown, parse: (value: unknown) => T, label = 'array'): T[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}: expected array`);
  return value.map(parse);
}
export function objectArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(isRecord);
}
export function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, entry]) => [key, text(entry)]));
}
export function errorCode(error: unknown): unknown { return isRecord(error) ? error['code'] : undefined; }
