import { getWeaponGroups } from '@/lib/skins';

export const dynamic = 'force-dynamic';

export interface WeaponsResponse {
  categories: Array<{
    name: string;
    weapons: Array<{ name: string; icon: string; count: number }>;
  }>;
}

export async function GET() {
  try {
    const groups = await getWeaponGroups();
    const byCat = new Map<string, typeof groups>();
    for (const g of groups) {
      const arr = byCat.get(g.category) ?? [];
      arr.push(g);
      byCat.set(g.category, arr);
    }
    const categories = [...byCat.entries()].map(([name, weapons]) => ({
      name,
      weapons: weapons.map((w) => ({ name: w.name, icon: w.icon, count: w.skins.length })),
    }));
    return Response.json({ categories } satisfies WeaponsResponse, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err), categories: [] }, { status: 500 });
  }
}