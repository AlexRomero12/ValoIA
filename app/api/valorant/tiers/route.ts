import { getTierIcons } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

/** GET -> { icons: { [tier]: url } } (cache 7 días en el server) */
export async function GET() {
  try {
    const icons = await getTierIcons();
    return Response.json({ icons }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err), icons: {} }, { status: 500 });
  }
}