import type { LLMAdapter, Message, ToolDefinition } from './llm-adapter.js';

/**
 * Execute the LLM tool-calling loop.
 *
 * Loop: call LLM -> if tool_calls, execute tools, append results, call LLM again -> max iterations.
 * If tool executor throws: catch error, return error as tool result string.
 * If adapter throws: propagate up to caller.
 */
export async function executeToolLoop(params: {
  adapter: LLMAdapter;
  systemPrompt: string;
  messages: Message[];
  tools: ToolDefinition[];
  toolExecutors: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  maxIterations?: number;
}): Promise<{ messages: Message[]; finalResponse: string }> {
  const {
    adapter,
    systemPrompt,
    tools,
    toolExecutors,
    maxIterations = 5,
  } = params;

  // Work on a copy of messages to avoid mutating the input
  const allMessages = [...params.messages];
  const generatedMessages: Message[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // Call the LLM
    const response = await adapter.chat(allMessages, tools, {
      systemPrompt,
    });

    // If the LLM returned tool calls, execute them
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Build assistant message with tool calls
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: response.toolCalls,
      };
      allMessages.push(assistantMsg);
      generatedMessages.push(assistantMsg);

      // Execute each tool call
      for (const tc of response.toolCalls) {
        let resultContent: string;
        try {
          const executor = toolExecutors[tc.name];
          if (!executor) {
            resultContent = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
          } else {
            const result = await executor(tc.arguments);
            resultContent = JSON.stringify(result);
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Tool execution failed';
          resultContent = JSON.stringify({ error: errorMessage });
        }

        const toolMsg: Message = {
          role: 'tool',
          content: resultContent,
          toolCallId: tc.id,
        };
        allMessages.push(toolMsg);
        generatedMessages.push(toolMsg);
      }

      // Continue the loop — the LLM will see the tool results
      continue;
    }

    // No tool calls — this is the final response
    const finalMsg: Message = {
      role: 'assistant',
      content: response.content ?? '',
    };
    allMessages.push(finalMsg);
    generatedMessages.push(finalMsg);

    return {
      messages: generatedMessages,
      finalResponse: response.content ?? '',
    };
  }

  // Max iterations reached — return whatever we have
  // Use || (not ??) to coalesce empty strings to the fallback message
  const lastAssistant = generatedMessages.filter((m) => m.role === 'assistant').pop();
  return {
    messages: generatedMessages,
    finalResponse: lastAssistant?.content || 'I was unable to complete the analysis within the allowed number of steps.',
  };
}
