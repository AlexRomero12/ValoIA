/**
 * Explicación de qué son las reglas, cómo se calculan y dónde se configuran.
 * Colapsable; abierta por defecto mientras el perfil no tenga reglas.
 */
export function RulesIntro({ hasRules }: { hasRules: boolean }) {
  return (
    <details className="panel rules-intro" open={!hasRules}>
      <summary>
        <span className="day-chevron" aria-hidden>▸</span>
        ¿Qué son las reglas de sesión y cómo se configuran?
      </summary>
      <div className="rules-intro-body">
        <ul>
          <li>
            <b>Regla de parada:</b> detecta las derrotas seguidas con K/D bajo que activan el corte de sesión, con
            la hora exacta en que debiste cerrar.
          </li>
          <li>
            <b>Disciplina de pool:</b> marca cada ranked con agente fuera de tu pool (o prohibido) y muestra el
            récord de esas partidas.
          </li>
          <li>
            <b>Derrotas evitables:</b> compara tu récord real con el que habrías tenido si cerrabas la sesión en el corte.
          </li>
          <li>
            <b>Impacto y metas:</b> FB/FD, conversión de kills y las metas semanales que definas.
          </li>
        </ul>
        <p className="window-info">
          Se configura en <b>Perfiles → tu perfil → Reglas de sesión</b> (pool por mapa, prohibidos, corte y metas). Solo se
          evalúa tu perfil principal y cambiar reglas no reescribe semanas ya guardadas.
        </p>
      </div>
    </details>
  );
}
