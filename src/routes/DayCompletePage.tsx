import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useJobStore } from '../store/jobStore'
import './DayCompletePage.css'

export function DayCompletePage() {
  const navigate = useNavigate()
  const { currentDay, setCurrentDay } = useChatStore()
  const selectedJob = useJobStore((s) => s.selectedJob)

  const handleContinue = () => {
    setCurrentDay(currentDay + 1)
    navigate('/chat')
  }

  const handleGenerateReport = () => {
    navigate('/chat', { state: { generateNow: true } })
  }

  return (
    <div className="day-complete-page">
      <motion.div
        className="day-complete-card"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="day-complete-icon">🌙</div>
        <h1>第 {currentDay} 天工作结束</h1>
        <p className="day-complete-subtitle">
          {selectedJob?.title || '岗位体验'} · Day {currentDay}
        </p>
        <p className="day-complete-desc">
          {currentDay === 1
            ? '你已经完成了第一天的工作任务，表现不错！明天还有新的挑战等着你。'
            : '又一天的工作顺利完成！你可以选择继续体验，或者现在就生成评估报告。'}
        </p>
        <div className="day-complete-stats">
          <div className="stat-item">
            <span className="stat-value">{currentDay}</span>
            <span className="stat-label">已完成天数</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{currentDay * 2}</span>
            <span className="stat-label">完成任务数</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{3 - currentDay}</span>
            <span className="stat-label">剩余天数</span>
          </div>
        </div>
        <div className="day-complete-actions">
          {currentDay < 3 && (
            <button className="btn btn-primary" onClick={handleContinue}>
              继续第 {currentDay + 1} 天
            </button>
          )}
          <button
            className="btn btn-secondary-dark"
            onClick={handleGenerateReport}
          >
            生成评估报告
          </button>
        </div>
        {currentDay < 3 && (
          <p className="day-complete-tip">
            完成更多天数的体验，评估结果会更准确哦
          </p>
        )}
      </motion.div>
    </div>
  )
}
