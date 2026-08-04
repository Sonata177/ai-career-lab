import type { TimelineStep } from '../../types/chat'
import './TimelineBar.css'

interface Props {
  steps: TimelineStep[]
}

export function TimelineBar({ steps }: Props) {
  return (
    <div className="timeline-bar">
      {steps.map((step, i) => (
        <div key={i} className={`timeline-step ${step.status}`}>
          <div className={`step-indicator ${step.status}`}>
            {step.status === 'completed' ? '✓' : i + 1}
          </div>
          <div className="step-info">
            <span className="step-time">{step.time}</span>
            <span className="step-title">{step.title}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
