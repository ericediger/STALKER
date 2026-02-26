import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/errors';
import { generateUlid, toDecimal } from '@stalker/shared';
import type { InstrumentType, TransactionType } from '@stalker/shared';
import {
  AnthropicAdapter,
  executeToolLoop,
  SYSTEM_PROMPT,
  allToolDefinitions,
  createGetPortfolioSnapshotExecutor,
  createGetHoldingExecutor,
  createGetTransactionsExecutor,
  createGetQuotesExecutor,
  createGetTopHoldingsExecutor,
} from '@stalker/advisor';
import type { Message, LLMAdapter } from '@stalker/advisor';
import { PrismaSnapshotStore } from '@/lib/prisma-snapshot-store';
import { processTransactions } from '@stalker/analytics';

/**
 * Build tool executors that call real analytics/Prisma functions.
 * W-7: These must use real data paths, not mock data.
 * W-8: All Decimal values serialized as formatted strings.
 */
function buildToolExecutors(): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const snapshotExecutor = createGetPortfolioSnapshotExecutor({
    fetchSnapshot: async (window: string) => {
      const now = new Date();
      const endDateStr = toDateStr(now);
      let startDateStr: string;

      switch (window) {
        case '1W': {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 7);
          startDateStr = toDateStr(d);
          break;
        }
        case '1M': {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 30);
          startDateStr = toDateStr(d);
          break;
        }
        case '3M': {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 90);
          startDateStr = toDateStr(d);
          break;
        }
        case '1Y': {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 365);
          startDateStr = toDateStr(d);
          break;
        }
        default: {
          // ALL
          const earliest = await prisma.transaction.findFirst({
            orderBy: { tradeAt: 'asc' },
            select: { tradeAt: true },
          });
          startDateStr = earliest ? toDateStr(earliest.tradeAt) : '1970-01-01';
        }
      }

      const [prismaInstruments, prismaTransactions] = await Promise.all([
        prisma.instrument.findMany(),
        prisma.transaction.findMany({ orderBy: { tradeAt: 'asc' } }),
      ]);

      if (prismaTransactions.length === 0) {
        return { totalValue: '$0.00', holdings: [], window };
      }

      const instruments = prismaInstruments.map(toSharedInstrument);
      const transactions = prismaTransactions.map(toSharedTransaction);

      // Check for cached snapshots first (H-2 pattern)
      const snapshotStore = new PrismaSnapshotStore(prisma);
      const cached = await snapshotStore.getRange(startDateStr, endDateStr);

      if (cached.length > 0) {
        const last = cached[cached.length - 1]!;
        const first = cached[0]!;
        const holdings = Object.entries(last.holdingsJson).map(([symbol, entry]) => {
          const h = entry as { qty: { toString(): string }; value: { toString(): string }; costBasis: { toString(): string } };
          const value = toDecimal(h.value.toString());
          const costBasis = toDecimal(h.costBasis.toString());
          const unrealizedPnl = value.minus(costBasis);
          const allocation = last.totalValue.isZero()
            ? '0.00%'
            : `${value.dividedBy(last.totalValue).times(100).toFixed(2)}%`;
          return {
            symbol,
            quantity: h.qty.toString(),
            marketValue: `$${formatNum(value)}`,
            costBasis: `$${formatNum(costBasis)}`,
            unrealizedPnl: `$${formatNum(unrealizedPnl)}`,
            allocation,
          };
        });

        // Build top-5 summary for quick LLM reference
        const sortedByAllocation = [...holdings].sort((a, b) => {
          const pctA = parseFloat(a.allocation.replace('%', ''));
          const pctB = parseFloat(b.allocation.replace('%', ''));
          return pctB - pctA;
        });
        const top5 = sortedByAllocation.slice(0, 5).map((h) => `${h.symbol} (${h.allocation})`).join(', ');

        // Check stale quotes
        const staleCount = await prisma.latestQuote.count({
          where: { asOf: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
        });

        return {
          summary: `Portfolio: ${holdings.length} holdings, total value ${`$${formatNum(last.totalValue)}`}. Top 5 by allocation: ${top5}. Stale quotes: ${staleCount} of ${holdings.length}.`,
          totalValue: `$${formatNum(last.totalValue)}`,
          totalCostBasis: `$${formatNum(last.totalCostBasis)}`,
          unrealizedPnl: `$${formatNum(last.unrealizedPnl)}`,
          realizedPnl: `$${formatNum(last.realizedPnl)}`,
          periodChange: `$${formatNum(last.totalValue.minus(first.totalValue))}`,
          periodChangePct: first.totalValue.isZero()
            ? '0.00%'
            : `${last.totalValue.minus(first.totalValue).dividedBy(first.totalValue).times(100).toFixed(2)}%`,
          window,
          holdings,
        };
      }

      // AD-S10b: No write fallback — snapshots must be built via transaction CRUD or POST /api/portfolio/rebuild
      return {
        totalValue: '$0.00',
        holdings: [],
        window,
        message: 'No cached portfolio snapshots available. Add a transaction or trigger a portfolio rebuild to generate snapshot data.',
      };
    },
  });

  const holdingExecutor = createGetHoldingExecutor({
    fetchHolding: async (symbol: string) => {
      const instrument = await prisma.instrument.findUnique({ where: { symbol } });
      if (!instrument) {
        return { error: `No holding found for symbol: ${symbol}` };
      }

      const txs = await prisma.transaction.findMany({
        where: { instrumentId: instrument.id },
        orderBy: { tradeAt: 'asc' },
      });

      if (txs.length === 0) {
        return { error: `No transactions found for ${symbol}` };
      }

      const sharedTxs = txs.map(toSharedTransaction);
      const result = processTransactions(sharedTxs);

      // Get latest price
      const latestQuote = await prisma.latestQuote.findFirst({
        where: { instrumentId: instrument.id },
        orderBy: { fetchedAt: 'desc' },
      });

      const markPrice = latestQuote ? toDecimal(latestQuote.price.toString()) : null;

      const lots = result.lots.map((lot) => {
        const unrealizedPnl = markPrice
          ? lot.remainingQty.times(markPrice.minus(lot.price))
          : null;
        return {
          openDate: lot.openedAt.toISOString().split('T')[0],
          quantity: lot.remainingQty.toString(),
          costBasisPerShare: `$${formatNum(lot.price)}`,
          totalCostBasis: `$${formatNum(lot.costBasisRemaining)}`,
          unrealizedPnl: unrealizedPnl ? `$${formatNum(unrealizedPnl)}` : 'N/A (no price)',
        };
      });

      const totalQty = result.lots.reduce((s, l) => s.plus(l.remainingQty), toDecimal('0'));
      const totalCost = result.lots.reduce((s, l) => s.plus(l.costBasisRemaining), toDecimal('0'));
      const avgCost = totalQty.isZero() ? toDecimal('0') : totalCost.dividedBy(totalQty);
      const marketValue = markPrice ? totalQty.times(markPrice) : null;
      const unrealizedPnl = marketValue ? marketValue.minus(totalCost) : null;

      const recentTxs = txs.slice(-10).map((tx) => ({
        date: tx.tradeAt.toISOString().split('T')[0],
        type: tx.type,
        quantity: tx.quantity.toString(),
        price: `$${tx.price.toString()}`,
        fees: `$${tx.fees.toString()}`,
      }));

      return {
        symbol,
        name: instrument.name,
        totalShares: totalQty.toString(),
        averageCost: `$${formatNum(avgCost)}`,
        totalCostBasis: `$${formatNum(totalCost)}`,
        markPrice: markPrice ? `$${formatNum(markPrice)}` : 'N/A',
        marketValue: marketValue ? `$${formatNum(marketValue)}` : 'N/A',
        unrealizedPnl: unrealizedPnl ? `$${formatNum(unrealizedPnl)}` : 'N/A',
        quoteAsOf: latestQuote?.asOf?.toISOString() ?? 'N/A',
        lots,
        recentTransactions: recentTxs,
      };
    },
  });

  const transactionsExecutor = createGetTransactionsExecutor({
    fetchTransactions: async (filters) => {
      const where: Record<string, unknown> = {};

      if (filters.symbol) {
        const instrument = await prisma.instrument.findUnique({ where: { symbol: filters.symbol.toUpperCase() } });
        if (instrument) {
          where['instrumentId'] = instrument.id;
        } else {
          return { transactions: [], message: `No instrument found for symbol: ${filters.symbol}` };
        }
      }

      if (filters.startDate || filters.endDate) {
        const tradeAt: Record<string, Date> = {};
        if (filters.startDate) tradeAt['gte'] = new Date(filters.startDate);
        if (filters.endDate) tradeAt['lte'] = new Date(filters.endDate);
        where['tradeAt'] = tradeAt;
      }

      if (filters.type) {
        where['type'] = filters.type;
      }

      const txs = await prisma.transaction.findMany({
        where,
        orderBy: { tradeAt: 'asc' },
        include: { instrument: { select: { symbol: true, name: true } } },
        take: 100,
      });

      return {
        count: txs.length,
        transactions: txs.map((tx) => ({
          date: tx.tradeAt.toISOString().split('T')[0],
          symbol: tx.instrument.symbol,
          type: tx.type,
          quantity: tx.quantity.toString(),
          price: `$${tx.price.toString()}`,
          fees: `$${tx.fees.toString()}`,
          total: `$${formatNum(toDecimal(tx.quantity.toString()).times(toDecimal(tx.price.toString())))}`,
        })),
      };
    },
  });

  const quotesExecutor = createGetQuotesExecutor({
    fetchQuotes: async (symbols: string[]) => {
      const instruments = await prisma.instrument.findMany({
        where: { symbol: { in: symbols } },
      });

      const quotes = await Promise.all(
        instruments.map(async (inst) => {
          const quote = await prisma.latestQuote.findFirst({
            where: { instrumentId: inst.id },
            orderBy: { fetchedAt: 'desc' },
          });

          if (!quote) {
            return {
              symbol: inst.symbol,
              price: 'N/A',
              asOf: 'N/A',
              isStale: true,
            };
          }

          const ageMs = Date.now() - quote.asOf.getTime();
          const ageHours = ageMs / (1000 * 60 * 60);

          return {
            symbol: inst.symbol,
            price: `$${quote.price.toString()}`,
            asOf: quote.asOf.toISOString(),
            ageHours: `${ageHours.toFixed(1)} hours`,
            isStale: ageHours > 2,
          };
        }),
      );

      // Report any symbols not found
      const foundSymbols = new Set(instruments.map((i) => i.symbol));
      const notFound = symbols.filter((s) => !foundSymbols.has(s));

      return {
        quotes,
        ...(notFound.length > 0 ? { notFound } : {}),
      };
    },
  });

  const topHoldingsExecutor = createGetTopHoldingsExecutor({
    fetchTopHoldings: async (count: number, sortBy: string) => {
      const snapshotStore = new PrismaSnapshotStore(prisma);
      const now = new Date();
      const endDateStr = toDateStr(now);
      // Look back 7 days to find the latest snapshot
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - 7);
      const startDateStr = toDateStr(d);

      const cached = await snapshotStore.getRange(startDateStr, endDateStr);
      if (cached.length === 0) {
        return { holdings: [], message: 'No cached portfolio snapshots available.' };
      }

      const last = cached[cached.length - 1]!;
      const holdings = Object.entries(last.holdingsJson).map(([symbol, entry]) => {
        const h = entry as { qty: { toString(): string }; value: { toString(): string }; costBasis: { toString(): string } };
        const value = toDecimal(h.value.toString());
        const costBasis = toDecimal(h.costBasis.toString());
        const unrealizedPnl = value.minus(costBasis);
        const allocation = last.totalValue.isZero()
          ? toDecimal('0')
          : value.dividedBy(last.totalValue).times(100);
        return {
          symbol,
          quantity: h.qty.toString(),
          marketValue: `$${formatNum(value)}`,
          costBasis: `$${formatNum(costBasis)}`,
          unrealizedPnl: `$${formatNum(unrealizedPnl)}`,
          allocation: `${allocation.toFixed(2)}%`,
          _sortValue: sortBy === 'value' ? value
            : sortBy === 'pnl' ? unrealizedPnl
            : allocation, // default: allocation
        };
      });

      // Sort descending by the chosen metric
      holdings.sort((a, b) => {
        const aVal = a._sortValue;
        const bVal = b._sortValue;
        return bVal.minus(aVal).toNumber();
      });

      // Strip internal sort field and truncate
      const result = holdings.slice(0, count).map(({ _sortValue, ...rest }) => rest);

      // Stale quote count
      const staleCount = await prisma.latestQuote.count({
        where: { asOf: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      });

      return {
        summary: `Portfolio: ${holdings.length} holdings, total value $${formatNum(last.totalValue)}. Showing top ${count} by ${sortBy}. Stale quotes: ${staleCount} of ${holdings.length}.`,
        holdings: result,
      };
    },
  });

  return {
    getPortfolioSnapshot: snapshotExecutor,
    getHolding: holdingExecutor,
    getTransactions: transactionsExecutor,
    getQuotes: quotesExecutor,
    getTopHoldings: topHoldingsExecutor,
  };
}

