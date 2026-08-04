import './MessageBubble.css'

interface Props {
  role: 'system' | 'assistant' | 'user'
  content: string
  scenarioRole?: string
}

export function MessageBubble({ role, content, scenarioRole }: Props) {
  return (
    <div className={`message-bubble ${role}`}>
      {role === 'assistant' && scenarioRole && (
        <span className="scenario-role">{scenarioRole}</span>
      )}
      {role === 'system' && (
        <span className="scenario-role">系统</span>
      )}
      <div className="bubble-content">
        {content.split('\n').map((line, i) => (
          <p key={i}>{line || ' '}</p>
        ))}
      </div>
    </div>
  )
}
