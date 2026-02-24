import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';

/**
 * GET /api/advisor/threads
 * Returns all threads sorted by updatedAt desc, with message count.
 */
export async function GET(): Promise<Response> {
  try {
    const threads = await prisma.advisorThread.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    });

    return Response.json({
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        messageCount: t._count.messages,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    console.error('GET /api/advisor/threads error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to list advisor threads');
  }
}
