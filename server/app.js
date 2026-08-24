import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { getAssessmentValidationErrors } from './assessmentValidation.js'

/**
 * 创建 Express 应用（可注入 apiKey、fetchImpl 与 pool，便于测试：
 * 测试可传假 API Key、mock fetch 和假 pool，不会请求真实 DeepSeek/PostgreSQL）。
 *
 * @param {object} options
 * @param {string} options.apiKey    DeepSeek API 密钥（必填）
 * @param {typeof fetch} [options.fetchImpl] fetch 实现，默认使用全局 fetch
 * @param {number} [options.upstreamTimeoutMs] 上游无响应超时（毫秒），默认 60s
 * @param {import('pg').Pool} [options.pool] PostgreSQL 连接池（可选）。
 *   不传时数据库功能不可用（health 中标明未配置），评估主流程不受影响
 * @returns {import('express').Express}
 */
export function createApp({
  apiKey,
  fetchImpl = fetch,
  upstreamTimeoutMs = 60_000,
  pool,
}) {
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

    // 上游请求控制：无响应超时 + 客户端断开时中止（避免继续消耗 Token）。
    // 计时器在收到上游数据时重置（无数据超时语义），最后统一清理。
    const controller = new AbortController()
    let upstreamTimedOut = false
    let upstreamTimeout = setTimeout(() => {
      upstreamTimedOut = true
      controller.abort()
    }, upstreamTimeoutMs)
    const resetUpstreamTimeout = () => {
      clearTimeout(upstreamTimeout)
      upstreamTimeout = setTimeout(() => {
        upstreamTimedOut = true
        controller.abort()
      }, upstreamTimeoutMs)
    }
    const onClientClose = () => controller.abort()
    res.on('close', onClientClose)

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
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('DeepSeek API error:', response.status, errorText)
        return res.status(response.status).json({ error: 'AI service error' })
      }

      if (effectiveStream) {
        const reader = response.body.getReader()
        let streamStarted = false
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            resetUpstreamTimeout() // 每次收到上游数据重置无响应计时器

            // 只有拿到首个正文 chunk 后才发送 SSE 响应头：
            // 首 chunk 前超时会抛到外层，返回 504，而不是空的 200 SSE。
            if (!streamStarted) {
              streamStarted = true
              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')
              res.setHeader('X-Accel-Buffering', 'no')
            }
            res.write(value)
          }
        } catch (streamErr) {
          if (!streamStarted) {
            // 尚未向客户端发送任何响应头/数据，交由外层超时分支返回 504。
            throw streamErr
          }
          // SSE 已开始：结束流，前端按未收到 [DONE] 判定为异常并进入重试流程。
          // 超时/客户端断开触发的中止是预期路径；其余真实读流异常需要留日志。
          if (!controller.signal.aborted) {
            console.error('Stream read error:', streamErr.message)
          }
          if (!res.destroyed) {
            res.end()
          }
        } finally {
          if (streamStarted && !res.destroyed) {
            res.end()
          }
        }
      } else {
        const data = await response.json()
        res.json(data)
      }
    } catch (err) {
      // 客户端已断开：不再写响应
      if (res.destroyed || res.writableEnded) return
      if (upstreamTimedOut) {
        if (!res.headersSent) {
          // 响应头未发送：返回 504
          return res.status(504).json({ error: 'Upstream timeout' })
        }
        // 已开始 SSE：结束流（前端识别为异常）
        return res.end()
      }
      console.error('Proxy error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    } finally {
      clearTimeout(upstreamTimeout)
      res.removeListener('close', onClientClose)
    }
  })

  /**
   * 完整体验入库（可选功能，需注入 pool）：
   * 同一事务先插 experiences，再插 assessments（后者外键指向前者）。
   * - 校验：jobId/jobTitle/scenario/messages 必填，result 沿用七维校验
   * - colleagueMessages 缺省存 []
   * - activePhases 为实际使用（随机化后）的阶段，覆盖 scenario 中的剧本 phases
   * - 未配置 pool 或写入失败：返回 503/500，绝不让进程退出
   */
  app.post('/api/experiences', async (req, res) => {
    if (!pool) {
      return res.status(503).json({ error: 'Database not configured' })
    }

    const {
      jobId, jobTitle, scenario, activePhases,
      messages, colleagueMessages, result,
    } = req.body ?? {}

    if (typeof jobId !== 'string' || jobId.trim() === '') {
      return res.status(400).json({ error: 'job_id is required' })
    }
    if (typeof jobTitle !== 'string' || jobTitle.trim() === '') {
      return res.status(400).json({ error: 'job_title is required' })
    }
    if (typeof scenario !== 'object' || scenario === null || Array.isArray(scenario)) {
      return res.status(400).json({ error: 'scenario is required' })
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' })
    }
    if (colleagueMessages !== undefined && !Array.isArray(colleagueMessages)) {
      return res.status(400).json({ error: 'colleague_messages must be an array' })
    }
    const resultErrors = getAssessmentValidationErrors(result)
    if (resultErrors.length > 0) {
      return res.status(400).json({ error: 'Invalid result', details: resultErrors })
    }

    // 用实际用过的阶段覆盖剧本原始 phases（未提供或为空时回退 scenario.phases）
    const scenarioToStore = Array.isArray(activePhases) && activePhases.length > 0
      ? { ...scenario, phases: activePhases }
      : scenario

    // 注意：node-postgres 会把 JS 数组按 PG 数组字面量序列化，jsonb 列必须先 JSON.stringify
    let client
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      const expRes = await client.query(
        `INSERT INTO experiences (job_id, job_title, scenario, messages, colleague_messages, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          jobId.trim(), jobTitle.trim(),
          JSON.stringify(scenarioToStore), JSON.stringify(messages), JSON.stringify(colleagueMessages ?? []),
          new Date(),
        ],
      )
      const experienceId = expRes.rows[0].id
      await client.query(
        `INSERT INTO assessments (experience_id, completed_at, overall_score, job_fit_percentage, result)
         VALUES ($1, $2, $3, $4, $5)`,
        [experienceId, new Date(), result.overallScore, result.jobFitPercentage, JSON.stringify(result)],
      )
      await client.query('COMMIT')
      res.status(201).json({ id: experienceId })
    } catch (err) {
      try {
        await client?.query('ROLLBACK')
      } catch {
        // 连接已断时 ROLLBACK 失败可忽略（外层主错误已记录）
      }
      console.error('Failed to save experience:', err.message)
      res.status(500).json({ error: 'Failed to save experience' })
    } finally {
      client?.release()
    }
  })

  app.get('/api/health', async (req, res) => {
    if (!pool) {
      // 未配置数据库：主流程仍可用，仅标明入库不可用
      return res.json({ status: 'ok', database: { configured: false } })
    }
    try {
      await pool.query('SELECT 1')
      res.json({ status: 'ok', database: { configured: true, connected: true } })
    } catch (err) {
      // 数据库不可达不视为服务故障：返回 200 并在 JSON 中标明未连通
      console.warn('Database health check failed:', err.message)
      res.json({ status: 'ok', database: { configured: true, connected: false } })
    }
  })

  return app
}
