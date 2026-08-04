import { useState, useRef } from 'react'
import './ChatInput.css'

const EMOJI_LIST = [
  '😊', '👍', '🤔', '😅', '💪', '🙏',
  '👌', '😂', '🥲', '😤', '🫡', '✅',
  '❓', '💡', '🎉', '😭', '🙈', '👀',
]

interface Props {
  onSend: (message: string) => void
  onAutoGenerate?: () => void
  showQuickSend?: boolean
  disabled: boolean
}

export function ChatInput({ onSend, onAutoGenerate, showQuickSend, disabled }: Props) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [emptyClickCount, setEmptyClickCount] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) {
      const newCount = emptyClickCount + 1
      setEmptyClickCount(newCount)
      if (newCount >= 5 && onAutoGenerate) {
        setEmptyClickCount(0)
        onAutoGenerate()
      }
      return
    }
    if (disabled) return
    setEmptyClickCount(0)
    onSend(trimmed)
    setText('')
    setShowEmoji(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const insertEmoji = (emoji: string) => {
    setText((prev) => prev + emoji)
    textareaRef.current?.focus()
  }

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'AI 正在思考...' : '输入你的回复...'}
        disabled={disabled}
        rows={1}
      />
      <div className="emoji-wrapper">
        <button
          type="button"
          className="emoji-toggle"
          onClick={() => setShowEmoji(!showEmoji)}
          disabled={disabled}
        >
          😊
        </button>
        {showEmoji && (
          <div className="emoji-picker">
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-item"
                onClick={() => insertEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        className="send-btn"
        disabled={disabled}
      >
        发送
      </button>
      {showQuickSend && (
        <button
          type="button"
          className="quick-send-btn"
          disabled={disabled}
          onClick={() => onAutoGenerate?.()}
        >
          快速发送
        </button>
      )}
    </form>
  )
}
