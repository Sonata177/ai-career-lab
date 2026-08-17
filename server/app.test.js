import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

/** 构造带假 apiKey 和 mock fetch 的应用 */
function makeApp() {
  const fetchMock = vi.fn()
  const app = createApp({ apiKey: 'test-api-key', fetchImpl: fetchMock })
  return { app, fetchMock }
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
})
