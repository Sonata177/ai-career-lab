import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamChatCompletion } from './deepseek'

/**
 * 测试辅助：把若干字符串片段编码为 SSE 字节流，构造 status=200 的 Response。
 * 每个字符串依次 enqueue，最后 close()。
 */
function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

/** 带 Mock 回调的选项类型（与 ChatCompletionOptions 结构兼容） */
interface MockedOptions {
  messages: { role: string; content: string }[]
  onChunk: ReturnType<typeof vi.fn<(text: string) => void>>
  onDone: ReturnType<typeof vi.fn<() => void>>
  onError: ReturnType<typeof vi.fn<(error: Error) => void>>
  maxTokens?: number
  temperature?: number
}

/** 构造一次调用的最小参数（回调均为 Mock） */
function makeOptions(overrides: Partial<MockedOptions> = {}): MockedOptions {
  return {
    messages: [{ role: 'user', content: '你好' }],
    onChunk: vi.fn<(text: string) => void>(),
    onDone: vi.fn<() => void>(),
    onError: vi.fn<(error: Error) => void>(),
    ...overrides,
  }
}

describe('streamChatCompletion', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('第一组：正常 SSE 流', () => {
    it('依次收到内容、onDone 一次、onError 不调用，且请求体字段映射正确', async () => {
      fetchMock.mockResolvedValue(createSseResponse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n',
      ]))

      const options = makeOptions({ maxTokens: 2048, temperature: 0.3 })
      await streamChatCompletion(options)

      // 回调行为
      expect(options.onChunk).toHaveBeenCalledTimes(2)
      expect(options.onChunk).toHaveBeenNthCalledWith(1, '你')
      expect(options.onChunk).toHaveBeenNthCalledWith(2, '好')
      expect(options.onDone).toHaveBeenCalledTimes(1)
      expect(options.onError).not.toHaveBeenCalled()

      // 请求体：验证 temperature -> temperature、maxTokens -> max_tokens 映射
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/chat/completions')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(init?.body as string)
      expect(body.model).toBe('deepseek-v4-flash')
      expect(body.messages).toEqual(options.messages)
      expect(body.stream).toBe(true)
      expect(body.temperature).toBe(0.3)
      expect(body.max_tokens).toBe(2048)
    })
  })

  describe('第二组：跨网络 chunk 拆分', () => {
    it('SSE 行被拆到多个 chunk 时仍能完整解析', async () => {
      // 一行 data 被拆成两半，[DONE] 也被拆开
      fetchMock.mockResolvedValue(createSseResponse([
        'data: {"choices":[{"delta":{"content":"你',
        '好"}}]}\n\ndata: [DO',
        'NE]\n\n',
      ]))

      const options = makeOptions()
      await streamChatCompletion(options)

      expect(options.onChunk).toHaveBeenCalledTimes(1)
      expect(options.onChunk).toHaveBeenCalledWith('你好')
      expect(options.onDone).toHaveBeenCalledTimes(1)
      expect(options.onError).not.toHaveBeenCalled()
    })
  })

  describe('第三组：HTTP 错误', () => {
    it('500 响应时 onError 调用一次且消息包含 "API error: 500"，onDone/onChunk 不调用', async () => {
      fetchMock.mockResolvedValue(new Response('服务错误', { status: 500 }))

      const options = makeOptions()
      await streamChatCompletion(options)

      expect(options.onError).toHaveBeenCalledTimes(1)
      expect((options.onError.mock.calls[0][0] as Error).message).toContain('API error: 500')
      expect(options.onDone).not.toHaveBeenCalled()
      expect(options.onChunk).not.toHaveBeenCalled()
    })
  })

  describe('第四组：网络错误', () => {
    it('fetch 拒绝时 onError 收到原始错误，onDone 不调用', async () => {
      fetchMock.mockRejectedValue(new Error('网络中断'))

      const options = makeOptions()
      await streamChatCompletion(options)

      expect(options.onError).toHaveBeenCalledTimes(1)
      expect((options.onError.mock.calls[0][0] as Error).message).toBe('网络中断')
      expect(options.onDone).not.toHaveBeenCalled()
    })
  })

  describe('第五组：没有 [DONE] 但流自然结束', () => {
    it('流正常结束（未发 [DONE]）时仍调用一次 onDone（固定现有行为）', async () => {
      fetchMock.mockResolvedValue(createSseResponse([
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      ]))

      const options = makeOptions()
      await streamChatCompletion(options)

      expect(options.onChunk).toHaveBeenCalledTimes(1)
      expect(options.onChunk).toHaveBeenCalledWith('好')
      expect(options.onDone).toHaveBeenCalledTimes(1)
      expect(options.onError).not.toHaveBeenCalled()
    })
  })
})
