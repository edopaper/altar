import { QualityProvider } from './QualityContext.jsx'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="viewer-missing" role="status">Cargando altar…</div>}>
      <QualityProvider><App /></QualityProvider>
    </React.Suspense>
  </React.StrictMode>,
)
