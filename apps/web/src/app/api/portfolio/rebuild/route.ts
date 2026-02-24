import { apiError } from '@/lib/errors';
import { triggerSnapshotRebuild } from '@/lib/snapshot-rebuild-helper';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/portfolio/rebuild
 *
 * AD-S10b: Explicit rebuild trigger. GET /api/portfolio/snapshot is read-only;
 * this endpoint is the only way to recompute snapshots outside of transaction CRUD.
 *
 * Rebuilds from the earliest transaction date forward.
 */
export async function POST(): Promise<Response> {
  try {
    const earliest = await prisma.transaction.findFirst({
      orderBy: { tradeAt: 'asc' },
      select: { tradeAt: true },
    });

    if (!earliest) {
      return Response.json({ rebuilt: 0, message: 'No transactions to rebuild from' });
    }

    await triggerSnapshotRebuild(earliest.tradeAt);

    return Response.json({ rebuilt: true, from: earliest.tradeAt.toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
