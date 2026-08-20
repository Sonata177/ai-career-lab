import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistoryStore } from '../store/historyStore'
import './HistoryPage.css'

export function HistoryPage() {
  const navigate = useNavigate()
  const records = useHistoryStore((s) => s.records)
  const clear = useHistoryStore((s) => s.clear)
  const [confirmingClear, setConfirmingClear] = useState(false)
  // 对比选择：最多两条
  const [selectedIds, setSelectedIds] = useState<string[]>([])

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

  // 两步确认：第一次点击进入确认态，确认后真正清空
  const handleClearClick = () => {
    if (confirmingClear) {
      clear()
      setConfirmingClear(false)
      setSelectedIds([]) // 清空历史后，选择状态自动清除
    } else {
      setConfirmingClear(true)
    }
  }

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
            {confirmingClear ? (
              <div className="history-confirm">
                <span className="history-confirm-text">
                  确定清空全部历史记录？此操作不可恢复。
                </span>
                <button className="btn history-confirm-yes" onClick={handleClearClick}>
                  确认清空
                </button>
                <button className="btn history-confirm-no" onClick={() => setConfirmingClear(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button className="btn history-clear-btn" onClick={handleClearClick}>
                清空历史
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
