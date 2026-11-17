import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../services/supabase'
import { canAccessPath, getDefaultPath } from '../services/rbac'
import { clearAuth, loadAccess } from '../store/slices/authSlice'

const PUBLIC_PATHS = ['/', '/admin/create', '/forgot-password', '/reset-password']

/**
 * Single authentication + authorisation gate for the whole SPA.
 *
 * - Public routes render immediately.
 * - Protected routes perform stateless validation on navigation by resolving the
 *   current Supabase session/user and server/profile role each time.
 * - Auth state changes (sign-out/session expiry/switch) clear cached access to
 *   prevent cross-session or stale-role contamination.
 */
function AuthBoundary({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const [checking, setChecking] = useState(!PUBLIC_PATHS.includes(location.pathname))

  useEffect(() => {
    if (PUBLIC_PATHS.includes(location.pathname)) {
      setChecking(false)
      return undefined
    }

    let active = true
    setChecking(true)

    dispatch(loadAccess())
      .unwrap()
      .then((payload) => {
        if (!active) return

        if (payload.error || !payload.user || !payload.access?.role) {
          dispatch(clearAuth())
          navigate('/', { replace: true })
          return
        }

        if (payload.access.conflict) {
          console.warn('[rbac] role conflict detected:', payload.access.reason)
        }

        if (!canAccessPath(payload.access, location.pathname)) {
          navigate(getDefaultPath(payload.access), { replace: true })
          return
        }

        setChecking(false)
      })
      .catch((error) => {
        console.error('[rbac] access check failed:', error)
        if (!active) return
        dispatch(clearAuth())
        navigate('/', { replace: true })
      })

    return () => {
      active = false
    }
  }, [dispatch, location.pathname, navigate])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !PUBLIC_PATHS.includes(location.pathname)) {
        dispatch(clearAuth())
        navigate('/', { replace: true })
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [dispatch, location.pathname, navigate])

  if (checking) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        {t('checkingLogin', 'Checking login...')}
      </div>
    )
  }

  return children
}

export default AuthBoundary
