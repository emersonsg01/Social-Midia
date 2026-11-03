import type { AIProviderConfig, AIProviderKind } from './types'
import { http } from './util'

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  args: any
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
}

export interface LlmResponse {
  text: string
  toolCalls: ToolCall[]
}

export const providerPresets: Record<AIProviderKind, { label: string; baseUrl: string; model: string; needsKey: boolean; local?: boolean }> = {
  anthropic: { label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', needsKey: true },
  openai: { label: 'ChatGPT (OpenAI)', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', needsKey: true },
  gemini: { label: 'Gemini (Google)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
  ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', needsKey: false, local: true },
  lmstudio: { label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', model: '', needsKey: false, local: true },
  'openai-compatible': { label: 'Compatível com OpenAI', baseUrl: 'http://localhost:8000/v1', model: '', needsKey: false },
}

const baseUrl = (p: AIProviderConfig) => (p.baseUrl || providerPresets[p.kind].baseUrl).replace(/\/+$/, '')

// ---------- Anthropic ----------

function toAnthropic(messages: LlmMessage[]) {
  const out: any[] = []
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      const last = out[out.length - 1]
      // Consecutive tool results must share one user turn.
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') last.content.push(block)
      else out.push({ role: 'user', content: [block] })
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })),
        ],
      })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

async function anthropicComplete(p: AIProviderConfig, key: string | undefined, system: string, messages: LlmMessage[], tools: ToolDef[]) {
  const r = await http(`${baseUrl(p)}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': key ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    json: {
      model: p.model,
      max_tokens: 8192,
      system,
      messages: toAnthropic(messages),
      ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    },
  })
  const blocks: any[] = r.content ?? []
  return {
    text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'),
    toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input })),
  }
}

// ---------- OpenAI-compatible (OpenAI, Gemini, Ollama, LM Studio, ...) ----------

function toOpenAI(system: string, messages: LlmMessage[]) {
  return [
    { role: 'system', content: system },
    ...messages.map((m) => {
      if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      if (m.role === 'assistant' && m.toolCalls?.length)
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) } })),
        }
      return { role: m.role, content: m.content }
    }),
  ]
}

async function openaiComplete(p: AIProviderConfig, key: string | undefined, system: string, messages: LlmMessage[], tools: ToolDef[]) {
  const r = await http(`${baseUrl(p)}/chat/completions`, {
    method: 'POST',
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    json: {
      model: p.model,
      messages: toOpenAI(system, messages),
      ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}),
    },
  })
  const msg = r.choices?.[0]?.message ?? {}
  return {
    text: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((c: any, i: number) => {
      let args: unknown = {}
      try {
        args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments
      } catch {
        /* keep empty args */
      }
      return { id: c.id || `call_${i}`, name: c.function.name, args }
    }),
  }
}

export function complete(p: AIProviderConfig, key: string | undefined, system: string, messages: LlmMessage[], tools: ToolDef[] = []): Promise<LlmResponse> {
  if (!p.model) throw new Error(`Escolha um modelo para "${p.name}" em Configurações > IA.`)
  return p.kind === 'anthropic' ? anthropicComplete(p, key, system, messages, tools) : openaiComplete(p, key, system, messages, tools)
}

export async function listModels(p: AIProviderConfig, key: string | undefined): Promise<string[]> {
  const headers: Record<string, string> =
    p.kind === 'anthropic'
      ? { 'x-api-key': key ?? '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
      : key
        ? { Authorization: `Bearer ${key}` }
        : {}
  const r = await http(`${baseUrl(p)}/models${p.kind === 'anthropic' ? '?limit=100' : ''}`, { headers })
  return ((r.data ?? r.models ?? []) as any[]).map((m) => String(m.id ?? m.name).replace(/^models\//, '')).sort()
}
