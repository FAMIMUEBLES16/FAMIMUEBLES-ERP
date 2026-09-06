export function formatDate(date = new Date()) { return new Intl.DateTimeFormat('es-CO', { dateStyle:'full' }).format(new Date(date)); }
