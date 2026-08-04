import { useState, useEffect } from 'react'
import './PageNavigator.css'

const SECTIONS = ['hero', 'features', 'experience', 'assessment', 'growth']

export function PageNavigator() {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY + window.innerHeight / 2
      let active = 0
      for (let i = 0; i < SECTIONS.length; i++) {
        const el = document.getElementById(SECTIONS[i])
        if (el && el.offsetTop <= scrollY) {
          active = i
        }
      }
      setCurrentIndex(active)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollTo = (index: number) => {
    const el = document.getElementById(SECTIONS[index])
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  const isFirst = currentIndex === 0
  const isLast = currentIndex === SECTIONS.length - 1

  return (
    <div className="page-navigator">
      {isLast && (
        <button
          className="nav-jump-btn top-btn"
          onClick={() => scrollTo(0)}
        >
          TOP
        </button>
      )}
      {!isFirst && (
        <button
          className="nav-arrow nav-arrow-up"
          onClick={() => scrollTo(currentIndex - 1)}
          aria-label="上一模块"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
      {!isLast && (
        <button
          className="nav-arrow nav-arrow-down"
          onClick={() => scrollTo(currentIndex + 1)}
          aria-label="下一模块"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
      {isFirst && (
        <button
          className="nav-jump-btn bottom-btn"
          onClick={() => scrollTo(SECTIONS.length - 1)}
        >
          END
        </button>
      )}
    </div>
  )
}
