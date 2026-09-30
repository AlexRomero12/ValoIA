/**
 * Utilidades de fecha local compartidas (puras, isomorfas).
 * Centralizadas para que el agrupamiento por día/semana no diverja entre vistas.
 */

/** Clave de día local en formato `YYYY-MM-DD`. */
export function isoDayLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lunes (local, a medianoche) de la semana de un timestamp. */
export function mondayOf(ts: number): Date {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
