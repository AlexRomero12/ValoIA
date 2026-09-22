import { describe, expect, it } from 'vitest';
import { agentRole, ROLES } from './roles';

describe('agentRole', () => {
  it('prefiere el rol del catálogo cuando es válido', () => {
    expect(agentRole('Jett', 'Duelist')).toBe('Duelist');
    expect(agentRole('Sova', 'Initiator')).toBe('Initiator');
  });

  it('cae al fallback por nombre si el catálogo no trae rol', () => {
    expect(agentRole('Jett')).toBe('Duelist');
    expect(agentRole('Veto')).toBe('Sentinel');
    expect(agentRole('Miks')).toBe('Controller');
    expect(agentRole('KAY/O')).toBe('Initiator');
  });

  it('ignora un rol desconocido y usa el fallback', () => {
    expect(agentRole('Jett', 'Support')).toBe('Duelist');
  });

  it('devuelve null para agentes sin rol conocido', () => {
    expect(agentRole('AgenteInventado')).toBeNull();
  });

  it('el fallback solo usa roles válidos', () => {
    for (const name of ['Jett', 'Veto', 'Miks', 'Sova', 'Clove']) {
      expect(ROLES).toContain(agentRole(name));
    }
  });
});
