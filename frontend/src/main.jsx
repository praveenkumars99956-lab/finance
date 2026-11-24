import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { ToastProvider } from './components/Toast'
import store from './store'
import { startSessionBridge } from './services/jwtSession'
import { startBackgroundSync } from './services/offlineSync'
import { registerServiceWorker, requestBackgroundSync } from './services/serviceWorker'
import './index.css'
import './styles/modern-theme.css'
import './styles/stitch-theme.css'
import './styles/finance-theme.css'
import './styles/palette-buttons.css'
import './styles/offline-voice.css'
import './styles/select-menu.css'
import './styles/motion.css'

import { initI18n } from './i18n/i18n'

startSessionBridge()
const stopBackgroundSync = startBackgroundSync()
registerServiceWorker().then(() => requestBackgroundSync())

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopBackgroundSync()
  })
}

async function bootstrap() {
  await initI18n()

  ReactDOM.createRoot(
    document.getElementById('root')
  ).render(
    <React.StrictMode>
      <Provider store={store}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Provider>
    </React.StrictMode>
  )
}

bootstrap()
