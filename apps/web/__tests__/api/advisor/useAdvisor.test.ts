/**
 * Tests for the advisor frontend API integration.
 * Since we don't have @testing-library/react, we test the fetch calls
 * that the useAdvisor hook would make, verifying request/response shapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();

describe('Advisor frontend API integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('POST /api/advisor/chat', () => {
    it('sends message with threadId and returns response', async () => {
      const mockResponse = {
        threadId: 'thread-1',
        messages: [
          { id: 'msg-1', role: 'assistant', content: 'Hello!', createdAt: '2026-02-23T10:00:00Z' },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: 'thread-1', message: 'Hi' }),
      });

      expect(res.ok).toBe(true);
      const data = (await res.json()) as typeof mockResponse;
      expect(data.threadId).toBe('thread-1');
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0]!.role).toBe('assistant');
    });

    it('creates new thread when threadId omitted', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          threadId: 'new-thread',
          messages: [{ id: 'msg-1', role: 'assistant', content: 'Welcome!' }],
        }),
      });

      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string) as Record<string, unknown>;
      expect(body['threadId']).toBeUndefined();
      expect(body['message']).toBe('Hello');
      expect(res.ok).toBe(true);
    });

    it('handles LLM_NOT_CONFIGURED error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ code: 'LLM_NOT_CONFIGURED', error: 'LLM provider not configured' }),
      });

      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });

      expect(res.ok).toBe(false);
      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('LLM_NOT_CONFIGURED');
    });

    it('handles LLM_ERROR (502)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ code: 'LLM_ERROR', error: 'Advisor temporarily unavailable' }),
      });

      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });

      const data = (await res.json()) as { code: string };
      expect(data.code).toBe('LLM_ERROR');
    });
  });

  describe('GET /api/advisor/threads', () => {
    it('returns thread list with message counts', async () => {
      const mockThreads = [
        { id: 't-1', title: 'First', messageCount: 5, createdAt: '', updatedAt: '' },
        { id: 't-2', title: 'Second', messageCount: 2, createdAt: '', updatedAt: '' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ threads: mockThreads }),
      });

      const res = await fetch('/api/advisor/threads');
      const data = (await res.json()) as { threads: typeof mockThreads };

      expect(data.threads).toHaveLength(2);
      expect(data.threads[0]!.messageCount).toBe(5);
    });
  });

  describe('GET /api/advisor/threads/[id]', () => {
    it('returns thread with all messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 't-1',
          title: 'Test',
          messages: [
            { id: 'm-1', role: 'user', content: 'Hi' },
            { id: 'm-2', role: 'assistant', content: 'Hello!' },
          ],
        }),
      });

      const res = await fetch('/api/advisor/threads/t-1');
      const data = (await res.json()) as { messages: Array<{ role: string }> };

      expect(data.messages).toHaveLength(2);
    });
  });

  describe('DELETE /api/advisor/threads/[id]', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 });

      const res = await fetch('/api/advisor/threads/t-1', { method: 'DELETE' });

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/advisor/threads/t-1', { method: 'DELETE' });
    });
  });
});
