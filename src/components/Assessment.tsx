import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import './Assessment.css'

const dimensions = [
  { name: '沟通表达', score: 85, color: '#3b82f6' },
  { name: '问题拆解', score: 72, color: '#7c3aed' },
  { name: '执行落地', score: 90, color: '#0d9488' },
  { name: '用户同理心', score: 78, color: '#ea580c' },
  { name: '数据敏感度', score: 65, color: '#eab308' },
  { name: '优先级判断', score: 80, color: '#ec4899' },
]

export function Assessment() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  return (
    <section className="assessment-section" id="assessment" ref={ref}>
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-tag teal">模块三</span>
          <h2>AI 行为评估引擎</h2>
          <p>基于任务表现的多维能力画像，而非自我陈述</p>
        </motion.div>
        <motion.div
          className="assessment-card"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="assessment-header">
            <h3>能力评估报告</h3>
            <span className="match-badge">岗位适配度 82%</span>
          </div>
          <div className="dimensions-list">
            {dimensions.map((d, i) => (
              <div key={i} className="dimension-item">
                <div className="dimension-label">
                  <span>{d.name}</span>
                  <span className="dimension-score">{d.score}</span>
                </div>
                <div className="dimension-bar">
                  <motion.div
                    className="dimension-fill"
                    style={{ background: d.color }}
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${d.score}%` } : {}}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
