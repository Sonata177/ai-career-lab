import { useNavigate, useSearchParams } from 'react-router-dom'
import { useHistoryStore } from '../store/historyStore'
import { compareAssessments, type DimensionTrend } from '../utils/assessmentComparison'
import './HistoryComparePage.css'

const TREND_LABEL: Record<DimensionTrend, string> = {
  up: '提升',
  down: '下降',
  same: '不变',
}

function formatDiff(diff: number) {
  return diff > 0 ? `+${diff}` : `${diff}`
}

export function HistoryComparePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const records = useHistoryStore((s) => s.records)

  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  // 去重：ids=r1,r1 时不能把同一条报告当作两条对比
  const uniqueIds = [...new Set(ids)]
  const selected = uniqueIds
    .map((id) => records.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))

  // 参数缺失、ID 重复或记录不足两条：显示提示，不展示空白页
  if (uniqueIds.length !== 2 || selected.length !== 2) {
    return (
      <div className="history-compare-page">
        <div className="history-compare-missing">
          <div className="history-compare-missing-icon">📊</div>
          <h1>无法对比</h1>
          <p>需要选择两条评估记录才能对比，或记录已被清空。</p>
          <button className="btn btn-primary" onClick={() => navigate('/history')}>
            返回历史记录
          </button>
        </div>
      </div>
    )
  }

  const comparison = compareAssessments(selected[0], selected[1])

  return (
    <div className="history-compare-page">
      <div className="history-compare-header">
        <button className="btn history-back-btn" onClick={() => navigate('/history')}>
          ← 返回历史记录
        </button>
        <h1>报告对比</h1>
        <p>对比两次评估，看看自己进步了没有</p>
      </div>

      <div className="compare-cards">
        <div className="compare-card">
          <h3>{comparison.before.jobTitle}</h3>
          <span className="compare-card-date">
            {new Date(comparison.before.completedAt).toLocaleString('zh-CN')}
          </span>
          <div className="compare-card-scores">
            <div>
              <span className="compare-score-value">{comparison.before.overallScore}</span>
              <span className="compare-score-label">综合评分</span>
            </div>
            <div>
              <span className="compare-score-value">{comparison.before.jobFitPercentage}%</span>
              <span className="compare-score-label">岗位适配度</span>
            </div>
          </div>
        </div>
        <div className="compare-vs">VS</div>
        <div className="compare-card">
          <h3>{comparison.after.jobTitle}</h3>
          <span className="compare-card-date">
            {new Date(comparison.after.completedAt).toLocaleString('zh-CN')}
          </span>
          <div className="compare-card-scores">
            <div>
              <span className="compare-score-value">{comparison.after.overallScore}</span>
              <span className="compare-score-label">综合评分</span>
            </div>
            <div>
              <span className="compare-score-value">{comparison.after.jobFitPercentage}%</span>
              <span className="compare-score-label">岗位适配度</span>
            </div>
          </div>
        </div>
      </div>

      <div className="compare-overall">
        <span>
          综合评分：{comparison.before.overallScore} → {comparison.after.overallScore}
          <b className={comparison.overallDiff > 0 ? 'compare-up' : comparison.overallDiff < 0 ? 'compare-down' : 'compare-same'}>
            （{formatDiff(comparison.overallDiff)}）
          </b>
        </span>
        <span>
          岗位适配度：{comparison.before.jobFitPercentage}% → {comparison.after.jobFitPercentage}%
          <b className={comparison.jobFitDiff > 0 ? 'compare-up' : comparison.jobFitDiff < 0 ? 'compare-down' : 'compare-same'}>
            （{formatDiff(comparison.jobFitDiff)}）
          </b>
        </span>
      </div>

      <div className="compare-dim-table-wrap">
        <table className="compare-dim-table">
          <thead>
            <tr>
              <th>能力维度</th>
              <th>前次</th>
              <th>本次</th>
              <th>变化</th>
              <th>趋势</th>
            </tr>
          </thead>
          <tbody>
            {comparison.dimensions.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{d.beforeScore}</td>
                <td>{d.afterScore}</td>
                <td className={d.trend === 'up' ? 'compare-up' : d.trend === 'down' ? 'compare-down' : 'compare-same'}>
                  {formatDiff(d.diff)}
                </td>
                <td>
                  <span className={`compare-trend compare-trend-${d.trend}`}>
                    {TREND_LABEL[d.trend]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
