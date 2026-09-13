'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { buildRulesProposal, diffProposal } from '@/lib/rulesProposal';
import { sameRulesContent, type SessionRules } from '@/lib/profileTypes';
import type { MatchRow } from '@/lib/types';

/**
 * Propuesta inicial de reglas calculada con las partidas ya cargadas. Se
 * previsualiza antes de aplicar; nunca pisa reglas existentes sin confirmar.
 * El detalle marca qué ya está aplicado y qué queda pendiente comparando con
 * las reglas vigentes: si cambias o quitas reglas, vuelve a ofrecer aplicarla.
 */
export function RulesProposal({ matches, hasRules, currentRules, onApply }: {
  matches: MatchRow[];
  hasRules: boolean;
  currentRules?: SessionRules;
  onApply: (rules: SessionRules) => Promise<boolean>;
}) {
  const proposal = useMemo(() => buildRulesProposal(matches), [matches]);
  const [open, setOpen] = useState(!hasRules);
  const [busy, setBusy] = useState(false);

  if (!proposal) return null;

  const diff = diffProposal(proposal, currentRules);
  const exact = sameRulesContent(currentRules, proposal.rules);
  const fullyApplied = diff.pendingTotal === 0;

  const apply = async () => {
    if (busy) return;
    if (hasRules && !exact && !window.confirm('Esto reemplaza las reglas actuales de tu perfil principal. ¿Continuar?')) return;
    setBusy(true);
    try {
      const ok = await onApply(proposal.rules);
      if (ok) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const pendingParts = [
    diff.mapsPending.length ? `${diff.mapsPending.length} mapa(s)` : null,
    diff.bannedPending.length ? `${diff.bannedPending.length} agente(s) prohibido(s)` : null,
    diff.rolesPending.length ? `${diff.rolesPending.length} rol(es)` : null,
    diff.goalsPending ? 'metas del plan' : null,
  ].filter((p): p is string => p != null);

  return (
    <details
      className="panel rules-proposal"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="rules-proposal-head">
        <span className={`day-chevron${open ? ' on' : ''}`} aria-hidden>▸</span>
        <b className="rules-proposal-title">Propuesta de reglas</b>
        <span className="window-info">
          {exact
            ? 'aplicada a tu perfil principal'
            : fullyApplied
              ? 'ya aplicada · con ajustes propios'
              : `basada en ${proposal.matches} competitivas · ${diff.pendingTotal} pendiente${diff.pendingTotal === 1 ? '' : 's'}`}
        </span>
      </summary>

      <div className="rules-proposal-body">
        <p className="window-info">
          {proposal.maps.length} mapa(s) con pool · {proposal.bannedAgents.length} agente(s) prohibido(s)
          {proposal.bannedRoles.length ? ` · roles: ${proposal.bannedRoles.map((r) => r.name).join(', ')}` : ''} ·
          metas del plan.
        </p>
        {!fullyApplied ? (
          <p className="window-info">
            <b>Pendiente:</b> {pendingParts.join(' · ')}
          </p>
        ) : null}

        <details className="rules-proposal-detail">
          <summary>
            <span className="day-chevron" aria-hidden>▸</span>
            Ver detalle de la propuesta
          </summary>
          <div className="proposal-grid">
            {proposal.maps.map((m) => {
              const isApplied = diff.mapsApplied.includes(m.map);
              return (
                <div key={m.map} className={`proposal-map${isApplied ? ' applied' : ''}`}>
                  <b>
                    {m.map}
                    <span className={`proposal-badge${isApplied ? '' : ' todo'}`}>
                      {isApplied ? 'ya aplicado' : 'pendiente'}
                    </span>
                  </b>
                  <span>
                    Principal: {m.main.map((c) => `${c.name} (${c.games}p ${c.wr}%)`).join(', ') || '—'}
                  </span>
                  <span>Backup: {m.backup.map((c) => `${c.name} (${c.games}p ${c.wr}%)`).join(', ') || '—'}</span>
                </div>
              );
            })}
          </div>
          {proposal.bannedAgents.length ? (
            <p className="window-info">
              Prohibidos por WR bajo:{' '}
              {proposal.bannedAgents
                .map((b) => `${b.name} (${b.games}p ${b.wr}%)${diff.bannedApplied.includes(b.name) ? ' ✓' : ''}`)
                .join(', ')}
            </p>
          ) : null}
          {proposal.bannedRoles.length ? (
            <p className="window-info">
              Roles prohibidos:{' '}
              {proposal.bannedRoles
                .map((b) => `${b.name} (${b.games}p ${b.wr}%)${diff.rolesApplied.includes(b.name) ? ' ✓' : ''}`)
                .join(', ')}
            </p>
          ) : null}
          <p className="window-info">
            Corte: 2 derrotas con K/D &lt; 0.9 · pausa 3 h = sesión nueva · metas del plan (WR 55 · K/D 1.05 · ACS
            220 · HS 25 · ADR 150 · FB ≥ FD){diff.goalsPending ? '' : ' ✓ aplicadas'}
          </p>
        </details>

        {exact ? (
          <p className="banner warn" style={{ marginTop: 12 }}>
            Estas reglas ya están aplicadas en tu perfil principal. Si las editas en Perfiles, la propuesta
            volverá a ofrecer aplicarse.
          </p>
        ) : fullyApplied ? (
          <p className="banner warn" style={{ marginTop: 12 }}>
            Todo lo propuesto ya está aplicado; tu perfil tiene ajustes propios. Volver a aplicar reemplazaría
            esos ajustes por la propuesta.
          </p>
        ) : null}

        <div className="rules-io-actions" style={{ marginTop: 12 }}>
          <button className="primary-red" onClick={() => void apply()} disabled={busy}>
            {fullyApplied ? 'Volver a aplicar' : 'Aplicar al perfil principal'}
            {busy ? <span className="loader" /> : null}
          </button>
          <Link className="f-chip" href="/perfiles">Editar en Perfiles</Link>
          {hasRules && !exact ? <span className="window-info">Reemplaza tus reglas actuales.</span> : null}
        </div>
      </div>
    </details>
  );
}
