/**
 * Provider-agnostic LLM adapter interface.
 */

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;       // for role='tool' — the ID of the tool call this responds to
  toolCalls?: ToolCall[];     // for role='assistant' — tool calls made
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMAdapter {
  chat(
    messages: Message[],
    tools: ToolDefinition[],
    options?: { model?: string; maxTokens?: number; systemPrompt?: string },
  ): Promise<LLMResponse>;
}
