import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchExperienceDetail, ExperienceApiError, type ExperienceDetail,
} from '../services/experience'
import './HistoryDetailPage.css'

type DetailState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: ExperienceDetail }

export function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // 用 URL 里的 id 调 GET /api/experiences/:id（以云端为准，不读本地 store）
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  // 重试触发：+1 使 effect 重新拉取
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!id) return // /history/:id 路由保证有 id；防御性短路
    let cancelled = false
    fetchExperienceDetail(id).then(
      (detail) => {
        if (!cancelled) setState({ status: 'ready', detail })
      },
      (err: unknown) => {
        if (cancelled) return
        if (err instanceof ExperienceApiError && err.status === 404) {
          setState({ status: 'notFound' })
        } else {
          setState({ status: 'error', message: '加载报告失败，请稍后重试' })
        }
      }
    )
    return () => { cancelled = true }
  }, [id, reloadTick])

  const retry = () => {
    setState({ status: 'loading' })
    setReloadTick((t) => t + 1)
  }

  // 404 或缺少 id：显示提示与返回入口，不展示空白页
  if (state.status === 'notFound') {
    return (
      <div className="history-detail-page">
        <div className="history-detail-missing">
          <div className="history-detail-missing-icon">🔍</div>
          <h1>报告不存在</h1>
          <p>该评估记录可能已被删除或链接已失效。</p>
          <button className="btn btn-primary" onClick={() => navigate('/history')}>
            返回历史记录
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="history-detail-page">
        <div className="history-detail-loading">正在加载报告…</div>
        <button className="btn history-back-btn" onClick={() => navigate('/history')}>
          ← 返回历史记录
        </button>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="history-detail-page">
        <div className="history-detail-missing">
          <div className="history-detail-missing-icon">⚠️</div>
          <h1>报告加载失败</h1>
          <p>{state.message}</p>
          <div className="history-detail-error-actions">
            <button className="btn btn-primary" onClick={retry}>
              重试
            </button>
            <button className="btn" onClick={() => navigate('/history')}>
              返回历史记录
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { detail } = state
  const result = detail.result

  return (
    <div className="history-detail-page">
      <div className="history-detail-header">
        <button className="btn history-back-btn" onClick={() => navigate('/history')}>
          ← 返回历史记录
        </button>
        <h1>{detail.jobTitle}</h1>
        <p className="history-detail-date">
          完成时间：{new Date(detail.completedAt).toLocaleString('zh-CN')}
        </p>
      </div>

      <div className="history-detail-scores">
        <div className="history-score">
          <span className="history-score-value">{detail.overallScore}</span>
          <span className="history-score-label">综合评分</span>
        </div>
        <div className="history-score">
          <span className="history-score-value">{detail.jobFitPercentage}%</span>
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
