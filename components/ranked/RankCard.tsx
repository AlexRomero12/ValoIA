'use client';

import { InfoTip } from '@/components/InfoTip';
import { TierIcon } from '@/components/TierIcon';
import { protectionLabel } from '@/lib/rankState';
import type { ValRankState } from '@/lib/types';

/**
 * Estado de rango enriquecido (MMR v3): escudos de protección, pico histórico
 * y prestigio. Se pinta dentro del Resumen y no cuesta requests extra: viene en
 * el mismo resumen (el servidor lo cachea 30 min).
 */
export function RankCard({ rank }: { rank: ValRankState | null | undefined }) {
  if (!rank) return null;

  const shields = rank.protection.shields;
  const status = protectionLabel(rank.protection.status);
  const shieldText = shields > 0 ? `${shields} ${shields === 1 ? 'escudo' : 'escudos'}` : (status ?? 'Sin escudos');
  const peakText = rank.peak?.tier
    ? `${rank.peak.tier}${rank.peak.rr ? ` · ${rank.peak.rr} RR` : ''}`
    : '—';
  const gamesRating = rank.gamesNeededForRating ?? 0;
  const gamesLeaderboard = rank.gamesNeededForLeaderboard ?? 0;

  return (
    <div className="panel rank-card">
      <h2>
        Rango
        <InfoTip text="Datos del MMR v3 de Riot: pico histórico de la cuenta, escudos de protección de rango (evitan un descenso), prestigio por tier y las partidas que faltan para entrar en el rating o el leaderboard." />
      </h2>
      <div className="rank-grid">
        <div className="rank-cell">
          <span className="rank-cell-v">
            <TierIcon tier={rank.tier?.id ?? 0} size={18} /> {rank.tier?.name ?? '—'}
          </span>
          <span className="rank-cell-k">{rank.rr != null ? `${rank.rr} RR` : 'RR sin dato'}</span>
        </div>
        <div className={`rank-cell${shields > 0 || rank.protection.atProtectedTier ? ' is-good' : ''}`}>
          <span className="rank-cell-v">{shieldText}</span>
          <span className="rank-cell-k">
            Protección{rank.protection.atProtectedTier ? ' · tier protegido' : ''}
          </span>
        </div>
        <div className="rank-cell">
          <span className="rank-cell-v">{peakText}</span>
          <span className="rank-cell-k">Pico{rank.peak?.season ? ` · ${rank.peak.season}` : ''}</span>
        </div>
        {gamesRating > 0 || gamesLeaderboard > 0 ? (
          <div className="rank-cell">
            <span className="rank-cell-v">{Math.max(gamesRating, gamesLeaderboard)} partidas</span>
            <span className="rank-cell-k">
              {gamesRating > 0 ? `para rating (${gamesRating})` : `para leaderboard (${gamesLeaderboard})`}
            </span>
          </div>
        ) : null}
        {rank.leaderboardPlacement != null ? (
          <div className="rank-cell">
            <span className="rank-cell-v">#{rank.leaderboardPlacement}</span>
            <span className="rank-cell-k">Leaderboard</span>
          </div>
        ) : null}
      </div>
      {rank.prestige.length ? (
        <div className="rank-prestige">
          <span className="rank-prestige-label">Prestigio</span>
          {rank.prestige.map((p) => (
            <span key={p.tier} className="rank-chip" title={`${p.count} prestigio(s) en ${p.tier}`}>
              {p.tier} ×{p.count}
            </span>
          ))}
        </div>
      ) : null}
      {rank.rankedBadgeHidden ? (
        <p className="wr-hint">Tienes la insignia de rango oculta en el cliente.</p>
      ) : null}
    </div>
  );
}
