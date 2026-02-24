import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, Message, ToolDefinition, LLMResponse, ToolCall } from './llm-adapter.js';

/**
 * Anthropic Claude adapter implementing the LLMAdapter interface.
 *
 * W-5: Anthropic uses `tool_use` content blocks and expects `tool_result` in user messages.
 * This adapter translates between the internal Message format and Anthropic's format.
 */
export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic;
  private defaultModel: string;

  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    this.client = new Anthropic({ apiKey });
    this.defaultModel = process.env['LLM_MODEL'] ?? 'claude-sonnet-4-6';
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { model?: string; maxTokens?: number; systemPrompt?: string },
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 16000;

    // Convert internal messages to Anthropic format
    const anthropicMessages = this.toAnthropicMessages(messages);

    // Convert tool definitions to Anthropic format
    const anthropicTools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool['input_schema'],
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      system: options?.systemPrompt ?? undefined,
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    return this.fromAnthropicResponse(response);
  }

  /**
   * Convert internal Message[] to Anthropic's message format.
   * Key translation: role='tool' messages become user messages with tool_result content blocks.
   */
  private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        const contentBlocks: Anthropic.ContentBlockParam[] = [];

        // Add text content if present
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        // Add tool_use blocks for any tool calls
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
        }

        if (contentBlocks.length > 0) {
          result.push({ role: 'assistant', content: contentBlocks });
        }
      } else if (msg.role === 'tool') {
        /**
         * W-5: Anthropic tool_result message translation workaround.
         *
         * STALKER's internal message format uses a dedicated 'tool' role:
         *   { role: 'tool', content: '<JSON string>', toolCallId: '<id>' }
         *
         * Anthropic's Messages API does NOT have a 'tool' role. Instead, it expects
         * tool results to be sent as 'user' role messages containing an array of
         * content blocks with type 'tool_result':
         *   { role: 'user', content: [{ type: 'tool_result', tool_use_id: '<id>', content: '<string>' }] }
         *
         * This transformation maps STALKER's role='tool' → Anthropic's role='user' with
         * tool_result content blocks. The tool_use_id links the result back to the
         * corresponding tool_use block in the preceding assistant message.
         *
         * If STALKER adds support for other LLM providers (e.g., OpenAI), those adapters
         * will need their own translation since OpenAI uses a 'tool' role natively.
         */
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId ?? '',
              content: msg.content,
            },
          ],
        });
      }
    }

    return result;
  }

  /**
   * Convert Anthropic response to internal LLMResponse format.
   */
  private fromAnthropicResponse(response: Anthropic.Message): LLMResponse {
    let content: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content = content ? content + block.text : block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
      // Skip 'thinking' blocks — adaptive thinking content is internal only
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
