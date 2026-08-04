import './Footer.css'

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-brand">
          <span className="logo-icon">AI</span>
          <span className="footer-title">职场体验舱</span>
        </div>
        <p className="footer-desc">
          智联招聘首届全国AI创新大赛参赛作品
        </p>
        <div className="footer-links">
          <a href="#features">岗位真相镜</a>
          <a href="#experience">沉浸体验</a>
          <a href="#assessment">能力评估</a>
          <a href="#growth">成长建议</a>
        </div>
        <p className="footer-copy">
          &copy; 2026 AI职场体验舱. All rights reserved.
        </p>
        <p className="footer-beian">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
            桂ICP备2026010520号-1
          </a>
        </p>
      </div>
    </footer>
  )
}
