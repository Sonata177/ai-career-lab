import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

const app = express()
const PORT = process.env.PORT || 3001
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY environment variable is required')
  process.exit(1)
}

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

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        stream: stream ?? true,
        temperature: Math.min(Math.max(temperature ?? 0.8, 0), 2),
        max_tokens: Math.min(max_tokens ?? 1024, 8192),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('DeepSeek API error:', response.status, errorText)
      return res.status(response.status).json({ error: 'AI service error' })
    }

    if (stream) {
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

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
