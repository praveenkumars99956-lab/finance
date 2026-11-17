import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
} from 'react'
import PropTypes from 'prop-types'
import { useTranslation } from 'react-i18next'
import { subscribeNotify } from '../utils/notify'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).slice(2)
    const toast = { id, message, type, duration }

    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration)
    }
  }, [dismissToast])

  useEffect(
    () => subscribeNotify(({ message, type, duration }) => {
      showToast(message, type, duration)
    }),
    [showToast]
  )

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

function ToastContainer({ toasts, onDismiss }) {
  const { t } = useTranslation()

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label={t('notifications')}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

ToastContainer.propTypes = {
  toasts: PropTypes.array.isRequired,
  onDismiss: PropTypes.func.isRequired
}

function ToastItem({ toast, onDismiss }) {
  const { t } = useTranslation()
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }

  const handleClick = () => onDismiss(toast.id)

  return (
    <div
      className={`toast toast--${toast.type}`}
      onClick={handleClick}
      role="alert"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onDismiss(toast.id)}
    >
      <span className="toast-icon" aria-hidden="true">{icons[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }} aria-label={t('dismiss')}>
        ✕
      </button>
    </div>
  )
}

ToastItem.propTypes = {
  toast: PropTypes.shape({
    id: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['success', 'error', 'warning', 'info']).isRequired
  }).isRequired,
  onDismiss: PropTypes.func.isRequired
}
