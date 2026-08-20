import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './Navbar.css'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-container">
        <a href="#" className="nav-logo">
          <span className="logo-icon">AI</span>
          <span className="logo-text">职场体验舱</span>
        </a>
        <button
          className={`nav-hamburger ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
        <ul className={`nav-links ${menuOpen ? 'show' : ''}`}>
          <li><a href="#features" onClick={() => setMenuOpen(false)}>岗位真相镜</a></li>
          <li><a href="#experience" onClick={() => setMenuOpen(false)}>沉浸体验</a></li>
          <li><a href="#assessment" onClick={() => setMenuOpen(false)}>能力评估</a></li>
          <li><a href="#growth" onClick={() => setMenuOpen(false)}>成长建议</a></li>
          <li><Link to="/history" onClick={() => setMenuOpen(false)}>历史记录</Link></li>
        </ul>
      </div>
    </nav>
  )
}
