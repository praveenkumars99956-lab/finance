import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

const PAGE_SIZE = 1000

const loanStructures = [
  {
    type: 'daily',
    titleKey: 'dailyLoan',
    descriptionKey: 'manageDailyCollectionsPaymentsBalances',
    cycleKey: 'dailyRepaymentCycle',
    path: '/daily',
    icon: 'calendar_today',
    badge: 'Daily Liquidity'
  },
  {
    type: 'weekly',
    titleKey: 'weeklyLoan',
    descriptionKey: 'manageWeeklyCustomerCollectionsBalances',
    cycleKey: 'weeklyRepaymentCycle',
    path: '/weekly',
    icon: 'date_range',
    badge: 'Weekly Syndications'
  },
  {
    type: 'monthly',
    titleKey: 'monthlyLoan',
    descriptionKey: 'manageMonthlyCustomerCollectionsBalances',
    cycleKey: 'monthlyRepaymentCycle',
    path: '/monthly',
    icon: 'calendar_month',
    badge: 'Monthly Notes'
  },
  {
    type: 'interest_only',
    titleKey: 'interestOnlyLoan',
    descriptionKey: 'calculateLoansPrincipalPercentageInterest',
    cycleKey: 'interestOnlyCycle',
    path: '/interest-only',
    icon: 'percent',
    badge: 'Prime Interest-Only'
  }
]

function normalizeFinanceType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function getPrincipal(record) {
  return Number(
    record.original_principal ??
    record.principal_amount ??
    record.amount ??
    0
  ) || 0
}

function getPaid(record) {
  return Number(record.paid ?? 0) || 0
}

function getOutstanding(record) {
  return Number(record.pending ?? 0) || 0
}

