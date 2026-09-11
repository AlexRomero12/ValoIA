/**
 * Explicación de qué es la auditoría, cómo se calcula y dónde se configura.
 * Colapsable; abierta por defecto mientras el perfil no tenga reglas.
 */
export function AuditIntro({ hasRules }: { hasRules: boolean }) {
  return (
    <details className="panel audit-intro" open={!hasRules}>
      <summary>¿Qué mide la auditoría y cómo se configura?</summary>
      <div className="audit-intro-body">
        <ul>
          <li>
            <b>Regla de parada:</b> detecta las derrotas seguidas con K/D bajo que activan el corte de sesión, con
            la hora exacta en que debiste cerrar.
          </li>
          <li>
            <b>Disciplina de pool:</b> marca cada ranked con agente fuera de tu pool (o prohibido) y suma el RR que
            costó.
          </li>
          <li>
            <b>RR evitable:</b> compara tu RR real con el que habrías tenido si cerrabas la sesión en el corte.
          </li>
          <li>
            <b>Impacto y metas:</b> FB/FD, conversión de kills y las metas semanales que definas.
          </li>
        </ul>
        <p className="window-info">
          Se configura en <b>Perfiles → tu perfil → Auditoría</b> (pool por mapa, prohibidos, corte y metas). Solo se
          audita tu perfil principal y cambiar reglas no reescribe semanas ya guardadas.
        </p>
      </div>
    </details>
  );
}
