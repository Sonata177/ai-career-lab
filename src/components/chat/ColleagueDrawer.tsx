import { useState, useRef, useEffect } from 'react'
import { streamChatCompletion } from '../../services/deepseek'
import type { ColleagueMessage } from '../../types/chat'
import './ColleagueDrawer.css'

export type { ColleagueMessage }

interface Props {
  open: boolean
  onClose: () => void
  phaseTitle: string
  phaseDescription: string
  background: string
  messages: ColleagueMessage[]
  onMessagesChange: (msgs: ColleagueMessage[]) => void
  /** 获取卸载取消信号（离开页面时中止请求，避免浪费 Token；渲染期不读取） */
  getAbortSignal?: () => AbortSignal | undefined
}

export function ColleagueDrawer({ open, onClose, phaseTitle, phaseDescription, background, messages, onMessagesChange, getAbortSignal }: Props) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const systemPrompt = `你是用户的一位热心前辈同事（资深员工），名叫"小李"。用户是新来的实习生，正在处理一个工作任务。

当前场景：${phaseTitle} - ${phaseDescription}
背景：${background}

你的角色规则：
- 你可以给用户提供思路和方向，但不要直接给出完整答案
- 像真实同事一样聊天，语气亲切自然
- 如果用户的问题和当前任务无关，友善地引导回来
- 回复简短，像微信聊天一样，不要长篇大论
- 每次回复控制在2-4句话以内`

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: ColleagueMessage = { id: `cu-${Date.now()}`, role: 'user', content: trimmed }
    const updatedMsgs = [...messages, userMsg]
    onMessagesChange(updatedMsgs)
    setInput('')
    setIsLoading(true)

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmed },
    ]

    let content = ''
    const msgId = `ca-${Date.now()}`
    let added = false

    await streamChatCompletion({
      messages: apiMessages,
      signal: getAbortSignal?.(),
      onChunk: (text) => {
        content += text
        if (!added) {
          added = true
          onMessagesChange([...updatedMsgs, { id: msgId, role: 'assistant', content }])
        } else {
          onMessagesChange([
            ...updatedMsgs,
            ...([{ id: msgId, role: 'assistant' as const, content }]),
          ])
        }
      },
      onDone: () => setIsLoading(false),
      onError: () => setIsLoading(false),
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`colleague-drawer ${open ? 'open' : ''}`}>
      <div className="colleague-header">
        <div className="colleague-title">
          <span className="colleague-avatar">👩‍💼</span>
          <span>同事 · 小李</span>
        </div>
        <button className="colleague-close" onClick={onClose}>✕</button>
      </div>
      <div className="colleague-messages">
        {messages.length === 0 && (
          <div className="colleague-welcome">
            <p>嗨，有什么需要帮忙的吗？我可以给你一些思路~</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`colleague-msg ${msg.role}`}>
            <div className="colleague-msg-bubble">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="colleague-input-bar">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="问问小李..."
          rows={1}
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  )
}
