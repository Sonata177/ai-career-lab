import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import './Growth.css'

const suggestions = [
  {
    type: 'strength',
    title: '表现亮点',
    items: [
      '沟通表达有条理，能清晰传达核心观点',
      '面对突发任务时反应迅速，优先级判断合理',
      '对用户情绪有较好的感知和回应能力',
    ],
  },
  {
    type: 'improve',
    title: '提升方向',
    items: [
      '数据分析时缺少具体数据支撑，建议加强量化思维',
      '汇报结构可更精炼，建议练习"结论先行"表达',
      '跨部门协作中可更主动提出方案而非等待指示',
    ],
  },
  {
    type: 'action',
    title: '行动建议',
    items: [
      '推荐体验：产品运营助理、用户增长实习生',
      '建议补充：数据分析基础课程（SQL + Excel）',
      '面试准备：STAR法则练习 + 运营案例积累',
    ],
  },
]

export function Growth() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  return (
    <section className="growth-section" id="growth" ref={ref}>
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="section-tag orange">模块四</span>
          <h2>复盘与成长建议</h2>
          <p>不只是一个分数，而是可行动的成长反馈</p>
        </motion.div>
        <div className="growth-grid">
          {suggestions.map((s, i) => (
            <motion.div
              key={i}
              className={`growth-card ${s.type}`}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <h3>{s.title}</h3>
              <ul>
                {s.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
