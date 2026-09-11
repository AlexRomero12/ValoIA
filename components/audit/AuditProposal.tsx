'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { buildAuditProposal } from '@/lib/auditProposal';
import type { AuditRules } from '@/lib/profileTypes';
import type { MatchRow } from '@/lib/types';

/**
 * Propuesta inicial de reglas calculada con las partidas ya cargadas. Se
 * previsualiza antes de aplicar; nunca pisa reglas existentes sin confirmar.
 * Colapsable: abierta por defecto si el perfil no tiene reglas y se cierra
 * sola al aplicarla (queda el resumen "aplicada" en la cabecera).
 */
export function AuditProposal({ matches, hasRules, onApply }: {
  matches: MatchRow[];
  hasRules: boolean;
  onApply: (rules: AuditRules) => Promise<void>;
}) {
  const proposal = useMemo(() => buildAuditProposal(matches), [matches]);
  const [open, setOpen] = useState(!hasRules);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!proposal) return null;

  const apply = async () => {
    if (busy) return;
    if (hasRules && !window.confirm('Esto reemplaza las reglas actuales de tu perfil principal. ¿Continuar?')) return;
    setBusy(true);
    try {
      await onApply(proposal.rules);
      setDone(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="panel audit-proposal"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="audit-proposal-head">
        <span className={`day-chevron${open ? ' on' : ''}`} aria-hidden>▸</span>
        <b className="audit-proposal-title">Propuesta de reglas</b>
        <span className="window-info">
          {done ? 'aplicada a tu perfil principal' : `basada en ${proposal.matches} competitivas recientes`}
        </span>
      </summary>

      <div className="audit-proposal-body">
        <p className="window-info">
          {proposal.maps.length} mapa(s) con pool · {proposal.bannedAgents.length} agente(s) prohibido(s)
          {proposal.bannedRoles.length ? ` · roles: ${proposal.bannedRoles.map((r) => r.name).join(', ')}` : ''} ·
          metas del plan.
        </p>

        <details className="audit-proposal-detail">
          <summary>Ver detalle de la propuesta</summary>
          <div className="proposal-grid">
            {proposal.maps.map((m) => (
              <div key={m.map} className="proposal-map">
                <b>{m.map}</b>
                <span>
                  Principal: {m.main.map((c) => `${c.name} (${c.games}p ${c.wr}%)`).join(', ') || '—'}
                </span>
                <span>Backup: {m.backup.map((c) => `${c.name} (${c.games}p ${c.wr}%)`).join(', ') || '—'}</span>
              </div>
            ))}
          </div>
          {proposal.bannedAgents.length ? (
            <p className="window-info">
              Prohibidos por WR bajo: {proposal.bannedAgents.map((b) => `${b.name} (${b.games}p ${b.wr}%)`).join(', ')}
            </p>
          ) : null}
          {proposal.bannedRoles.length ? (
            <p className="window-info">
              Roles prohibidos: {proposal.bannedRoles.map((b) => `${b.name} (${b.games}p ${b.wr}%)`).join(', ')}
            </p>
          ) : null}
          <p className="window-info">
            Corte: 2 derrotas con K/D &lt; 0.9 · pausa 3 h = sesión nueva · metas del plan (WR 55 · K/D 1.05 · ACS
            220 · HS 25 · ADR 150 · FB ≥ FD).
          </p>
        </details>

        {done ? (
          <p className="banner warn" style={{ marginTop: 12 }}>
            Propuesta aplicada a tu perfil principal. Ajusta lo que quieras en Perfiles.
          </p>
        ) : null}

        <div className="rules-io-actions" style={{ marginTop: 12 }}>
          <button className="primary-red" onClick={() => void apply()} disabled={busy}>
            {done ? 'Volver a aplicar' : 'Aplicar al perfil principal'}
            {busy ? <span className="loader" /> : null}
          </button>
          <Link className="f-chip" href="/perfiles">Editar en Perfiles</Link>
          {hasRules ? <span className="window-info">Reemplaza tus reglas actuales.</span> : null}
        </div>
      </div>
    </details>
  );
}
