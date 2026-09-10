import { readData, writeDataSync } from './persist';

/**
 * Comentarios del usuario por partida (contexto propio: quÃ© pasÃ³, por quÃ©).
 *
 * IMPORTANTE â€” durabilidad: mismo patrÃ³n que favoritas â€” vive en
 * `data/match-comments.json` (volumen Docker `valo-data`), EXTERNO al cache,
 * inmune a invalidateAll() y a los rebuilds. La clave es el matchId (UUID
 * estable), asÃ­ el comentario sobrevive al pasar por cualquier ventana.
 *
 * Aislamiento: cada nota guarda su autor; cada usuario ve las suyas y el admin
 * ve todas (las notas previas al flag, sin autor, solo las ve el admin).
 */

export interface MatchComment {
  text: string;
  updatedAt: number;
  /** usuario autor de la nota */
  author?: string;
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

export interface CommentsViewer {
  username: string;
  admin: boolean;
}

function visibleTo(all: Record<string, MatchComment>, viewer?: CommentsViewer): Record<string, MatchComment> {
  if (!viewer || viewer.admin) return all;
  const out: Record<string, MatchComment> = {};
  for (const [matchId, comment] of Object.entries(all)) {
    if (comment.author === viewer.username) out[matchId] = comment;
  }
  return out;
}

/** Notas visibles para el visor (sin visor = todas, uso interno). */
export async function getComments(viewer?: CommentsViewer): Promise<Record<string, MatchComment>> {
  return visibleTo(readComments(), viewer);
}

/**
 * Guarda o reemplaza el comentario de una partida. Texto vacÃ­o = borra la nota.
 * Devuelve el estado visible para el autor (in-memory: evita la carrera con la
 * cola de escritura de `persist.ts`).
 */
export async function setComment(
  matchId: string,
  text: string,
  author: string,
  viewer?: CommentsViewer,
): Promise<Record<string, MatchComment>> {
  const current = readComments();
  const trimmed = text.trim().slice(0, MAX_COMMENT_LENGTH);
  const next = { ...current };
  if (!trimmed) {
    delete next[matchId];
  } else {
    next[matchId] = { text: trimmed, updatedAt: Date.now(), author };
  }
  writeDataSync(COMMENTS_FILE, { version: 1, comments: next });
  return visibleTo(next, viewer);
}
