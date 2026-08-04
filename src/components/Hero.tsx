import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import './Hero.css'

export function Hero() {
  return (
    <section className="hero-section" id="hero">
      <div className="hero-bg" />
      <div className="container hero-content">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="hero-text"
        >
          <span className="hero-badge">智联招聘 AI 创新大赛</span>
          <h1>
            在投递前，
            <br />
            <span className="gradient-text">先试试这份工作</span>
          </h1>
          <p className="hero-description">
            AI职场体验舱 — 通过沉浸式岗位模拟与智能评估，
            帮助大学生在低成本环境中提前感知真实工作场景，
            找到真正适合自己的职业方向。
          </p>
          <div className="hero-actions">
            <Link to="/select" className="btn btn-primary">
              开始岗位体验
            </Link>
            <Link to="/mirror" className="btn btn-primary">
              开始分析岗位
            </Link>
            <a href="#features" className="btn btn-secondary">
              了解更多
            </a>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="hero-visual"
        >
          <div className="hero-card">
            <div className="card-header">
              <div className="dot red" />
              <div className="dot yellow" />
              <div className="dot green" />
            </div>
            <div className="card-body">
              <div className="chat-msg system">
                你好！欢迎来到「运营实习生的一天」体验。
              </div>
              <div className="chat-msg system">
                现在是上午9:00，你刚到工位，主管发来消息...
              </div>
              <div className="chat-msg user">
                好的，我准备好了！
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
