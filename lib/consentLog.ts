import { readData, writeDataSync } from './persist';

/**
 * Auditoría de consentimiento (Riot exige poder demostrar el opt-in de cada
 * jugador y su revocación). Append-only en `data/consent-log.json`.
 */

export type ConsentAction = 'consent' | 'optin' | 'optout' | 'link' | 'unlink' | 'account-delete';

export interface ConsentEvent {
  at: number;
  user: string;
  action: ConsentAction;
  detail?: string;
  ip?: string;
}

interface ConsentFile {
  version: number;
  events: ConsentEvent[];
}

const FILE = 'consent-log.json';
const MAX_EVENTS = 5000;

export function logConsent(event: Omit<ConsentEvent, 'at'> & { at?: number }): void {
  const file = readData<ConsentFile>(FILE, { version: 1, events: [] });
  const events = Array.isArray(file?.events) ? file.events : [];
  const next = [...events, { ...event, at: event.at ?? Date.now() }].slice(-MAX_EVENTS);
  writeDataSync(FILE, { version: 1, events: next });
}

export function listConsentLog(limit = 200): ConsentEvent[] {
  const file = readData<ConsentFile>(FILE, { version: 1, events: [] });
  const events = Array.isArray(file?.events) ? file.events : [];
  return events.slice(-limit).reverse();
}
