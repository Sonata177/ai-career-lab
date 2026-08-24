import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import request from 'supertest'
import { createApp } from './app.js'

// 测试期间静默 app.js 的服务端错误日志（生产环境保留；避免 stderr 噪声干扰测试输出）
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

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
  it('GET /api/health 返回 200 和 { status: "ok" }；未传 pool 时数据库标明未配置', async () => {
    const { app } = makeApp()

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', database: { configured: false } })
  })

  it('GET /api/health：传入 pool 且 SELECT 1 成功，数据库标记为已连通', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) }
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(pool.query).toHaveBeenCalledWith('SELECT 1')
    expect(res.body).toEqual({ status: 'ok', database: { configured: true, connected: true } })
  })

  it('GET /api/health：传入 pool 但 SELECT 1 失败（数据库不可达），返回 200 并标记未连通', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('connection refused')) }
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(pool.query).toHaveBeenCalledWith('SELECT 1')
    expect(res.body).toEqual({ status: 'ok', database: { configured: true, connected: false } })
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

describe('上游超时与客户端断开', () => {
  /** 模拟真实 fetch：挂起直到 signal 中止才 reject */
  function hangingFetchMock() {
    return vi.fn((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      )
    }))
  }

  const VALID_BODY = { messages: [{ role: 'user', content: '你好' }], stream: false }

  it('验收6：上游超时且响应头未发送：返回 504', async () => {
    const fetchMock = hangingFetchMock()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock, upstreamTimeoutMs: 100 })

    const res = await request(app)
      .post('/api/chat/completions')
      .send(VALID_BODY)

    expect(res.status).toBe(504)
    expect(res.body).toEqual({ error: 'Upstream timeout' })
  })

  it('上游已返回 Response 但首个正文 chunk 不来：返回 504 而非空的 200 SSE', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn((_url, init) => new Promise((resolve) => {
      const stream = new ReadableStream({
        start(c) {
          // 不 enqueue 任何数据；signal 中止时让流报错（模拟浏览器行为）
          init.signal.addEventListener('abort', () =>
            c.error(new DOMException('Aborted', 'AbortError'))
          )
        },
      })
      resolve(new Response(stream, { status: 200 }))
    }))
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock, upstreamTimeoutMs: 100 })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({ messages: [{ role: 'user', content: '你好' }] })

    // 首个 chunk 前超时：响应头尚未发送 → 504，而不是空 200 SSE
    expect(res.status).toBe(504)
    expect(res.body).toEqual({ error: 'Upstream timeout' })
  })

  it('SSE 已开始后上游停滞：超时后结束流且不发送 [DONE]（前端据此判定异常）', async () => {
    const encoder = new TextEncoder()
    // 模拟真实 fetch：上游响应流与 signal 挂钩（中止时流报错）
    const fetchMock = vi.fn((_url, init) => new Promise((resolve) => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'))
          // 之后停滞；signal 中止时让流报错
          init.signal.addEventListener('abort', () =>
            c.error(new DOMException('Aborted', 'AbortError'))
          )
        },
      })
      resolve(new Response(stream, { status: 200 }))
    }))
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock, upstreamTimeoutMs: 100 })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({ messages: [{ role: 'user', content: '你好' }] })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('"content":"部分"')
    expect(res.text).not.toContain('[DONE]')
  })

  it('SSE 持续收到上游 chunk 不误超时（计时器按 chunk 重置）', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(c) {
        let i = 0
        const id = setInterval(() => {
          i++
          c.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${i}"}}]}\n\n`))
          if (i >= 6) {
            clearInterval(id)
            c.close()
          }
        }, 50)
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    // 单 chunk 间隔 50ms，总时长 300ms；若计时器未重置，80ms 处就会被中止
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock, upstreamTimeoutMs: 80 })

    const res = await request(app)
      .post('/api/chat/completions')
      .send({ messages: [{ role: 'user', content: '你好' }] })

    expect(res.status).toBe(200)
    // 6 个 chunk 全部送达
    expect(res.text).toContain('"content":"6"')
  })

  it('验收5：客户端断开连接：中止上游请求', async () => {
    const fetchMock = hangingFetchMock()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock, upstreamTimeoutMs: 10_000 })
    const server = app.listen(0)
    const port = server.address().port

    try {
      // 发起请求后立即销毁连接，模拟浏览器刷新/离开页面
      const req = http.request({
        port,
        path: '/api/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      req.on('error', () => {}) // 销毁连接产生的 ECONNRESET 是预期行为，忽略
      req.write(JSON.stringify(VALID_BODY))
      req.end()
      await new Promise((r) => setTimeout(r, 200))
      req.destroy()

      // 等待服务端感知断开并中止上游
      await new Promise((r) => setTimeout(r, 300))

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [, init] = fetchMock.mock.calls[0]
      expect(init.signal.aborted).toBe(true)
    } finally {
      server.close()
    }
  })
})

