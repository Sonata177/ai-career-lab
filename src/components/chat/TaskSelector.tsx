import { motion } from 'framer-motion'
import './TaskSelector.css'

export interface TaskOption {
  id: string
  title: string
  description: string
  role: string
  icon: string
}

interface Props {
  tasks: TaskOption[]
  onSelect: (task: TaskOption) => void
}

export function TaskSelector({ tasks, onSelect }: Props) {
  return (
    <div className="task-selector">
      <p className="task-selector-label">接下来你需要处理：</p>
      <div className="task-options">
        {tasks.map((task, i) => (
          <motion.button
            key={task.id}
            className="task-option-card"
            onClick={() => onSelect(task)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <span className="task-icon">{task.icon}</span>
            <div className="task-option-info">
              <span className="task-option-title">{task.title}</span>
              <span className="task-option-desc">{task.description}</span>
            </div>
            <span className="task-option-role">{task.role}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
