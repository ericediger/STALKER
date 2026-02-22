import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return apiError(400, 'VALIDATION_ERROR', 'Both startDate and endDate are required (YYYY-MM-DD)');
    }

    // Basic date format validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return apiError(400, 'VALIDATION_ERROR', 'Dates must be in YYYY-MM-DD format');
    }

    if (startDate > endDate) {
      return apiError(400, 'VALIDATION_ERROR', 'startDate must be before or equal to endDate');
    }

    const snapshotStore = new PrismaSnapshotStore(prisma);
    const snapshots = await snapshotStore.getRange(startDate, endDate);

    const series = snapshots.map((s) => ({
      date: s.date,
      totalValue: s.totalValue.toString(),
      totalCostBasis: s.totalCostBasis.toString(),
      unrealizedPnl: s.unrealizedPnl.toString(),
      realizedPnl: s.realizedPnl.toString(),
    }));

    return Response.json(series);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return apiError(500, 'INTERNAL_ERROR', message);
  }
}
