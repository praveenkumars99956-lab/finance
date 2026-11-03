import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function Reports() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('finance_records')
      .select(`
        *,
        customers (
          id,
          customer_id,
          full_name,
          phone
        ),
        collection_categories (
          id,
          category_name
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Reports error:', error)
      alert(t('reportsLoadFailed', { message: error.message }))
      setLoading(false)
      return
    }

    setRecords(data || [])
    setLoading(false)
  }

  const getCustomerName = (record) => {
    return (
      record.customers?.full_name ||
      record.name ||
      t('unknownCustomer')
    )
  }

  const getCustomerId = (record) => {
    return record.customers?.customer_id || '-'
  }

  const getCategoryName = (record) => {
    return (
      record.collection_categories?.category_name ||
      'Not Assigned'
    )
  }

  const getLoanName = (type) => {
    if (type === 'daily') return t('dailyLoan')
    if (type === 'weekly') return t('weeklyLoan')
    if (type === 'monthly') return t('monthlyLoan')

    if (
      type === 'interest_only' ||
      type === 'interest-only'
    ) {
      return t('interestOnlyLoan')
    }

    return type || '-'
  }

  const formatMoney = (value) => {
    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return Number(value || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatDate = (date) => {
    if (!date) return '-'

    const dateValue = String(date).split('T')[0]
    const parsedDate = new Date(`${dateValue}T00:00:00`)
    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return Number.isNaN(parsedDate.getTime())
      ? date
      : parsedDate.toLocaleDateString(locale)
  }

  const isOverdue = (record) => {
    if (Number(record.pending || 0) <= 0) {
      return false
    }

    if (!record.next_due_date) {
      return false
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueDate = new Date(
      `${record.next_due_date}T00:00:00`
    )

    return dueDate < today
  }

  const getStatus = (record) => {
    const pending = Number(record.pending || 0)

    if (pending <= 0) {
      return 'paid'
    }

    if (isOverdue(record)) {
      return 'overdue'
    }

    return 'pending'
  }

  const filteredRecords = useMemo(() => {
    const searchText = search.trim().toLowerCase()

    return records.filter((record) => {
      const pending = Number(record.pending || 0)

      let matchesFilter = true

      if (filter === 'daily') {
        matchesFilter =
          record.finance_type === 'daily'
      }

      if (filter === 'weekly') {
        matchesFilter =
          record.finance_type === 'weekly'
      }

      if (filter === 'monthly') {
        matchesFilter =
          record.finance_type === 'monthly'
      }

      if (filter === 'interest_only') {
        matchesFilter =
          record.finance_type === 'interest_only' ||
          record.finance_type === 'interest-only'
      }

      if (filter === 'pending') {
        matchesFilter =
          pending > 0 && !isOverdue(record)
      }

      if (filter === 'overdue') {
        matchesFilter = isOverdue(record)
      }

      if (filter === 'paid') {
        matchesFilter = pending <= 0
      }

      if (!matchesFilter) {
        return false
      }

      if (!searchText) {
        return true
      }

      const customerName =
        getCustomerName(record).toLowerCase()

      const customerId =
        getCustomerId(record).toLowerCase()

      const categoryName =
        getCategoryName(record).toLowerCase()

      const loanName =
        getLoanName(record.finance_type).toLowerCase()

      return (
        customerName.includes(searchText) ||
        customerId.includes(searchText) ||
        categoryName.includes(searchText) ||
        loanName.includes(searchText)
      )
    })
  }, [records, filter, search, i18n.resolvedLanguage])

  const totalAmount = filteredRecords.reduce(
    (total, record) =>
      total + Number(record.amount || 0),
    0
  )

  const totalPaid = filteredRecords.reduce(
    (total, record) =>
      total + Number(record.paid || 0),
    0
  )

  const totalPending = filteredRecords.reduce(
    (total, record) =>
      total + Number(record.pending || 0),
    0
  )

  const overdueCount = filteredRecords.filter(
    (record) => isOverdue(record)
  ).length

  const getReportName = () => {
    if (filter === 'daily') {
      return t('dailyFinanceReport')
    }

    if (filter === 'weekly') {
      return t('weeklyFinanceReport')
    }

    if (filter === 'monthly') {
      return t('monthlyFinanceReport')
    }

    if (filter === 'interest_only') {
      return t('interestOnlyFinanceReport')
    }

    if (filter === 'pending') {
      return t('pendingPaymentsReport')
    }

    if (filter === 'overdue') {
      return t('overduePaymentsReport')
    }

    if (filter === 'paid') {
      return t('paidAccountsReport')
    }

    return t('allFinanceRecords')
  }

  const getFileName = () => {
    if (filter === 'daily') {
      return 'daily-finance-report'
    }

    if (filter === 'weekly') {
      return 'weekly-finance-report'
    }

    if (filter === 'monthly') {
      return 'monthly-finance-report'
    }

    if (filter === 'interest_only') {
      return 'interest-only-finance-report'
    }

    if (filter === 'pending') {
      return 'pending-payments-report'
    }

    if (filter === 'overdue') {
      return 'overdue-payments-report'
    }

    if (filter === 'paid') {
      return 'paid-accounts-report'
    }

    return 'all-finance-records'
  }

  const downloadExcel = async () => {
    if (filteredRecords.length === 0) {
      alert(t('noRecordsToDownload'))
      return
    }

    const XLSX = (await import('xlsx/dist/xlsx.mini.min.js')).default
    const excelData = filteredRecords.map(
      (record, index) => ({
        [t('serialNumber')]: index + 1,
        [t('customerId')]: getCustomerId(record),
        [t('customerName')]: getCustomerName(record),
        [t('collectionCategory')]:
          getCategoryName(record),
        [t('loanType')]:
          getLoanName(record.finance_type),
        [t('totalAmount')]:
          Number(record.amount || 0),
        [t('paidAmount')]:
          Number(record.paid || 0),
        [t('pendingAmount')]:
          Number(record.pending || 0),
        [t('nextDueDate')]:
          record.next_due_date || '',
        [t('status')]: t(getStatus(record))
      })
    )

    excelData.push({
      [t('serialNumber')]: '',
      [t('customerId')]: '',
      [t('customerName')]: t('total'),
      [t('collectionCategory')]: '',
      [t('loanType')]: '',
      [t('totalAmount')]: totalAmount,
      [t('paidAmount')]: totalPaid,
      [t('pendingAmount')]: totalPending,
      [t('nextDueDate')]: '',
      [t('status')]: ''
    })

    const worksheet =
      XLSX.utils.json_to_sheet(excelData)

    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 24 },
      { wch: 24 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 }
    ]

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      t('financeReportSheet')
    )

    XLSX.writeFile(
      workbook,
      `${getFileName()}.xlsx`
    )
  }

  const downloadPDF = async () => {
    if (filteredRecords.length === 0) {
      alert(t('noRecordsToDownload'))
      return
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ])
    const doc = new jsPDF({
      orientation: 'landscape'
    })

    doc.setFontSize(18)
    doc.text(getReportName(), 14, 15)

    doc.setFontSize(10)

    doc.text(
      t('generatedOn', { date: new Date().toLocaleDateString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN') }),
      14,
      22
    )

    const tableRows = filteredRecords.map(
      (record, index) => [
        index + 1,
        getCustomerName(record),
        getCategoryName(record),
        getLoanName(record.finance_type),
        `Rs. ${formatMoney(record.amount)}`,
        `Rs. ${formatMoney(record.paid)}`,
        `Rs. ${formatMoney(record.pending)}`,
        formatDate(record.next_due_date),
        getStatus(record)
      ]
    )

    autoTable(doc, {
      startY: 28,

      head: [
        [
          t('serialNumber'),
          t('customer'),
          t('collectionCategory'),
          t('loanType'),
          t('total'),
          t('paid'),
          t('pending'),
          t('nextDueDate'),
          t('status')
        ]
      ],

      body: tableRows
    })

    const finalY =
      doc.lastAutoTable?.finalY || 40

    doc.setFontSize(11)

    doc.text(
      `${t('totalAmount')}: ₹${formatMoney(totalAmount)}`,
      14,
      finalY + 10
    )

    doc.text(
      `${t('totalPaid')}: ₹${formatMoney(totalPaid)}`,
      14,
      finalY + 17
    )

    doc.text(
      `${t('totalPending')}: ₹${formatMoney(totalPending)}`,
      14,
      finalY + 24
    )

    doc.save(`${getFileName()}.pdf`)
  }

  return (
    <div className="weekly-page">
      <p>{t('appName')}</p>

      <h1>{t('reports')}</h1>

      <p>{t('reportsPageDescription')}</p>

      <button
        onClick={() => navigate('/admin')}
        style={{ marginBottom: '20px' }}
      >
        ← {t('adminDashboard')}
      </button>

      <div className="weekly-summary">
        <h2>{t('financeReports')}</h2>

        <div className="report-filters">
          <button onClick={() => setFilter('all')}>
            {t('all')}
          </button>

          <button onClick={() => setFilter('daily')}>
            {t('dailyLoan')}
          </button>

          <button onClick={() => setFilter('weekly')}>
            {t('weeklyLoan')}
          </button>

          <button onClick={() => setFilter('monthly')}>
            {t('monthlyLoan')}
          </button>

          <button
            onClick={() =>
              setFilter('interest_only')
            }
          >
            {t('interestOnlyLoan')}
          </button>

          <button
            onClick={() => setFilter('pending')}
          >
            {t('pending')}
          </button>

          <button
            onClick={() => setFilter('overdue')}
          >
            {t('overdue')}
          </button>

          <button onClick={() => setFilter('paid')}>
            {t('paid')}
          </button>

          <button
            onClick={() =>
              navigate('/reports/collections')
            }
          >
            {t('collectionReport')}
          </button>
        </div>

        <div style={{ marginTop: '18px' }}>
          <input
            type="text"
            placeholder={t('searchCustomerOrCategory')}
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />
        </div>
      </div>

      {loading ? (
        <p>{t('loadingRecords')}</p>
      ) : (
        <>
          <h2>{getReportName()}</h2>

          <div className="weekly-summary">
            <div
              style={{
                display: 'flex',
                gap: '15px',
                flexWrap: 'wrap'
              }}
            >
              <div className="summary-card">
                <p>{t('records')}</p>
                <h3>{filteredRecords.length}</h3>
              </div>

              <div className="summary-card">
                <p>{t('totalAmount')}</p>
                <h3>
                  ₹{formatMoney(totalAmount)}
                </h3>
              </div>

              <div className="summary-card">
                <p>{t('totalPaid')}</p>
                <h3>
                  ₹{formatMoney(totalPaid)}
                </h3>
              </div>

              <div className="summary-card">
                <p>{t('totalPending')}</p>
                <h3>
                  ₹{formatMoney(totalPending)}
                </h3>
              </div>

              <div className="summary-card">
                <p>{t('overdueAccounts')}</p>
                <h3>{overdueCount}</h3>
              </div>
            </div>
          </div>

          <div
            className="download-buttons"
            style={{
              marginTop: '20px',
              marginBottom: '20px'
            }}
          >
            <button onClick={downloadExcel}>
              📗 {t('downloadExcel')}
            </button>

            <button onClick={downloadPDF}>
              📄 {t('downloadPdf')}
            </button>
          </div>

          <div
            style={{
              overflowX: 'auto'
            }}
          >
            {filteredRecords.length === 0 ? (
              <p>{t('noRecordsAvailable')}</p>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse'
                }}
              >
                <thead>
                  <tr>
                    <th>{t('customer')}</th>
                    <th>{t('collectionCategory')}</th>
                    <th>{t('loanType')}</th>
                    <th>{t('total')}</th>
                    <th>{t('paid')}</th>
                    <th>{t('pending')}</th>
                    <th>{t('nextDueDate')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <strong>
                          {getCustomerName(record)}
                        </strong>

                        <br />

                        <small>
                          {getCustomerId(record)}
                        </small>
                      </td>

                      <td>
                        {getCategoryName(record)}
                      </td>

                      <td>
                        {getLoanName(
                          record.finance_type
                        )}
                      </td>

                      <td>
                        ₹{formatMoney(record.amount)}
                      </td>

                      <td>
                        ₹{formatMoney(record.paid)}
                      </td>

                      <td>
                        <strong>
                          ₹{formatMoney(
                            record.pending
                          )}
                        </strong>
                      </td>

                      <td>
                        {formatDate(
                          record.next_due_date
                        )}
                      </td>

                      <td>
                        {getStatus(record) ===
                        'overdue'
                          ? '🔴 '
                          : getStatus(record) ===
                            'paid'
                          ? '🟢 '
                          : '🟡 '}

                        <strong>
                          {t(getStatus(record))}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Reports