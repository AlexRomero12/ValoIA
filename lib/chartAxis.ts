/**
 * Marcas legibles para el eje X de los SVG.
 *
 * Elige índices de puntos donde pintar etiqueta: como máximo una por etiqueta
 * distinta (en su primera aparición), con separación mínima en píxeles entre
 * marcas y tope total. Contar marcas no basta: con días de 1-2 partidas las
 * marcas caían en puntos adyacentes (~17 px) y se encimaban igual.
 */
export function pickXMarks(opts: {
  /** Nº total de puntos del eje. */
  count: number;
  /** Etiqueta del punto i (días repetidos se colapsan a su primera aparición). */
  labelOf: (i: number) => string;
  /** Ancho del plot en px (940 − PL − PR del viewBox). */
  plotW?: number;
  /** Tope de marcas (por defecto dinámico según el rango: corto → todas, largo → pocas). */
  maxMarks?: number;
  /** Separación mínima entre marcas en px. */
  minPx?: number;
}): Set<number> {
  const { count, labelOf, plotW = 866, minPx = 48 } = opts;
  // Eje X dinámico: una semana muestra todos los días; un rango grande
  // (temporada, 90 días) muestra pocas marcas para no saturar.
  const autoMax = count <= 7 ? count : count <= 14 ? 14 : count <= 31 ? 10 : count <= 90 ? 8 : 6;
  const maxMarks = opts.maxMarks ?? autoMax;
  if (count <= 0) return new Set<number>();
  const step = count === 1 ? plotW : plotW / (count - 1);
  const minGap = Math.max(1, Math.ceil(minPx / step));

  // Candidatas: primera aparición de cada etiqueta + siempre la última.
  const cand: number[] = [];
  let prev = '';
  for (let i = 0; i < count; i++) {
    const lbl = labelOf(i);
    const last = i === count - 1;
    if (lbl !== prev || last) {
      if (last && lbl === prev && cand.length) cand[cand.length - 1] = i;
      else cand.push(i);
      prev = lbl;
    }
  }

  // Diezmar hasta el tope (paso uniforme, conservando primera y última).
  let marks = cand;
  while (marks.length > maxMarks) {
    const stride = Math.ceil(marks.length / maxMarks);
    const next = marks.filter((_, j) => j % stride === 0 || j === marks.length - 1);
    if (next.length >= marks.length) break;
    marks = next;
  }

  // Separación mínima: greedy en orden; la última marca siempre manda
  // (reemplaza a la anterior si chocan), las intermedias juntas se sueltan.
  const kept: number[] = [];
  for (const i of marks) {
    const last = kept[kept.length - 1];
    if (last === undefined || i - last >= minGap) kept.push(i);
    else if (i === count - 1) kept[kept.length - 1] = i;
  }
  return new Set(kept);
}
