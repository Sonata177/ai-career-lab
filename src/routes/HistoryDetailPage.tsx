import { useParams, useNavigate } from 'react-router-dom'
import { useHistoryStore } from '../store/historyStore'
import './HistoryDetailPage.css'

export function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // 从历史记录按 URL id 查找（不覆盖当前评估的 assessmentStore.result）
  const record = useHistoryStore((s) => s.records.find((r) => r.id === id))

  // 找不到记录：显示提示与返回入口，不展示空白页
  if (!record) {
    return (
      <div className="history-detail-page">
        <div className="history-detail-missing">
          <div className="history-detail-missing-icon">🔍</div>
          <h1>报告不存在</h1>
          <p>该评估记录可能已被清空或链接已失效。</p>
          <button className="btn btn-primary" onClick={() => navigate('/history')}>
            返回历史记录
          </button>
        </div>
      </div>
    )
  }

  const result = record.result

  return (
    <div className="history-detail-page">
      <div className="history-detail-header">
        <button className="btn history-back-btn" onClick={() => navigate('/history')}>
          ← 返回历史记录
        </button>
        <h1>{record.jobTitle}</h1>
        <p className="history-detail-date">
          完成时间：{new Date(record.completedAt).toLocaleString('zh-CN')}
        </p>
      </div>

      <div className="history-detail-scores">
        <div className="history-score">
          <span className="history-score-value">{record.overallScore}</span>
          <span className="history-score-label">综合评分</span>
        </div>
        <div className="history-score">
          <span className="history-score-value">{record.jobFitPercentage}%</span>
          <span className="history-score-label">岗位适配度</span>
        </div>
      </div>

      <div className="history-detail-section">
        <h2>能力维度评估</h2>
        <div className="history-dim-list">
          {result.dimensions.map((d) => (
            <div key={d.name} className="history-dim-item">
              <div className="history-dim-row">
                <span className="history-dim-name">{d.name}</span>
                <div className="history-dim-bar-bg">
                  <div
                    className="history-dim-bar"
                    style={{ width: `${d.score}%`, background: d.color }}
                  />
                </div>
                <span className="history-dim-score">{d.score}</span>
              </div>
              <p className="history-dim-evidence">{d.evidence}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="history-detail-section">
        <h2>表现亮点</h2>
        <ul className="history-detail-list">
          {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      <div className="history-detail-section">
        <h2>提升方向</h2>
        <ul className="history-detail-list">
          {result.improvements.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      <div className="history-detail-section">
        <h2>行动建议</h2>
        <ul className="history-detail-list">
          {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      <div className="history-detail-section">
        <h2>岗位适配建议</h2>
        <p className="history-detail-fit">{result.fitAdvice}</p>
      </div>
    </div>
  )
}
