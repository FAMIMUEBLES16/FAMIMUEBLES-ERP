const OPERATION_TIME_ZONE = 'America/Bogota';

export function calendarDate(value = new Date()) {
	const text = String(value ?? '');
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return text.slice(0, 10);
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: OPERATION_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function shiftCalendarDate(value, days) {
	const date = new Date(`${calendarDate(value)}T12:00:00`);
	date.setDate(date.getDate() + days);
	return calendarDate(date);
}

export function formatDate(date = new Date()) {
	return new Intl.DateTimeFormat('es-CO', { dateStyle:'full', timeZone:OPERATION_TIME_ZONE }).format(new Date(date));
}
