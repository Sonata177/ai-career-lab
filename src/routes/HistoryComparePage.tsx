import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchExperienceDetail, ExperienceApiError,
} from '../services/experience'
import {
  compareAssessments,
  type AssessmentComparison,
  type DimensionTrend,
} from '../utils/assessmentComparison'
import './HistoryComparePage.css'

const TREND_LABEL: Record<DimensionTrend, string> = {
  up: '提升',
  down: '下降',
  same: '不变',
}

function formatDiff(diff: number) {
  return diff > 0 ? `+${diff}` : `${diff}`
}

type CompareState =
  | { status: 'loading' }
  | { status: 'notFound'; idsKey: string }
  | { status: 'error'; idsKey: string }
  | { status: 'ready'; idsKey: string; comparison: AssessmentComparison }

export function HistoryComparePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rawIds = searchParams.get('ids') ?? ''
  // 去重：ids=r1,r1 时不能把同一条报告当作两条对比
  const uniqueIds = useMemo(() => [...new Set(rawIds.split(',').filter(Boolean))], [rawIds])
  const idsKey = uniqueIds.join(',')
  const [state, setState] = useState<CompareState>({ status: 'loading' })
  // 重试触发：+1 使 effect 重新拉取
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (uniqueIds.length !== 2) return // 不足两条：渲染层走「无法对比」
    let cancelled = false
    Promise.all(uniqueIds.map((id) => fetchExperienceDetail(id))).then(
      ([a, b]) => {
        if (cancelled) return
        // compareAssessments 内部按 completedAt 排序：较早为 before，较晚为 after
        setState({
          status: 'ready',
          idsKey,
          comparison: compareAssessments(a, b),
        })
      },
      (err: unknown) => {
        if (cancelled) return
        if (err instanceof ExperienceApiError && err.status === 404) {
          setState({ status: 'notFound', idsKey })
        } else {
          setState({ status: 'error', idsKey })
        }
      }
    )
    return () => { cancelled = true }
  }, [uniqueIds, idsKey, reloadTick])

  const retry = () => {
    setState({ status: 'loading' })
    setReloadTick((t) => t + 1)
  }

  const missingView = (title: string, desc: string) => (
    <div className="history-compare-page">
      <div className="history-compare-missing">
        <div className="history-compare-missing-icon">📊</div>
        <h1>{title}</h1>
        <p>{desc}</p>
        <button className="btn btn-primary" onClick={() => navigate('/history')}>
          返回历史记录
        </button>
      </div>
    </div>
  )

  // 参数缺失、ID 重复或记录不足两条：显示提示，不展示空白页
  if (uniqueIds.length !== 2) {
    return missingView('无法对比', '需要选择两条不同的评估记录才能对比。')
  }

  const showNotFound = state.status === 'notFound' && state.idsKey === idsKey
  const showError = state.status === 'error' && state.idsKey === idsKey
  const showReady = state.status === 'ready' && state.idsKey === idsKey

  // 有一条 404：记录可能已被删除，走「无法对比」
  if (showNotFound) {
    return missingView('无法对比', '所选报告未找到，可能已被删除或链接已失效。')
  }

  if (showError) {
    return (
      <div className="history-compare-page">
        <div className="history-compare-missing">
          <div className="history-compare-missing-icon">⚠️</div>
          <h1>对比加载失败</h1>
          <p>报告加载失败，请稍后重试。</p>
          <div className="history-compare-error-actions">
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

  // 初始 / 参数切换 / 重试中：加载提示
  if (!showReady) {
    return (
      <div className="history-compare-page">
        <button className="btn history-back-btn" onClick={() => navigate('/history')}>
          ← 返回历史记录
        </button>
        <div className="history-compare-loading">正在加载对比数据…</div>
      </div>
    )
  }

  const { comparison } = state

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
