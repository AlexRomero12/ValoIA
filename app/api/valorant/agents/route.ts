import { getContent } from '@/lib/valorant';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dicts = await getContent();
  const agents = Object.values(dicts.agents)
    .map((a) => ({ name: a.name, icon: a.icon, role: a.role ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return Response.json(agents, {
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