function csvText(value) {
  const text = String(value ?? '')
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function LoanTypes() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadPortfolio = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const allRows = []
      let from = 0

      while (true) {
        const to = from + PAGE_SIZE - 1
        const { data, error } = await supabase
          .from('finance_records')
          .select('id, finance_type, amount, paid, pending, original_principal, principal_amount, loan_status')
          .order('id', { ascending: true })
          .range(from, to)

        if (error) {
          throw error
        }

        if (data && data.length > 0) {
          allRows.push(...data)
        }

        if (!data || data.length < PAGE_SIZE) {
          break
        }

        from += PAGE_SIZE
      }

      setRecords(allRows)
    } catch (err) {
      console.error('Failed to load portfolio ledger:', err)
      setLoadError(t('loanPortfolioLoadFailed', 'Unable to load loan records. Please try again.'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadPortfolio()
  }, [loadPortfolio])

  const summaries = useMemo(() => {
    const byType = Object.fromEntries(
      loanStructures.map(({ type }) => [type, {
        accounts: 0,
        active: 0,
        principal: 0,
        outstanding: 0
      }])
    )

    const total = {
      accounts: records.length,
      active: 0,
      principal: 0,
      outstanding: 0
    }

    records.forEach((record) => {
      const type = normalizeFinanceType(record.finance_type)
      const principal = getPrincipal(record)
      const outstanding = getOutstanding(record)
      const isActive =
        outstanding > 0 &&
        String(record.loan_status || '').toLowerCase() !== 'closed'

      total.active += Number(isActive)
      total.principal += principal
      total.outstanding += outstanding

      if (byType[type]) {
        byType[type].accounts += 1
        byType[type].active += Number(isActive)
        byType[type].principal += principal
        byType[type].outstanding += outstanding
      }
    })

    return { byType, total }
  }, [records])

  const formatCurrency = useCallback((value) => (
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language || 'en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value)
  ), [i18n.language, i18n.resolvedLanguage])

  const exportLedger = () => {
    if (!records.length) {
      return
    }

    const rows = [
      [
        t('financeId', 'Finance ID'),
        t('loanType', 'Loan Type'),
        t('totalPrincipal', 'Total Principal'),
        t('totalPaid', 'Total Paid'),
        t('outstandingBalance', 'Outstanding Balance'),
        t('status', 'Status')
      ],
      ...records.map((record) => {
        const structure = loanStructures.find(
          ({ type }) => type === normalizeFinanceType(record.finance_type)
        )

        return [
          csvText(record.id),
          csvText(structure ? t(structure.titleKey) : record.finance_type || ''),
          getPrincipal(record),
          getPaid(record),
          getOutstanding(record),
          csvText(record.loan_status || '')
        ]
      })
    ]

    const csv = rows.map((row) => row.join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'institutional-ledger.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="min-h-screen p-6 flex flex-col gap-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-[#351078] to-[#5B2D8E] rounded-2xl p-6 text-white mb-2">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-semibold uppercase tracking-wider w-fit">
              <span className="material-symbols-outlined text-[14px]">account_balance</span>
              {t('portfolioOverview', 'Portfolio Overview')}
            </span>
            <h1 className="text-2xl font-bold text-white">
              {t('institutionalLedger', 'Institutional Ledger')}
            </h1>
            <p className="text-white/70 text-sm">
              {t('loanLedgerSubtitle', 'Portfolio overview and loan structure management.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm font-medium border border-white/20 cursor-pointer"
              onClick={() => navigate('/settings')}
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              {t('rateConfigurator', 'Rate Configurator')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors text-sm font-medium border border-white/20 cursor-pointer disabled:opacity-50"
              onClick={exportLedger}
              disabled={loading || records.length === 0}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              {t('exportLedger', 'Export Ledger')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-[#351078] hover:bg-[#EDE5FF] transition-colors text-sm font-semibold cursor-pointer"
              onClick={() => navigate('/daily', { state: { from: 'loans' } })}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {t('newTrancheFacility', 'New Finance Account')}
            </button>
          </div>
        </div>
      </div>

      {/* 4-Stat Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('totalAccounts', 'Total Accounts')}</span>
          <strong className="text-2xl font-bold text-[#1A0A3B] mt-2">
            {loading ? '—' : summaries.total.accounts.toLocaleString()}
          </strong>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('activeAccounts', 'Active Accounts')}</span>
          <strong className="text-2xl font-bold text-[#351078] mt-2">
            {loading ? '—' : summaries.total.active.toLocaleString()}
          </strong>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('totalPrincipal', 'Total Principal')}</span>
          <strong className="text-2xl font-bold text-[#1A0A3B] mt-2">
            {loading ? '—' : formatCurrency(summaries.total.principal)}
          </strong>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#7B6BA0]">{t('outstandingBalance', 'Outstanding Balance')}</span>
          <strong className="text-2xl font-bold text-[#4A3870] mt-2">
            {loading ? '—' : formatCurrency(summaries.total.outstanding)}
          </strong>
        </div>
      </div>

      {/* Load Error */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-700">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span className="text-sm">{loadError}</span>
        </div>
      )}

      {/* Loan Structure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loanStructures.map((structure) => {
          const summary = summaries.byType[structure.type]

          return (
            <div
              key={structure.type}
              className="group bg-white rounded-2xl shadow-sm border border-purple-100 p-6 flex flex-col justify-between gap-4 hover:shadow-md transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              onClick={() => navigate(structure.path, { state: { from: 'loans' } })}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-[#EDE5FF] text-[#351078] flex items-center justify-center shadow-sm">
                    <span className="material-symbols-outlined text-[26px]">{structure.icon}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#EDE5FF] text-[#351078] text-xs font-semibold">
                    {t(structure.cycleKey)}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#1A0A3B] group-hover:text-[#351078] transition-colors">
                    {t(structure.titleKey)}
                  </h3>
                  <p className="text-sm text-[#4A3870] mt-1">
                    {t(structure.descriptionKey)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4 mt-2 bg-[#F2ECFF] -mx-6 -mb-6 px-6 py-4 rounded-b-2xl">
                <div className="flex flex-col">
                  <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('accounts', 'Accounts')}</span>
                  <span className="text-sm font-bold text-[#1A0A3B]">
                    {loading ? '—' : summary.accounts.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('activeAccounts', 'Active')}</span>
                  <span className="text-sm font-bold text-[#351078]">
                    {loading ? '—' : summary.active.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-xs text-[#7B6BA0] uppercase tracking-wider">{t('totalPrincipal', 'Principal')}</span>
                  <span className="text-sm font-bold text-[#1A0A3B]">
                    {loading ? '—' : formatCurrency(summary.principal)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default LoanTypes
