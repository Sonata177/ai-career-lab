import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link } from 'react-router-dom'
import './Features.css'

const features = [
  {
    icon: '🔍',
    title: '岗位职责拆解',
    desc: '将岗位描述拆分为日常任务、协作对象、核心产出，还原真实工作内容。',
  },
  {
    icon: '📊',
    title: '能力要求提炼',
    desc: '从 JD 中提炼岗位真正看重的能力维度，如沟通力、执行力、数据敏感度。',
  },
  {
    icon: '👥',
    title: '适配人群分析',
    desc: '根据岗位节奏与工作方式，给出适合与不适合的人群特征画像。',
  },
  {
    icon: '⚠️',
    title: '风险提示与纠偏',
    desc: '对职责边界模糊、内容复合等情况进行提示，帮助理性判断岗位。',
  },
]

export function Features() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  return (
    <section className="features-section" id="features" ref={ref}>
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-tag blue">模块一</span>
          <h2>岗位真相镜</h2>
          <p>不再只是"看一段JD"，而是真正理解岗位在做什么</p>
        </motion.div>
        <div className="features-grid">
          {features.map((f, i) => (
            <motion.div
              key={i}
              className="feature-card"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="features-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Link to="/mirror" className="btn btn-primary">
            开始分析岗位
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
