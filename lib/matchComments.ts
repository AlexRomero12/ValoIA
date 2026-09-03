import { readData, writeData } from './persist';

/**
 * Comentarios del usuario por partida (contexto propio: qué pasó, por qué).
 *
 * IMPORTANTE — durabilidad: mismo patrón que favoritas — vive en
 * `data/match-comments.json` (volumen Docker `valo-data`), EXTERNO al cache,
 * inmune a invalidateAll() y a los rebuilds. La clave es el matchId (UUID
 * estable), así el comentario sobrevive al pasar por cualquier ventana.
 */

export interface MatchComment {
  text: string;
  updatedAt: number;
}

interface CommentsFile {
  version: number;
  comments: Record<string, MatchComment>;
}

const COMMENTS_FILE = 'match-comments.json';
export const MAX_COMMENT_LENGTH = 2000;

function readComments(): Record<string, MatchComment> {
  const file = readData<CommentsFile>(COMMENTS_FILE, { version: 1, comments: {} });
  return file?.comments && typeof file.comments === 'object' ? file.comments : {};
}

export async function getComments(): Promise<Record<string, MatchComment>> {
  return readComments();
}

export function getComment(matchId: string): MatchComment | null {
  return readComments()[matchId] ?? null;
}

/**
 * Guarda o reemplaza el comentario de una partida. Texto vacío = borra la nota.
 * Devuelve el estado completo de comentarios.
 */
export async function setComment(matchId: string, text: string): Promise<Record<string, MatchComment>> {
  const current = readComments();
  const trimmed = text.trim().slice(0, MAX_COMMENT_LENGTH);
  const next = { ...current };
  if (!trimmed) {
    delete next[matchId];
  } else {
    next[matchId] = { text: trimmed, updatedAt: Date.now() };
  }
  writeData(COMMENTS_FILE, { version: 1, comments: next });
  return next;
}