describe('POST /api/experiences', () => {
  const DIMENSION_NAMES = [
    '沟通表达', '问题拆解', '执行落地', '用户同理心',
    '数据敏感度', '优先级判断', '协作与求助',
  ]

  /** 七维合法 result（与前端 isAssessmentResult 规则一致的种子数据） */
  function validResult(overrides = {}) {
    return {
      overallScore: 78,
      jobFitPercentage: 66,
      dimensions: DIMENSION_NAMES.map((name) => ({
        name, score: 70, evidence: '积极回应', color: '#16a34a',
      })),
      strengths: ['善于沟通'],
      improvements: ['加强数据意识'],
      suggestions: ['建议1'],
      fitAdvice: '总体适合该岗位',
      ...overrides,
    }
  }

  /** 合法请求体（colleagueMessages 故意不传：验证缺省存 []） */
  function validBody(overrides = {}) {
    return {
      jobId: 'operations-intern',
      jobTitle: '运营实习生',
      scenario: {
        jobId: 'operations-intern',
        jobTitle: '运营实习生',
        background: '背景',
        userIdentity: '身份',
        phases: [{ id: 'day1-task1' }],
      },
      activePhases: [{ id: 'day1-task1', day: 1, time: '09:00', title: '晨会任务' }],
      messages: [{ role: 'user', content: '主管好' }],
      result: validResult(),
      ...overrides,
    }
  }

  /** 假 pool：connect 返回假 client，按 SQL 分发结果并记录调用（不打真实库） */
  function makeFakePool({ failOnInsert = false } = {}) {
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
        if (sql.startsWith('INSERT INTO experiences')) {
          if (failOnInsert) throw new Error('insert failed')
          return { rows: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001' }] }
        }
        if (sql.startsWith('INSERT INTO assessments')) return { rows: [] }
        return { rows: [] }
      }),
    }
    const pool = { connect: vi.fn(async () => client) }
    return { pool, client }
  }

  it('成功插入：同一事务先插 experiences 再插 assessments，colleague_messages 缺省存 []', async () => {
    const { pool, client } = makeFakePool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).post('/api/experiences').send(validBody())

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    expect(pool.connect).toHaveBeenCalledTimes(1)

    // 事务顺序：BEGIN → INSERT experiences → INSERT assessments → COMMIT
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO experiences'),
      expect.stringContaining('INSERT INTO assessments'),
      'COMMIT',
    ])

    // experiences 参数：job_id / job_title / scenario(phases=activePhases) / messages / colleague_messages / finished_at
    // （jsonb 参数为 JSON 字符串，node-postgres 数组需要 stringify）
    const [, expParams] = client.query.mock.calls[1]
    expect(expParams[0]).toBe('operations-intern')
    expect(expParams[1]).toBe('运营实习生')
    expect(JSON.parse(expParams[2])).toMatchObject({
      jobId: 'operations-intern',
      phases: [{ id: 'day1-task1', day: 1, time: '09:00', title: '晨会任务' }],
    })
    expect(JSON.parse(expParams[3])).toEqual([{ role: 'user', content: '主管好' }])
    expect(JSON.parse(expParams[4])).toEqual([]) // 没有问同事 → 存 []
    expect(expParams[5]).toBeInstanceOf(Date)

    // assessments 参数：experience_id / completed_at / overall_score / job_fit_percentage / result
    const [, assParams] = client.query.mock.calls[2]
    expect(assParams[0]).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    expect(assParams[1]).toBeInstanceOf(Date)
    expect(assParams[2]).toBe(78)
    expect(assParams[3]).toBe(66)
    expect(JSON.parse(assParams[4])).toEqual(validResult())

    // 连接归还
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('显式传入 colleagueMessages：原样入库', async () => {
    const { pool, client } = makeFakePool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const colleague = [{ id: 'c1', role: 'assistant', content: '建议先梳理需求' }]
    const res = await request(app)
      .post('/api/experiences')
      .send(validBody({ colleagueMessages: colleague }))

    expect(res.status).toBe(201)
    const expCall = client.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO experiences'))
    expect(JSON.parse(expCall[1][4])).toEqual(colleague)
  })

  it.each([
    ['缺 jobId', validBody({ jobId: undefined }), 'job_id is required'],
    ['jobId 为空白', validBody({ jobId: '   ' }), 'job_id is required'],
    ['缺 jobTitle', validBody({ jobTitle: undefined }), 'job_title is required'],
    ['缺 scenario', validBody({ scenario: undefined }), 'scenario is required'],
    ['缺 messages', validBody({ messages: undefined }), 'messages'],
    ['messages 为空数组', validBody({ messages: [] }), 'messages'],
    ['result 非法（七维校验不通过）', validBody({ result: { overallScore: 'high' } }), 'Invalid result'],
    ['colleague_messages 非数组', validBody({ colleagueMessages: 'none' }), 'colleague_messages'],
  ])('%s：返回 400 且不触库', async (_name, body, keyword) => {
    const { pool } = makeFakePool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).post('/api/experiences').send(body)

    expect(res.status).toBe(400)
    expect(res.body.error).toContain(keyword)
    expect(pool.connect).not.toHaveBeenCalled()
  })

  it('未配置 pool：返回 503 明确错误（降级，不退出进程）', async () => {
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn() })

    const res = await request(app).post('/api/experiences').send(validBody())

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Database not configured' })
  })

  it('写入失败：返回 500 并回滚，连接归还（进程不退出）', async () => {
    const { pool, client } = makeFakePool({ failOnInsert: true })
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).post('/api/experiences').send(validBody())

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save experience' })
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('数据库不可达（connect 失败）：返回 500，进程不退出', async () => {
    const pool = { connect: vi.fn(async () => { throw new Error('connection refused') }) }
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).post('/api/experiences').send(validBody())

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save experience' })
  })
})