function toDateStr(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSharedInstrument(inst: {
  id: string; symbol: string; name: string; type: string;
  currency: string; exchange: string; exchangeTz: string;
  providerSymbolMap: string; firstBarDate: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    ...inst,
    type: inst.type as InstrumentType,
    providerSymbolMap: JSON.parse(inst.providerSymbolMap) as Record<string, string>,
  };
}

function toSharedTransaction(tx: {
  id: string; instrumentId: string; type: string;
  quantity: unknown; price: unknown; fees: unknown;
  tradeAt: Date; notes: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    ...tx,
    type: tx.type as TransactionType,
    quantity: toDecimal(tx.quantity!.toString()),
    price: toDecimal(tx.price!.toString()),
    fees: toDecimal(tx.fees!.toString()),
  };
}

/**
 * Format a Decimal-like value as a readable number string with commas and 2 decimal places.
 *
 * W-8 fix: Uses Decimal.toFixed(2) directly instead of parseFloat() to avoid
 * floating-point artifacts (e.g., "$10,000.004999999" instead of "$10,000.00").
 * The LLM receives a string — make it a precision-correct string.
 */
function formatNum(value: { toFixed(dp: number): string }): string {
  const fixed = value.toFixed(2);
  // Format with thousands separators using Intl (operates on the string representation)
  const parts = fixed.split('.');
  const intPart = parts[0]!;
  const decPart = parts[1] ?? '00';
  // Add thousands separators to the integer part
  const isNegative = intPart.startsWith('-');
  const digits = isNegative ? intPart.slice(1) : intPart;
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${isNegative ? '-' : ''}${formatted}.${decPart}`;
}

/**
 * Convert a Prisma AdvisorMessage to the internal Message format.
 */
function prismaMessageToInternal(msg: {
  role: string;
  content: string;
  toolCalls: string | null;
  toolResults: string | null;
}): Message {
  const message: Message = {
    role: msg.role as 'user' | 'assistant' | 'tool',
    content: msg.content,
  };

  if (msg.toolCalls) {
    try {
      message.toolCalls = JSON.parse(msg.toolCalls) as Message['toolCalls'];
    } catch {
      // Ignore malformed JSON
    }
  }

  if (msg.role === 'tool' && msg.toolResults) {
    try {
      const parsed = JSON.parse(msg.toolResults) as { toolCallId?: string };
      message.toolCallId = parsed.toolCallId;
    } catch {
      // Ignore malformed JSON
    }
  }

  return message;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Check for API key
    if (!process.env['ANTHROPIC_API_KEY']) {
      return Response.json(
        { error: 'LLM provider not configured', code: 'LLM_NOT_CONFIGURED' },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { threadId?: string; message?: string };

    if (!body.message || body.message.trim().length === 0) {
      return apiError(400, 'VALIDATION_ERROR', 'message is required');
    }

    const userMessage = body.message.trim();
    let threadId = body.threadId ?? null;

    // Create thread if none specified
    if (!threadId) {
      const newThread = await prisma.advisorThread.create({
        data: {
          id: generateUlid(),
          title: userMessage.slice(0, 60),
        },
      });
      threadId = newThread.id;
    } else {
      // Verify thread exists
      const existing = await prisma.advisorThread.findUnique({ where: { id: threadId } });
      if (!existing) {
        return apiError(404, 'NOT_FOUND', `Thread '${threadId}' not found`);
      }
    }

    // Persist user message
    await prisma.advisorMessage.create({
      data: {
        id: generateUlid(),
        threadId,
        role: 'user',
        content: userMessage,
      },
    });

    // Load conversation history (last 50 messages)
    const historyMessages = await prisma.advisorMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    const conversationHistory: Message[] = historyMessages.map(prismaMessageToInternal);

    // Build adapter and run tool loop
    let adapter: LLMAdapter;
    try {
      adapter = new AnthropicAdapter();
    } catch {
      return Response.json(
        { error: 'LLM provider not configured', code: 'LLM_NOT_CONFIGURED' },
        { status: 503 },
      );
    }

    const toolExecutors = buildToolExecutors();

    let result: { messages: Message[]; finalResponse: string };
    try {
      result = await executeToolLoop({
        adapter,
        systemPrompt: SYSTEM_PROMPT,
        messages: conversationHistory,
        tools: allToolDefinitions,
        toolExecutors,
      });
    } catch (err: unknown) {
      console.error('Advisor LLM error:', err);
      return Response.json(
        { error: 'Advisor temporarily unavailable', code: 'LLM_ERROR' },
        { status: 502 },
      );
    }

    // Persist generated messages
    const persistedMessages: Array<{
      id: string;
      role: string;
      content: string;
      toolCalls?: unknown;
      toolName?: string;
      createdAt: string;
    }> = [];

    for (const msg of result.messages) {
      const msgId = generateUlid();
      await prisma.advisorMessage.create({
        data: {
          id: msgId,
          threadId,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          toolResults: msg.toolCallId ? JSON.stringify({ toolCallId: msg.toolCallId }) : null,
        },
      });

      const serialized: {
        id: string;
        role: string;
        content: string;
        toolCalls?: unknown;
        toolName?: string;
        createdAt: string;
      } = {
        id: msgId,
        role: msg.role,
        content: msg.content,
        createdAt: new Date().toISOString(),
      };

      if (msg.toolCalls) {
        serialized.toolCalls = msg.toolCalls;
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        // Find the tool name from the preceding assistant message's tool calls
        const precedingAssistant = result.messages.find(
          (m) => m.role === 'assistant' && m.toolCalls?.some((tc) => tc.id === msg.toolCallId),
        );
        const matchingCall = precedingAssistant?.toolCalls?.find((tc) => tc.id === msg.toolCallId);
        if (matchingCall) {
          serialized.toolName = matchingCall.name;
        }
      }

      persistedMessages.push(serialized);
    }

    // Update thread timestamp
    await prisma.advisorThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    // W-10: Response must be fully JSON-serializable — all strings, no Decimal/Date objects
    return Response.json({
      threadId,
      messages: persistedMessages,
    });
  } catch (err: unknown) {
    console.error('POST /api/advisor/chat error:', err);
    return apiError(500, 'INTERNAL_ERROR', 'Failed to process advisor chat');
  }
}
