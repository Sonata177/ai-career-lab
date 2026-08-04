import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link } from 'react-router-dom'
import './Experience.css'

const steps = [
  {
    time: '09:00',
    title: '晨会任务',
    desc: '主管分配工作任务，你需要理解要求并确认执行方向。',
  },
  {
    time: '14:00',
    title: '用户沟通',
    desc: '处理用户投诉或反馈，需要同理心和解决问题的能力。',
  },
  {
    time: '17:00',
    title: '今日汇报',
    desc: '向主管汇报今天的工作完成情况和遇到的问题。',
  },
]

export function Experience() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  return (
    <section className="experience-section" id="experience" ref={ref}>
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-tag purple">模块二</span>
          <h2>沉浸式岗位体验</h2>
          <p>像真正的实习生一样，完成一天的工作任务</p>
        </motion.div>
        <div className="timeline">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="timeline-item"
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <div className="timeline-time">{step.time}</div>
              <div className="timeline-dot" />
              <div className="timeline-content">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="experience-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Link to="/select" className="btn btn-primary">开始岗位体验</Link>
        </motion.div>
      </div>
    </section>
  )
}
