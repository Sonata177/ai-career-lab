import { Pool } from 'pg'
import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DATABASE_URL = process.env.DATABASE_URL

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY environment variable is required')
  process.exit(1)
}

// PostgreSQL 连接池（可选）：没有 DATABASE_URL 时只禁用数据库入库，
// 评估主流程（DeepSeek 代理等）照常运行，不退出进程。
let pool
if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      // 数据库不可达时失败，避免请求（如 health 探测）无限悬挂。
      // 注意：实测该链路（CGNAT/Tailscale）建连耗时 1~15s 波动，3s 会频繁误报不可用
      connectionTimeoutMillis: 15_000,
    })
    // 空闲连接异常（如数据库重启、连接被服务端断开）不应导致进程退出
    pool.on('error', (err) => {
      console.error('Database pool error:', err.message)
    })
    // 启动时非阻塞探测一次：尽早暴露连接问题，失败只告警、不阻断启动
    pool.query('SELECT 1').catch((err) => {
      console.warn('Database connection check failed:', err.message)
    })
  } catch (err) {
    console.warn(`Invalid DATABASE_URL; database persistence disabled: ${err.message}`)
    pool = undefined
  }
} else {
  console.warn('DATABASE_URL is not set; database persistence disabled, evaluation flow still works')
}

const app = createApp({ apiKey: DEEPSEEK_API_KEY, pool })

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
