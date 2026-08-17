import { createApp } from './app.js'

const PORT = process.env.PORT || 3001
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY environment variable is required')
  process.exit(1)
}

const app = createApp({ apiKey: DEEPSEEK_API_KEY })

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
