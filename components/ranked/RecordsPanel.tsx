'use client';

import { InfoTip } from '@/components/InfoTip';
import type { RecordMetric, ValRecords } from '@/lib/types';

interface RecordsPanelProps {
  records: ValRecords | null;
  loading?: boolean;
  error?: string | null;
}

/** Riot manda más partidas de las que interesan aquí: bastan las 10 más recientes. */
const RECENT_LIMIT = 10;

/** Fecha corta es-ES. La API puede mandar fecha vacía o corrupta: eso no debe romper la fila. */
function shortDate(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES');
}

/** Tabla compacta de récords: la usan el histórico y el acto en curso (mismo formato). */
function MetricsTable({ metrics }: { metrics: RecordMetric[] }) {
  return (
    <div className="table-scroll">
      <table className="records-table">
        <thead>
          <tr>
            <th>Récord</th>
            <th className="num">Veces</th>
            <th className="num">Mejor</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.kind}>
              <td>{m.label}</td>
              <td className="num">{m.count}</td>
              <td className="num">
                <span className="records-best">{m.bestText}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cuerpo con datos: cada sección solo se pinta si Riot publica algo que enseñar. */
function RecordsBody({ records }: { records: ValRecords }) {
  const recent = records.recent.slice(0, RECENT_LIMIT);
  // Con el acto recién empezado Riot puede devolver la temporada sin métricas:
  // antes una sección ausente que una tabla con solo cabeceras.
  const season = records.season && records.season.metrics.length ? records.season : null;

  return (
    <div className="records-body">
      {records.allTime.length ? (
        <>
          <h3>Histórico</h3>
          <MetricsTable metrics={records.allTime} />
        </>
      ) : null}

      {season ? (
        <>
          <h3>Temporada actual</h3>
          {season.season ? <p className="wr-hint">Acto {season.season}</p> : null}
          <MetricsTable metrics={season.metrics} />
        </>
      ) : null}

      {records.actRecords.length ? (
        <>
          <h3>Récords del acto</h3>
          <div className="records-chips">
            {records.actRecords.map((r, i) => {
              const date = shortDate(r.date);
              return (
                <span key={`${r.matchId}-${r.label}-${i}`} className="records-chip is-act">
                  {r.label} · {r.valueText}
                  {date ? <span className="records-date"> · {date}</span> : null}
                </span>
              );
            })}
          </div>
        </>
      ) : null}

      {recent.length ? (
        <>
          <h3>Últimas partidas con récord</h3>
          <ul className="records-recent">
            {recent.map((m, i) => {
              const date = shortDate(m.date);
              return (
                <li key={`${m.matchId}-${i}`} className="records-row">
                  <span className="records-date">{date ?? '—'}</span>
                  {m.items.map((it, j) => (
                    <span
                      key={`${it.label}-${j}`}
                      className={it.actRecord ? 'records-item is-act' : 'records-item'}
                    >
                      {it.label}: <b>{it.valueText}</b>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Récords de la cuenta (accolades de Riot): histórico, acto en curso y partidas recientes. */
export function RecordsPanel({ records, loading, error }: RecordsPanelProps) {
  return (
    <div className="panel">
      <h2>
        Récords
        <InfoTip
          label="Qué son los récords de Riot"
          text="Récords de Riot (accolades de la cuenta): «Veces» = cuántas veces has alcanzado ese hito y «Mejor» = tu mejor marca registrada. En las partidas recientes, lo resaltado es récord del acto. Riot los publica con retraso, así que el acto en curso puede ir por detrás de lo que juegas."
        />
      </h2>
      {loading && !records ? (
        <p className="empty">Cargando récords…</p>
      ) : error ? (
        <p className="empty">{error}</p>
      ) : !records ? (
        <p className="empty">Riot todavía no publica récords para esta cuenta.</p>
      ) : (
        <RecordsBody records={records} />
      )}
    </div>
  );
}
