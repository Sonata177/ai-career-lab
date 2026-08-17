import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './IdleHint.css'

const HINTS = [
  '试着站在对方的角度想想，ta最关心什么？',
  '可以先回应对方的情绪，再给出解决方案。',
  '不确定的话，可以先问一个澄清问题。',
  '试试用"结论先行"的方式组织你的回答。',
  '想想这个任务的核心目标是什么，围绕它来回答。',
  '可以把问题拆解成几个小点，逐一回应。',
]

interface Props {
  visible: boolean
  onDismiss: () => void
}

export function IdleHint({ visible, onDismiss }: Props) {
  // 惰性初始化：仅在挂载时随机选取一次提示语（避免渲染期调用 Math.random）
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)])

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onDismiss, 8000)
      return () => clearTimeout(timer)
    }
  }, [visible, onDismiss])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="idle-hint"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          <div className="idle-hint-header">
            <span className="idle-hint-icon">💡</span>
            <span className="idle-hint-title">没思路吗？可以...</span>
            <button className="idle-hint-close" onClick={onDismiss}>×</button>
          </div>
          <p className="idle-hint-text">{hint}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
