import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';

/**
 * GET /api/advisor/threads/[id]
 * Returns thread detail with all messages.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const thread = await prisma.advisorThread.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      return apiError(404, 'NOT_FOUND', `Thread '${id}' not found`);
    }

    return Response.json({
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: thread.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
        toolResults: m.toolResults ? JSON.parse(m.toolResults) : undefined,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err: unknown) {
    console.error('GET /api/advisor/threads/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to load advisor thread');
  }
}

/**
 * DELETE /api/advisor/threads/[id]
 * Deletes thread and all its messages. Returns 204.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const thread = await prisma.advisorThread.findUnique({ where: { id } });
    if (!thread) {
      return apiError(404, 'NOT_FOUND', `Thread '${id}' not found`);
    }

    // Delete messages first (no cascade in Prisma SQLite)
    await prisma.advisorMessage.deleteMany({ where: { threadId: id } });
    await prisma.advisorThread.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    console.error('DELETE /api/advisor/threads/[id] error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to delete advisor thread');
  }
}
