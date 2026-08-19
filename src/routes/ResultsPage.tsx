import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAssessmentStore } from '../store/assessmentStore'
import { useJobStore } from '../store/jobStore'
import { useChatStore } from '../store/chatStore'
import './ResultsPage.css'

export function ResultsPage() {
  const navigate = useNavigate()
  const result = useAssessmentStore((s) => s.result)
  const selectedJob = useJobStore((s) => s.selectedJob)
  const { currentDay, setCurrentDay } = useChatStore()

  const showContinueBtn = currentDay === 1 && result && result.overallScore >= 80

  const handleContinueExperience = () => {
    useChatStore.setState({ isComplete: false })
    setCurrentDay(currentDay + 1)
    navigate('/chat')
  }

  const handleExport = () => {
    if (!result) return

    const exportData = {
      exportedAt: new Date().toISOString(),
      jobTitle: selectedJob?.title || '岗位体验',
      result,
    }

    // JSON.stringify(..., null, 2) 让下载文件可读
    const blob = new Blob(
      [JSON.stringify(exportData, null, 2)],
      { type: 'application/json;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'assessment-report.json'
    link.click()

    URL.revokeObjectURL(url) // 释放临时 URL，防止内存占用
  }

  if (!result) {
    return (
      <div className="results-loading">
        <div className="loading-spinner" />
        <p>正在生成评估报告...</p>
      </div>
    )
  }

  return (
    <div className="results-page">
      <div className="container">
        <motion.div
          className="results-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1>体验评估报告</h1>
          <p>{selectedJob?.title || '岗位体验'} 能力评估结果</p>
        </motion.div>

        <motion.div
          className="overall-score"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="score-circle">
            <span className="score-number">{result.overallScore}</span>
            <span className="score-label">综合评分</span>
          </div>
          <div className="fit-badge">
            岗位适配度 {result.jobFitPercentage}%
          </div>
        </motion.div>

        <div className="dimensions-section">
          <h2>能力维度评估</h2>
          <div className="dimensions-grid">
            {result.dimensions.map((d, i) => (
              <motion.div
                key={d.name}
                className="dimension-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
              >
                <div className="dim-header">
                  <span className="dim-name">{d.name}</span>
                  <span className="dim-score" style={{ color: d.color }}>
                    {d.score}
                  </span>
                </div>
                <div className="dim-bar-bg">
                  <motion.div
                    className="dim-bar-fill"
                    style={{ background: d.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${d.score}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.1 }}
                  />
                </div>
                <p className="dim-evidence">{d.evidence}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* PLACEHOLDER_GROWTH */}

        <div className="growth-section-results">
          <div className="growth-col">
            <h3 className="growth-title strengths">表现亮点</h3>
            <ul>
              {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="growth-col">
            <h3 className="growth-title improvements">提升方向</h3>
            <ul>
              {result.improvements.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div className="growth-col">
            <h3 className="growth-title suggestions">行动建议</h3>
            <ul>
              {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>

        <motion.div
          className="fit-advice"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <h3>岗位适配建议</h3>
          <p>{result.fitAdvice}</p>
        </motion.div>

        {showContinueBtn && (
          <motion.div
            className="continue-experience-banner"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
          >
            <div className="continue-experience-text">
              <span className="continue-experience-icon">🌟</span>
              <p>你的首日评估表现良好，建议继续体验后续任务，以获得更全面深入的能力画像。</p>
            </div>
            <button className="btn btn-continue" onClick={handleContinueExperience}>
              继续体验 Day 2
            </button>
          </motion.div>
        )}

        <div className="results-actions">
          <button className="btn btn-primary" onClick={() => navigate('/select')}>
            体验其他岗位
          </button>
          <button className="btn btn-secondary-dark" onClick={handleExport}>
            导出评估报告
          </button>
          <button className="btn btn-secondary-dark" onClick={() => navigate('/chat')}>
            返回对话
          </button>
          <button className="btn btn-secondary-dark" onClick={() => navigate('/')}>
            返回首页
          </button>
        </div>
      </div>
    </div>
  )
}
