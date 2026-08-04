import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './RoleNotification.css'

interface Props {
  visible: boolean
  role: string
  description: string
  onHide: () => void
}

export function RoleNotification({ visible, role, description, onHide }: Props) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 4000)
      return () => clearTimeout(timer)
    }
  }, [visible, onHide])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="role-notification"
          initial={{ opacity: 0, x: 50, y: -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ type: 'spring', damping: 20 }}
        >
          <div className="role-notif-icon">💬</div>
          <div className="role-notif-content">
            <span className="role-notif-label">当前对话角色</span>
            <span className="role-notif-name">{role}</span>
            <span className="role-notif-desc">{description}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
