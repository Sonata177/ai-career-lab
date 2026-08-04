import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LandingPage } from './routes/LandingPage'
import { JobSelectionPage } from './routes/JobSelectionPage'
import { JobMirrorPage } from './routes/JobMirrorPage'
import { ChatPage } from './routes/ChatPage'
import { ResultsPage } from './routes/ResultsPage'
import { DayCompletePage } from './routes/DayCompletePage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/select" element={<JobSelectionPage />} />
          <Route path="/mirror" element={<JobMirrorPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/day-complete" element={<DayCompletePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
