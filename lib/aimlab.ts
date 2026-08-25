const ENDPOINT = 'https://api.aimlab.gg/graphql';

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: 'https://app.voltaic.gg',
  Referer: 'https://app.voltaic.gg/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

export interface SkillScore {
  name: string;
  score: number;
}

export interface Profile {
  username: string;
  userId: string;
  rankDisplay: string | null;
  rankTier: string | null;
  skill: number | null;
  skillScores: SkillScore[];
}

export interface DayTaskRow {
  taskId: string;
  taskName: string;
  runs: number;
  bestScore: number;
  bestAccuracy: number | null;
  endedAt: string | null;
}

export interface PlayHistoryNode {
  id: string;
  endedAt: string;
  taskId: string;
  score: number;
}

export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...BASE_HEADERS, ...headers },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Aimlabs API HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error('GraphQL error: ' + JSON.stringify(json.errors).slice(0, 400));
  if (!json.data) throw new Error('Aimlabs API returned no data');
  return json.data;
}

export async function getProfile(username: string): Promise<Profile> {
  const data = await gql<{
    aimlabProfile?: {
      username: string;
      user?: { id?: string };
      ranking?: { rank?: { displayName?: string; tier?: string } | null; skill?: number | null } | null;
      skillScores?: { name: string; score: number }[];
    };
  }>(
    `
    query GetProfile($username: String) {
      aimlabProfile(username: $username) {
        username
        user { id }
        ranking { rank { displayName tier } skill }
        skillScores { name score }
      }
    }
  `,
    { username },
  );
  const p = data.aimlabProfile;
  if (!p) throw new Error('Perfil no encontrado');
  return {
    username: p.username,
    userId: p.user?.id ?? '',
    rankDisplay: p.ranking?.rank?.displayName ?? null,
    rankTier: p.ranking?.rank?.tier ?? null,
    skill: p.ranking?.skill ?? null,
    skillScores: (p.skillScores ?? []).map((s) => ({ name: s.name, score: s.score })),
  };
}

export async function getDayTasks(
  userId: string,
  from: string,
  to: string,
): Promise<DayTaskRow[]> {
  const data = await gql<{
    aimlab?: {
      plays_agg?: {
        group_by?: { task_id?: string; task_name?: string };
        aggregate?: {
          count?: number;
          max?: { score?: number; accuracy?: number | null; ended_at?: string | null };
        };
      }[];
    };
  }>(
    `
    query Agg($where: AimlabPlayWhere!) {
      aimlab {
        plays_agg(where: $where) {
          group_by { task_id task_name }
          aggregate { count max { score accuracy ended_at } }
        }
      }
    }
  `,
    {
      where: {
        user_id: { _eq: userId },
        ended_at: { _gte: from, _lt: to },
      },
    },
  );
  const rows = data?.aimlab?.plays_agg ?? [];
  return rows.map((r) => ({
    taskId: r.group_by?.task_id ?? '',
    taskName: r.group_by?.task_name ?? '',
    runs: r.aggregate?.count ?? 0,
    bestScore: r.aggregate?.max?.score ?? 0,
    bestAccuracy: r.aggregate?.max?.accuracy ?? null,
    endedAt: r.aggregate?.max?.ended_at ?? null,
  }));
}

export async function getSessionAccessToken(sessionCookie: string): Promise<string> {
  const res = await fetch('https://aimlabs.com/api/auth/session', {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${sessionCookie}`,
      Accept: 'application/json',
      'User-Agent': BASE_HEADERS['User-Agent'],
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Session route HTTP ${res.status}`);
  const json = (await res.json()) as { accessToken?: string };
  if (!json.accessToken) throw new Error('No access token in session');
  return json.accessToken;
}

export async function getPlayHistory(
  userId: string,
  bearer: string,
  since: string,
): Promise<PlayHistoryNode[]> {
  const nodes: PlayHistoryNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const variables: Record<string, unknown> = {
      anthicId: userId,
      filter: { mode: 42 },
      first: 200,
    };
    if (after) variables.after = after;
    const data = await gql<{
      aimlabProfile?: {
        plays?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: {
            node?: {
              id?: string;
              endedAt?: string;
              task?: { id?: string };
              score?: number;
            };
          }[];
        };
      };
    }>(
      `
      query RunHistory($filter: PlayFilterInput, $first: Int, $anthicId: String, $after: String) {
        aimlabProfile(anthicId: $anthicId) {
          plays(filter: $filter, first: $first, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { id endedAt task { id } score } }
          }
        }
      }
    `,
      variables,
      { Authorization: `Bearer ${bearer}` },
    );
    const block = data.aimlabProfile?.plays;
    for (const edge of block?.edges ?? []) {
      const n = edge.node;
      if (n?.endedAt && n.endedAt >= since) {
        nodes.push({
          id: n.id ?? '',
          endedAt: n.endedAt,
          taskId: n.task?.id ?? '',
          score: n.score ?? 0,
        });
      }
    }
    if (!block?.pageInfo?.hasNextPage) break;
    after = block.pageInfo.endCursor ?? null;
  }
  return nodes;
}