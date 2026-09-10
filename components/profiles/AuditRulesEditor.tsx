'use client';

import { useState } from 'react';
import { AgentPicker } from './AgentPicker';
import { ROLES } from '@/lib/roles';
import { cloneAuditRules, type AuditPoolRule, type AuditRules, type Profile } from '@/lib/profileTypes';

interface AuditRulesEditorProps {
  rules: AuditRules;
  maps: string[];
  otherProfiles: Profile[];
  onChange: (rules: AuditRules) => void;
}

const DEFAULT_BACKUP: AuditPoolRule = { main: [], backup: [] };

function hasRule(rule: AuditPoolRule | undefined): boolean {
  return Boolean(rule && (rule.main.length > 0 || rule.backup.length > 0));
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix }: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="rule-field">
      <span>{label}{suffix ? ` (${suffix})` : ''}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    </label>
  );
}

/**
 * Editor de reglas de auditoría de un perfil: pool por mapa (principal/backup),
 * prohibidos (agentes y roles), cortes/pausas y metas. Incluye copiar de otro
 * perfil e importar/exportar JSON.
 */
export function AuditRulesEditor({ rules, maps, otherProfiles, onChange }: AuditRulesEditorProps) {
  const [peek, setPeek] = useState(false);
  const [json, setJson] = useState('');
  const [jsonMsg, setJsonMsg] = useState<string | null>(null);

  const patch = (p: Partial<AuditRules>) => onChange({ ...rules, ...p });

  const setMapRule = (map: string, rule: AuditPoolRule) => {
    patch({ pool: { ...rules.pool, byMap: { ...rules.pool.byMap, [map]: rule } } });
  };

  const clearMapRule = (map: string) => {
    const next = { ...rules.pool.byMap };
    delete next[map];
    patch({ pool: { ...rules.pool, byMap: next } });
  };

  const poolOf = (map: string): AuditPoolRule => rules.pool.byMap[map] ?? DEFAULT_BACKUP;

  return (
    <div className="rules-editor">
      <div className="rules-copy">
        <label>Copiar reglas de</label>
        <select
          defaultValue=""
          onChange={(e) => {
            const src = otherProfiles.find((p) => p.id === e.target.value);
            if (src?.audit) onChange({ ...cloneAuditRules(src.audit), rulesVersion: Math.max(rules.rulesVersion, src.audit.rulesVersion) });
            e.target.value = '';
          }}
        >
          <option value="" disabled>Elegir perfil…</option>
          {otherProfiles.filter((p) => p.audit).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <span className="window-info">Reemplaza todas las reglas de abajo.</span>
      </div>

      <div className="rules-block">
        <div className="rules-block-head">
          <h4>Regla por defecto</h4>
          <span className="window-info">Se usa en mapas sin regla propia (vacía = sin auditoría de pool en esos mapas).</span>
        </div>
        <div className="pool-row">
          <span className="pool-tag main">Principal</span>
          <AgentPicker
            selected={rules.pool.default?.main ?? []}
            onChange={(main) => patch({ pool: { ...rules.pool, default: { main, backup: rules.pool.default?.backup ?? [] } } })}
            placeholder="Agregar principal…"
          />
        </div>
        <div className="pool-row">
          <span className="pool-tag backup">Backup</span>
          <AgentPicker
            selected={rules.pool.default?.backup ?? []}
            onChange={(backup) => patch({ pool: { ...rules.pool, default: { main: rules.pool.default?.main ?? [], backup } } })}
            placeholder="Agregar backup…"
          />
        </div>
      </div>

      <div className="rules-block">
        <div className="rules-block-head">
          <h4>Pool por mapa</h4>
          <span className="window-info">La regla del mapa manda sobre la default. Vacía = usa la default.</span>
        </div>
        <div className="rules-maps">
          {maps.map((map) => {
            const rule = poolOf(map);
            const active = hasRule(rule);
            return (
              <div key={map} className={`rule-map${active ? ' on' : ''}`}>
                <div className="rule-map-head">
                  <b>{map}</b>
                  {active ? (
                    <button type="button" className="rule-clear" onClick={() => clearMapRule(map)} title="Quitar regla del mapa">✕</button>
                  ) : (
                    <span className="rule-none">sin regla</span>
                  )}
                </div>
                <div className="pool-row">
                  <span className="pool-tag main">P</span>
                  <AgentPicker selected={rule.main} onChange={(main) => setMapRule(map, { ...rule, main })} compact placeholder="Principal…" />
                </div>
                <div className="pool-row">
                  <span className="pool-tag backup">B</span>
                  <AgentPicker selected={rule.backup} onChange={(backup) => setMapRule(map, { ...rule, backup })} compact placeholder="Backup…" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rules-block">
        <h4>Prohibidos</h4>
        <div className="pool-row">
          <span className="pool-tag ban">Agentes</span>
          <AgentPicker selected={rules.bannedAgents} onChange={(bannedAgents) => patch({ bannedAgents })} placeholder="Agregar prohibido…" />
        </div>
        <div className="pool-row">
          <span className="pool-tag ban">Roles</span>
          <div className="role-chips">
            {ROLES.map((role) => {
              const on = rules.bannedRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  className={`f-chip${on ? ' player-on' : ''}`}
                  onClick={() => patch({ bannedRoles: on ? rules.bannedRoles.filter((r) => r !== role) : [...rules.bannedRoles, role] })}
                >
                  {role}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rules-block">
        <h4>Cortes y pausas</h4>
        <div className="rules-fields">
          <NumberField label="Derrotas seguidas" value={rules.stop.losses} min={1} max={5} onChange={(v) => patch({ stop: { ...rules.stop, losses: v ?? 2 } })} />
          <NumberField label="K/D por debajo de" value={rules.stop.kdBelow} min={0} max={3} step={0.05} onChange={(v) => patch({ stop: { ...rules.stop, kdBelow: v ?? 0.9 } })} />
          <NumberField label="Pausa = sesión nueva" value={rules.sessions.gapMinutes} min={5} max={720} step={15} suffix="min" onChange={(v) => patch({ sessions: { gapMinutes: v ?? 180 } })} />
        </div>
      </div>

      <div className="rules-block">
        <h4>Metas semanales</h4>
        <div className="rules-fields">
          <NumberField label="WR" value={rules.goals.wr} min={0} max={100} suffix="%" onChange={(wr) => patch({ goals: { ...rules.goals, wr } })} />
          <NumberField label="K/D" value={rules.goals.kd} min={0} max={3} step={0.05} onChange={(kd) => patch({ goals: { ...rules.goals, kd } })} />
          <NumberField label="ACS" value={rules.goals.acs} min={0} max={500} onChange={(acs) => patch({ goals: { ...rules.goals, acs } })} />
          <NumberField label="HS%" value={rules.goals.hsPct} min={0} max={100} onChange={(hsPct) => patch({ goals: { ...rules.goals, hsPct } })} />
          <NumberField label="ADR" value={rules.goals.adr} min={0} max={400} onChange={(adr) => patch({ goals: { ...rules.goals, adr } })} />
          <label className="rule-field check">
            <input type="checkbox" checked={Boolean(rules.goals.fbPositive)} onChange={(e) => patch({ goals: { ...rules.goals, fbPositive: e.target.checked } })} />
            <span>Primeras sangres ≥ primeras muertes</span>
          </label>
        </div>
      </div>

      <div className="rules-block">
        <details open={peek} onToggle={(e) => setPeek((e.target as HTMLDetailsElement).open)}>
          <summary>Importar / exportar reglas (JSON)</summary>
          <div className="rules-io">
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              placeholder='Pega aquí reglas exportadas, p. ej. {"pool":{...}}'
              rows={4}
            />
            <div className="rules-io-actions">
              <button
                type="button"
                onClick={() => {
                  setJson(JSON.stringify(rules, null, 2));
                  setJsonMsg('Reglas copiadas abajo: cópialas y compártelas.');
                }}
              >
                Exportar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(json);
                    setJsonMsg('JSON copiado al portapapeles.');
                  } catch {
                    setJsonMsg('No se pudo copiar; selecciona el texto manualmente.');
                  }
                }}
                disabled={!json.trim()}
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(json) as AuditRules;
                    if (!parsed?.pool || !parsed?.stop || !parsed?.sessions) throw new Error('faltan campos');
                    onChange({ ...parsed, rulesVersion: Math.max(1, Number(parsed.rulesVersion) || 1) });
                    setJsonMsg('Reglas importadas.');
                  } catch (e) {
                    setJsonMsg(`JSON inválido: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                disabled={!json.trim()}
              >
                Importar
              </button>
              {jsonMsg ? <span className="window-info">{jsonMsg}</span> : null}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
