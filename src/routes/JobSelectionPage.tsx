import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { jobs, JOB_CATEGORIES } from '../data/jobs'
import { getScenario } from '../data/scenarios'
import { useJobStore } from '../store/jobStore'
import { useChatStore } from '../store/chatStore'
import './JobSelectionPage.css'

export function JobSelectionPage() {
  const navigate = useNavigate()
  const setSelectedJob = useJobStore((s) => s.setSelectedJob)
  const setCurrentDay = useChatStore((s) => s.setCurrentDay)
  const [activeCategory, setActiveCategory] = useState('internet')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredJobs = searchText.trim()
    ? jobs.filter((j) =>
        j.title.includes(searchText) ||
        j.subtitle.includes(searchText) ||
        j.tags.some((t) => t.includes(searchText))
      )
    : jobs.filter((j) => j.category === activeCategory)

  const handleSelect = (job: typeof jobs[0]) => {
    // 无内置场景的岗位：不能进入空聊天，跳转岗位真相镜粘贴 JD 生成专属体验
    if (!getScenario(job.id)) {
      navigate('/mirror', {
        state: { fromJobSelection: true, jobTitle: job.title },
      })
      return
    }
    setCurrentDay(1)
    // 清除上一岗位的会话进度（消息/时间轴/阶段），避免新岗位复用旧会话
    useChatStore.getState().reset()
    setSelectedJob(job)
    navigate('/chat')
  }

  const handleSearchClick = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 100)
  }

  return (
    <div className="job-selection-page">
      <div className="top-actions">
        <div
          className={`search-box ${searchOpen ? 'open' : ''}`}
          onMouseEnter={() => { if (!searchOpen) setSearchOpen(true) }}
          onMouseLeave={() => { if (!searchText.trim()) setSearchOpen(false) }}
        >
          <span className="search-icon" onClick={handleSearchClick}>🔍</span>
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="输入你想要体验的岗位"
            onBlur={() => { if (!searchText.trim()) setSearchOpen(false) }}
          />
        </div>
        <button
          className="close-btn jd-hint-btn"
          onClick={() => navigate('/mirror', { state: { fromJobSelection: true } })}
          title="没找到想要体验的岗位？"
        >
          <span className="close-icon jd-hint-icon">?</span>
          <span className="close-text jd-hint-text">没找到想要体验的岗位？把JD发给我！直接带你体验！</span>
        </button>
        <button
          className="close-btn"
          onClick={() => navigate('/mirror')}
          title="跳转到岗位真相镜"
        >
          <span className="close-icon">⬅</span>
          <span className="close-text">岗位真相镜</span>
        </button>
        <button
          className="close-btn"
          onClick={() => navigate('/')}
          title="返回首页"
        >
          <span className="close-icon">✕</span>
          <span className="close-text">返回首页</span>
        </button>
      </div>
      <aside className="category-sidebar">
        <div className="sidebar-title">岗位分类</div>
        {JOB_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span className="category-icon">{cat.icon}</span>
            <span className="category-label">{cat.label}</span>
          </button>
        ))}
      </aside>
      <div className="selection-main">
        <motion.div
          className="selection-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1>选择你想体验的岗位</h1>
          <p>每个岗位都是一段沉浸式的工作日模拟，完成后你将获得专属能力评估报告</p>
        </motion.div>
        <div className="job-grid">
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job, i) => (
              <motion.div
                key={job.id}
                className="job-card"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                onClick={() => handleSelect(job)}
                style={{ '--accent': job.color } as React.CSSProperties}
              >
                <span className="job-icon">{job.icon}</span>
                <h3>{job.title}</h3>
                <p className="job-subtitle">{job.subtitle}</p>
                <p className="job-desc">{job.description}</p>
                <div className="job-tags">
                  {job.tags.map((tag) => (
                    <span key={tag} className="job-tag">{tag}</span>
                  ))}
                </div>
                {getScenario(job.id) ? (
                  <button className="job-start-btn">开始体验</button>
                ) : (
                  <button className="job-start-btn jd-start-btn">
                    用 JD 生成体验
                  </button>
                )}
              </motion.div>
            ))
          ) : (
            <div className="empty-jobs">
              没有找到相关岗位，试试搜索其他关键词，或使用岗位真相镜。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
