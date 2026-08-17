import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

/**
 * 创建 Express 应用（可注入 apiKey 与 fetchImpl，便于测试：
 * 测试可传假 API Key 和 mock fetch，不会请求真实 DeepSeek）。
 *
 * @param {object} options
 * @param {string} options.apiKey    DeepSeek API 密钥（必填）
 * @param {typeof fetch} [options.fetchImpl] fetch 实现，默认使用全局 fetch
 * @returns {import('express').Express}
 */
export function createApp({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error('apiKey is required')
  }

  const app = express()

  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173']

  app.use(helmet())
  app.use(cors({ origin: ALLOWED_ORIGINS }))
  app.use(express.json({ limit: '1mb' }))

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })

  app.use('/api', apiLimiter)

  app.post('/api/chat/completions', async (req, res) => {
    const { messages, stream, temperature, max_tokens, model } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required' })
    }

    if (messages.length > 100) {
      return res.status(400).json({ error: 'Too many messages' })
    }

    for (const msg of messages) {
      if (typeof msg.content !== 'string' || msg.content.length > 60000) {
        return res.status(400).json({ error: 'Invalid message content' })
      }
    }

    // ---- 参数类型校验（仅当显式传入时；范围钳制仍作用于合法数值）----
    if (stream !== undefined && typeof stream !== 'boolean') {
      return res.status(400).json({ error: 'stream must be a boolean' })
    }
    if (temperature !== undefined
      && (typeof temperature !== 'number' || !Number.isFinite(temperature))) {
      return res.status(400).json({ error: 'temperature must be a finite number' })
    }
    if (max_tokens !== undefined
      && (typeof max_tokens !== 'number' || !Number.isInteger(max_tokens) || max_tokens < 1)) {
      return res.status(400).json({ error: 'max_tokens must be a positive integer' })
    }
    if (model !== undefined && typeof model !== 'string') {
      return res.status(400).json({ error: 'model must be a string' })
    }

    // 统一使用带默认值的 stream：请求体与响应分支必须一致（否则未传 stream 时
    // 上游按 SSE 返回、本地却走 JSON 分支，response.json() 会解析失败）
    const effectiveStream = stream ?? true

    try {
      const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages,
          stream: effectiveStream,
          temperature: Math.min(Math.max(temperature ?? 0.8, 0), 2),
          max_tokens: Math.min(max_tokens ?? 1024, 8192),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DeepSeek API error:', response.status, errorText)
        return res.status(response.status).json({ error: 'AI service error' })
      }

      if (effectiveStream) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')

        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
        } catch (streamErr) {
          console.error('Stream error:', streamErr.message)
        } finally {
          res.end()
        }
      } else {
        const data = await response.json()
        res.json(data)
      }
    } catch (err) {
      console.error('Proxy error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  return app
}
