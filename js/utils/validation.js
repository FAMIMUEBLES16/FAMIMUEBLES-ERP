export function required(value) { return String(value ?? '').trim().length > 0; }
export function positiveNumber(value) { return Number.isFinite(Number(value)) && Number(value) >= 0; }