describe('GET /api/experiences', () => {
  const LIST_ROW = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    job_title: '运营实习生',
    finished_at: new Date('2026-08-24T08:10:16.571Z'),
    completed_at: new Date('2026-08-24T08:10:16.603Z'),
    overall_score: 82,
    job_fit_percentage: 71,
    // 模拟误带整包字段：列表响应绝不能返回
    scenario: { jobId: 'operations-intern' },
    messages: [{ role: 'user', content: 'secret-content' }],
    result: { overallScore: 82 },
  }

  function makeListPool(rows = [LIST_ROW]) {
    return { query: vi.fn(async () => ({ rows })) }
  }

  it('无筛选：JOIN 两张表按 finished_at 倒序，仅返回轻量字段（不带 messages/result 整包）', async () => {
    const pool = makeListPool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/experiences')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      items: [{
        id: LIST_ROW.id,
        jobTitle: '运营实习生',
        completedAt: LIST_ROW.completed_at.toISOString(),
        overallScore: 82,
        jobFitPercentage: 71,
      }],
    })
    const bodyText = JSON.stringify(res.body)
    expect(bodyText).not.toContain('secret-content')
    expect(bodyText).not.toContain('scenario')
    expect(bodyText).not.toContain('result')

    expect(pool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('JOIN assessments')
    expect(sql).toContain('ORDER BY e.finished_at DESC')
    expect(params).toEqual([null, null, null])
  })

  it('有筛选：jobTitle 模糊匹配 + from/to 时间范围（date-only 当天起止）', async () => {
    const pool = makeListPool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app)
      .get('/api/experiences')
      .query({ jobTitle: '运营', from: '2026-08-01', to: '2026-08-31' })

    expect(res.status).toBe(200)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('ILIKE')
    expect(sql).toContain('e.finished_at >=')
    expect(sql).toContain('e.finished_at <=')
    expect(params).toEqual([
      '运营',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.999Z'),
    ])
  })

  it('筛选从 to 也可传完整 ISO 时间，其余筛选位补 null', async () => {
    const pool = makeListPool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app)
      .get('/api/experiences')
      .query({ jobTitle: '销售', from: '2026-08-24T10:00:00Z' })

    expect(res.status).toBe(200)
    const [, params] = pool.query.mock.calls[0]
    expect(params).toEqual([
      '销售',
      new Date('2026-08-24T10:00:00Z'),
      null,
    ])
  })

  it('非法日期：返回 400 且不触库', async () => {
    const pool = makeListPool()
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/experiences').query({ from: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('查询失败（数据库不可达）：返回 500，进程不退出', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('connection refused') }) }
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/experiences')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to list experiences' })
  })

  it('未配置 pool：返回 503（与 POST 一致）', async () => {
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn() })

    const res = await request(app).get('/api/experiences')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Database not configured' })
  })
})

