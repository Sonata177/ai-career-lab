import type { ChatMessage } from '../types/chat'

const API_BASE = '/api'

interface ChatCompletionOptions {
  messages: { role: string; content: string }[]
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
  maxTokens?: number
  temperature?: number
}

export async function streamChatCompletion({
  messages,
  onChunk,
  onDone,
  onError,
  maxTokens = 1024,
  temperature = 0.8,
}: ChatCompletionOptions) {
  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        stream: true,
        temperature: temperature,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          onDone()
          return
        }
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) onChunk(content)
        } catch {
          // 忽略无法解析的行（非 JSON 的 data 片段，如心跳或空内容）
        }
      }
    }
    onDone()
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export function formatMessagesForAPI(
  messages: ChatMessage[]
): { role: string; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}
