import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

/** 构造带假 apiKey 和 mock fetch 的应用 */
function makeApp() {
  const fetchMock = vi.fn()
  const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })
  return { app, fetchMock }
}

/** 把 SSE 字符串片段编码为上游响应流 */
function createSseResponse(chunks) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('createApp', () => {
  it('GET /api/health 返回 200 和 { status: "ok" }', async () => {
    const { app } = makeApp()

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('POST /api/chat/completions 缺少 messages 返回 400，且不调用 mock fetch', async () => {
    const { app, fetchMock } = makeApp()

    const res = await request(app)
      .post('/api/chat/completions')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'messages is required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('请求不传 stream 时：上游收到 stream=true，本地以 SSE 返回 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSseResponse([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({ messages: [{ role: 'user', content: '你好' }] })

    // 1. 发给上游的 stream 必须为 true（未传时走默认值）
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const upstreamBody = JSON.parse(init.body)
    expect(upstreamBody.stream).toBe(true)

    // 2. 本地响应应为 SSE 流
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')

    // 3. 响应体完整透传了上游 SSE 内容
    expect(res.text).toContain('"content":"你"')
    expect(res.text).toContain('data: [DONE]')
  })

  it('请求传 stream=false 时：上游收到 stream=false，本地以 JSON 原样返回', async () => {
    const upstreamData = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: '{"overallScore":78}',
          },
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({
        messages: [{ role: 'user', content: '你好' }],
        stream: false,
      })

    // 1. fetchMock 只调用一次
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 2. 上游请求体中的 stream 严格等于 false
    const [, init] = fetchMock.mock.calls[0]
    const upstreamBody = JSON.parse(init.body)
    expect(upstreamBody.stream).toBe(false)

    // 3/4. 本地响应为 JSON 200
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')

    // 5. 响应体与上游数据完全相等
    expect(res.body).toEqual(upstreamData)
  })
})

describe('参数默认值与边界限制（stream=false + JSON mock）', () => {
  const upstreamData = {
    choices: [{ message: { role: 'assistant', content: '{}' } }],
  }

  /** 发送请求并返回 fetchMock（供检查上游请求体） */
  async function sendWith(params) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({ messages: [{ role: 'user', content: '你好' }], stream: false, ...params })

    expect(res.status).toBe(200)
    return fetchMock
  }

  it.each([
    ['不传参数', {}, 0.8, 1024],
    ['传正常值', { temperature: 0.2, max_tokens: 4096 }, 0.2, 4096],
    ['超出上限', { temperature: 3, max_tokens: 10000 }, 2, 8192],
    ['温度低于下限', { temperature: -1 }, 0, 1024],
  ])('%s：上游请求体 temperature=%s, max_tokens=%s', async (_name, params, expectedTemp, expectedTokens) => {
    const fetchMock = await sendWith(params)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.temperature).toBe(expectedTemp)
    expect(body.max_tokens).toBe(expectedTokens)
  })
})

describe('错误类型参数返回 400', () => {
  const VALID_MESSAGES = [{ role: 'user', content: '你好' }]

  /** 发送 body，断言 400 + 错误消息包含关键字 + fetch 不被调用 */
  async function expectRejected(body, errorKeyword) {
    const fetchMock = vi.fn()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send(body)

    expect(res.status).toBe(400)
    expect(res.body.error).toContain(errorKeyword)
    expect(fetchMock).not.toHaveBeenCalled()
  }

  it('stream 传字符串 "false" 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, stream: 'false' }, 'stream'))

  it('stream 传数字 1 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, stream: 1 }, 'stream'))

  it('stream 传 null 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, stream: null }, 'stream'))

  it('temperature 传字符串 "0.5" 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, temperature: '0.5' }, 'temperature'))

  it('max_tokens 传字符串 "1024" 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, max_tokens: '1024' }, 'max_tokens'))

  it('max_tokens 传小数 100.5 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, max_tokens: 100.5 }, 'max_tokens'))

  it('max_tokens 传负数 -5 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, max_tokens: -5 }, 'max_tokens'))

  it('model 传数字 123 返回 400', () =>
    expectRejected({ messages: VALID_MESSAGES, model: 123 }, 'model'))
})

describe('上游接口异常', () => {
  const VALID_BODY = { messages: [{ role: 'user', content: '你好' }], stream: false }

  it.each([
    ['401', 401, 'Invalid API key'],
    ['429', 429, 'Rate limit exceeded'],
    ['500', 500, 'Upstream exploded'],
  ])('DeepSeek 返回 %s：透传状态码 + 通用错误，不泄露 API Key 或上游原始信息', async (_name, status, upstreamMessage) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: upstreamMessage } }), { status })
    )
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send(VALID_BODY)

    // 状态码透传，body 为通用错误
    expect(res.status).toBe(status)
    expect(res.body).toEqual({ error: 'AI service error' })

    // API Key 只出现在上游请求头中，绝不回显到响应
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer test-api-key')

    // 响应不包含 API Key，也不包含上游原始错误信息
    const bodyText = JSON.stringify(res.body)
    expect(bodyText).not.toContain('test-api-key')
    expect(bodyText).not.toContain(upstreamMessage)
  })

  it('fetch 抛出网络错误：返回 500 通用错误，不泄露错误详情', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed: connection refused'))
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })

    const res = await request(app)
      .post('/api/chat/completions')
      .send(VALID_BODY)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })

    // 不泄露网络错误详情
    const bodyText = JSON.stringify(res.body)
    expect(bodyText).not.toContain('fetch failed')
    expect(bodyText).not.toContain('connection refused')
  })
})
