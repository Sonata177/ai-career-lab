import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchExperienceList, ExperienceApiError, type ExperienceListItem,
} from '../services/experience'
import './HistoryPage.css'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ExperienceListItem[] }

export function HistoryPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // 对比选择：最多两条
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // 重试触发：+1 使 effect 重新拉取
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchExperienceList().then(
      (items) => {
        if (!cancelled) setState({ status: 'ready', items })
      },
      (err: unknown) => {
        if (cancelled) return
        // 503：后端未配置数据库；其余网络/服务错误
        const message = err instanceof ExperienceApiError && err.status === 503
          ? '历史服务未配置数据库，暂时无法读取云端记录'
          : '加载历史记录失败，请稍后重试'
        setState({ status: 'error', message })
      }
    )
    return () => { cancelled = true }
  }, [reloadTick])

  const retry = () => {
    setState({ status: 'loading' })
    setReloadTick((t) => t + 1)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev // 最多选择两条
      return [...prev, id]
    })
  }

  const handleCompare = () => {
    if (selectedIds.length !== 2) return
    navigate(`/history/compare?ids=${encodeURIComponent(selectedIds.join(','))}`)
  }

  if (state.status === 'loading') {
    return (
      <div className="history-page">
        <div className="history-header">
          <h1>评估历史</h1>
          <p>查看你过往的岗位体验评估报告</p>
        </div>
        <div className="history-loading">正在加载历史记录…</div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="history-page">
        <div className="history-header">
          <h1>评估历史</h1>
          <p>查看你过往的岗位体验评估报告</p>
        </div>
        <div className="history-error">
          <div className="history-empty-icon">⚠️</div>
          <p className="history-empty-title">历史记录加载失败</p>
          <p className="history-empty-sub">{state.message}</p>
          <button className="btn btn-primary" onClick={retry}>
            重试
          </button>
        </div>
      </div>
    )
  }

  const records = state.items

  return (
    <div className="history-page">
      <div className="history-header">
        <h1>评估历史</h1>
        <p>
          {records.length > 0
            ? `共 ${records.length} 条评估记录`
            : '查看你过往的岗位体验评估报告'}
        </p>
      </div>

      {records.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon">📊</div>
          <p className="history-empty-title">还没有评估记录</p>
          <p className="history-empty-sub">
            完成一次岗位体验并生成评估报告后，记录会出现在这里
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/select')}>
            开始岗位体验
          </button>
        </div>
      ) : (
        <>
          <div className="history-list">
            {records.map((record) => (
              <div key={record.id} className="history-card">
                <input
                  type="checkbox"
                  className="history-checkbox"
                  checked={selectedIds.includes(record.id)}
                  disabled={!selectedIds.includes(record.id) && selectedIds.length >= 2}
                  onChange={() => toggleSelect(record.id)}
                  aria-label={`选择 ${record.jobTitle}`}
                />
                <div className="history-card-info">
                  <h3 className="history-card-title">{record.jobTitle}</h3>
                  <span className="history-card-date">
                    {new Date(record.completedAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="history-card-scores">
                  <div className="history-score">
                    <span className="history-score-value">{record.overallScore}</span>
                    <span className="history-score-label">综合评分</span>
                  </div>
                  <div className="history-score">
                    <span className="history-score-value">{record.jobFitPercentage}%</span>
                    <span className="history-score-label">岗位适配度</span>
                  </div>
                </div>
                <button
                  className="btn history-view-btn"
                  onClick={() => navigate(`/history/${record.id}`)}
                >
                  查看报告
                </button>
              </div>
            ))}
          </div>
          <div className="history-actions">
            <button
              className="btn history-compare-btn"
              onClick={handleCompare}
              disabled={selectedIds.length !== 2}
            >
              对比报告
            </button>
            {/* 第一期不做删除接口：禁用"清空历史"，避免用户误以为本地/云端被删 */}
            <button
              className="btn history-clear-btn"
              disabled
              title="清空功能即将上线"
            >
              清空历史
            </button>
            <p className="history-clear-note">
              云端记录仍保留（当前版本暂不支持删除，即将上线）
            </p>
          </div>
        </>
      )}
    </div>
  )
}
