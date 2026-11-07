import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// PWA: register the service worker only when served over http(s), not Electron's file://.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    // Relative so it resolves against the page URL (works at any host subpath).
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline install is best-effort; the app still works without it */
    })
  })
}