describe('GET /api/experiences/:id', () => {
  const ID = 'a1b2c3d4-0000-4000-8000-000000000001'
  const DETAIL_ROW = {
    id: ID,
    job_title: '运营实习生',
    finished_at: new Date('2026-08-24T08:10:16.571Z'),
    completed_at: new Date('2026-08-24T08:10:16.603Z'),
    overall_score: 82,
    job_fit_percentage: 71,
    scenario: { jobId: 'operations-intern', phases: [] },
    messages: [{ role: 'user', content: '主管好' }],
    colleague_messages: [{ id: 'c1', role: 'assistant', content: '建议先看工单' }],
    result: { overallScore: 82, jobFitPercentage: 71 },
  }

  function makeDetailPool(rows) {
    return { query: vi.fn(async () => ({ rows })) }
  }

  it('返回对话 + 报告完整详情', async () => {
    const pool = makeDetailPool([DETAIL_ROW])
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get(`/api/experiences/${ID}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: ID,
      jobTitle: '运营实习生',
      finishedAt: DETAIL_ROW.finished_at.toISOString(),
      completedAt: DETAIL_ROW.completed_at.toISOString(),
      overallScore: 82,
      jobFitPercentage: 71,
      scenario: DETAIL_ROW.scenario,
      messages: DETAIL_ROW.messages,
      colleagueMessages: DETAIL_ROW.colleague_messages,
      result: DETAIL_ROW.result,
    })
    // 按 id 查询
    expect(pool.query.mock.calls[0][1]).toEqual([ID])
  })

  it('记录不存在：返回 404', async () => {
    const pool = makeDetailPool([])
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get(`/api/experiences/${ID}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Experience not found' })
  })

  it('非法 id 格式：返回 400 且不触库', async () => {
    const pool = makeDetailPool([])
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn(), pool })

    const res = await request(app).get('/api/experiences/not-a-uuid')

    expect(res.status).toBe(400)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('未配置 pool：返回 503（与 POST 一致）', async () => {
    const app = createApp({ apiKey: 'test-api-key', fetchImpl: vi.fn() })

    const res = await request(app).get(`/api/experiences/${ID}`)

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'Database not configured' })
  })
})
