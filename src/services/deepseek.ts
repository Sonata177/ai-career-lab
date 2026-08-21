import type { ChatMessage } from '../types/chat'

const API_BASE = '/api'

/** 无数据超时默认值：超过该时长未收到任何数据即中止（流式生成本来可能较久，不做总时长限制） */
const DEFAULT_NO_DATA_TIMEOUT_MS = 60_000

interface ChatCompletionOptions {
  messages: { role: string; content: string }[]
  onChunk: (text: string) => void
  onDone: () => void
  onError: (error: Error) => void
  maxTokens?: number
  temperature?: number
  /** 无数据超时（毫秒），收到任意 chunk 会重置计时器 */
  timeoutMs?: number
  /** 外部取消信号（如组件卸载时中止请求） */
  signal?: AbortSignal
}

/**
 * 流式请求 DeepSeek。
 *
 * - 无数据超时：请求开始计时，收到任意 chunk 重置，超过 timeoutMs 无新数据则中止
 * - 外部 signal：主动取消（如浏览器离开页面）
 * - 完成语义：只有收到 data: [DONE] 才算正常完成；连接结束但未收到 [DONE]
 *   视为异常（调用 onError），主对话因此进入"重新获取回复"流程
 * - 错误区分：超时 -> "AI 响应超时，请重试"；主动取消 -> "请求已取消"；其余保留原错误
 */
export async function streamChatCompletion({
  messages,
  onChunk,
  onDone,
  onError,
  maxTokens = 1024,
  temperature = 0.8,
  timeoutMs = DEFAULT_NO_DATA_TIMEOUT_MS,
  signal,
}: ChatCompletionOptions) {
  const controller = new AbortController()
  let timedOut = false
  let externallyAborted = false
  let receivedDone = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const clearIdleTimer = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
  const resetIdleTimer = () => {
    clearIdleTimer()
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  const onExternalAbort = () => {
    externallyAborted = true
    controller.abort()
  }
  if (signal) {
    if (signal.aborted) {
      externallyAborted = true
      controller.abort()
    } else {
      signal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  try {
    resetIdleTimer()
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
      signal: controller.signal,
    })

    if (!response.ok) {
      clearIdleTimer()
      throw new Error(`API error: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      clearIdleTimer()
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdleTimer() // 收到任意数据 → 重置无数据计时器
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          receivedDone = true
          clearIdleTimer()
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

    // 流自然结束：必须收到过 [DONE] 才算正常完成
    clearIdleTimer()
    if (receivedDone) {
      onDone()
    } else {
      onError(new Error('连接中断：未收到完成标记'))
    }
  } catch (error) {
    clearIdleTimer()
    if (timedOut) {
      onError(new Error('AI 响应超时，请重试'))
    } else if (externallyAborted) {
      onError(new Error('请求已取消'))
    } else {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  } finally {
    signal?.removeEventListener('abort', onExternalAbort)
  }
}

export function formatMessagesForAPI(
  messages: ChatMessage[]
): { role: string; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}
