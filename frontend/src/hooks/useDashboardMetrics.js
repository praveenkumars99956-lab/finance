import { useEffect, useState } from 'react'
import {
  getDashboardMetricsSnapshot,
  refreshDashboardMetrics,
  subscribeDashboardMetrics
} from '../services/dashboardMetrics'

/**
 * Dashboard counts are shared by the admin dashboard and navbar. Mounting a
 * consumer always requests a fresh read, then keeps the value current through
 * realtime, focus/visibility changes and a slow polling fallback.
 */
export function useDashboardMetrics({ enabled = true } = {}) {
  const [metrics, setMetrics] = useState(getDashboardMetricsSnapshot)

  useEffect(() => {
    if (!enabled) {
      setMetrics(null)
      return undefined
    }

    setMetrics(getDashboardMetricsSnapshot())
    refreshDashboardMetrics()

    return subscribeDashboardMetrics(setMetrics)
  }, [enabled])

  return metrics
}
