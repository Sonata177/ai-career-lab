import type { JobRole } from '../types/job'

export const JOB_CATEGORIES = [
  { id: 'internet', label: '互联网', icon: '💻' },
  { id: 'sales', label: '销售', icon: '💼' },
  { id: 'finance', label: '金融', icon: '📈' },
  { id: 'media', label: '传媒', icon: '🎬' },
]

export const jobs: JobRole[] = [
  {
    id: 'operations-intern',
    title: '运营实习生的一天',
    subtitle: '互联网公司 · 用户运营方向',
    description:
      '负责用户活动策划与执行、社群维护、数据分析与复盘，需要与产品、设计团队紧密协作。',
    icon: '📱',
    color: '#3b82f6',
    tags: ['沟通协作', '数据分析', '内容创作', '用户思维'],
    category: 'internet',
  },
  {
    id: 'product-assistant',
    title: '产品助理的一天',
    subtitle: '科技公司 · B端产品方向',
    description:
      '参与需求调研、竞品分析、PRD撰写和项目跟进，需要逻辑清晰、善于拆解问题。',
    icon: '💡',
    color: '#7c3aed',
    tags: ['逻辑思维', '需求分析', '文档能力', '项目管理'],
    category: 'internet',
  },
  {
    id: 'marketing-intern',
    title: '市场实习生的一天',
    subtitle: '消费品牌 · 品牌营销方向',
    description:
      '负责品牌内容策划、社媒运营、KOL对接和活动执行，需要创意能力和执行力。',
    icon: '🎯',
    color: '#ea580c',
    tags: ['创意策划', '内容能力', '资源对接', '执行力'],
    category: 'internet',
  },
  {
    id: 'hr-intern',
    title: 'HR实习生的一天',
    subtitle: '大型企业 · 招聘方向',
    description:
      '参与简历筛选、面试安排、候选人沟通和招聘数据统计，需要细心和良好的沟通能力。',
    icon: '🤝',
    color: '#0d9488',
    tags: ['沟通表达', '细节把控', '多任务处理', '同理心'],
    category: 'internet',
  },
  // 销售类
  {
    id: 'sales-representative',
    title: '销售代表的一天',
    subtitle: 'SaaS公司 · 企业销售方向',
    description:
      '负责客户开发、需求沟通、方案演示和商务谈判，需要抗压能力和目标导向思维。',
    icon: '💼',
    color: '#f59e0b',
    tags: ['客户沟通', '商务谈判', '目标导向', '抗压能力'],
    category: 'sales',
  },
  {
    id: 'sales-assistant',
    title: '销售助理的一天',
    subtitle: '贸易公司 · 销售支持方向',
    description:
      '协助销售团队处理订单、跟进客户、整理报价和维护CRM系统，需要细心和服务意识。',
    icon: '📋',
    color: '#84cc16',
    tags: ['订单管理', '客户跟进', '数据整理', '服务意识'],
    category: 'sales',
  },
  // 金融类
  {
    id: 'finance-analyst',
    title: '金融分析师的一天',
    subtitle: '证券公司 · 行业研究方向',
    description:
      '负责行业数据收集、财务模型搭建、研究报告撰写，需要扎实的分析能力和逻辑思维。',
    icon: '📈',
    color: '#06b6d4',
    tags: ['数据分析', '财务建模', '报告撰写', '逻辑思维'],
    category: 'finance',
  },
  {
    id: 'risk-control',
    title: '风控专员的一天',
    subtitle: '银行 · 信贷风控方向',
    description:
      '参与贷前审核、风险评估、数据监控和异常预警，需要严谨细致和风险意识。',
    icon: '🛡️',
    color: '#8b5cf6',
    tags: ['风险评估', '数据监控', '合规意识', '严谨细致'],
    category: 'finance',
  },
  // 传媒类
  {
    id: 'content-editor',
    title: '内容编辑的一天',
    subtitle: '新媒体公司 · 内容运营方向',
    description:
      '负责选题策划、内容撰写、排版发布和数据复盘，需要文字功底和热点敏感度。',
    icon: '✍️',
    color: '#ec4899',
    tags: ['内容创作', '选题策划', '热点敏感', '数据复盘'],
    category: 'media',
  },
  {
    id: 'video-planner',
    title: '短视频策划的一天',
    subtitle: 'MCN机构 · 短视频方向',
    description:
      '负责短视频选题、脚本撰写、拍摄协调和效果分析，需要创意能力和网感。',
    icon: '🎬',
    color: '#f43f5e',
    tags: ['创意策划', '脚本撰写', '网感', '数据分析'],
    category: 'media',
  },
]
