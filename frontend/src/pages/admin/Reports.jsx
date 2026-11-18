import { formatMoney as formatMoneyValue } from '../../utils/money'
import { normalizeFinanceType } from '../../utils/financeType'
import { notify } from '../../utils/notify'
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

  async function loadRecords() {
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
      notify(t('reportsLoadFailed', { message: error.message }))
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
    const normalizedType = normalizeFinanceType(type)

    if (normalizedType === 'daily') return t('dailyLoan')
    if (normalizedType === 'weekly') return t('weeklyLoan')
    if (normalizedType === 'monthly') return t('monthlyLoan')
    if (normalizedType === 'interest_only') return t('interestOnlyLoan')

    return type || '-'
  }

  const formatMoney = (value) => formatMoneyValue(value, i18n.resolvedLanguage)

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
      const recordType = normalizeFinanceType(record.finance_type)

      let matchesFilter = true

      if (filter === 'daily') {
        matchesFilter = recordType === 'daily'
      }

      if (filter === 'weekly') {
        matchesFilter = recordType === 'weekly'
      }

      if (filter === 'monthly') {
        matchesFilter = recordType === 'monthly'
      }

      if (filter === 'interest_only') {
        matchesFilter = recordType === 'interest_only'
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

  const getGeneratedOnText = () =>
    t('generatedOn', {
      date: new Date().toLocaleDateString(
        {
          en: 'en-IN',
          ta: 'ta-IN',
          hi: 'hi-IN',
          ml: 'ml-IN'
        }[i18n.resolvedLanguage] || 'en-IN'
      )
    })

  const downloadExcel = async () => {
    if (filteredRecords.length === 0) {
      notify(t('noRecordsToDownload'))
      return
    }

    const XLSX = (await import('xlsx/dist/xlsx.mini.min.js')).default

    const headers = [
      t('serialNumber'),
      t('customerId'),
      t('customerName'),
      t('collectionCategory'),
      t('loanType'),
      t('totalAmount'),
      t('paidAmount'),
      t('pendingAmount'),
      t('nextDueDate'),
      t('status')
    ]

    const dataRows = filteredRecords.map(
      (record, index) => [
        index + 1,
        getCustomerId(record),
        getCustomerName(record),
        getCategoryName(record),
        getLoanName(record.finance_type),
        Number(record.amount || 0),
        Number(record.paid || 0),
        Number(record.pending || 0),
        record.next_due_date || '',
        t(getStatus(record))
      ]
    )

    const totalRow = [
      '',
      '',
      t('total'),
      '',
      '',
      totalAmount,
      totalPaid,
      totalPending,
      '',
      ''
    ]

    // Title + generated date + blank line keep the exported list readable.
    const worksheet = XLSX.utils.aoa_to_sheet([
      [getReportName()],
      [getGeneratedOnText()],
      [],
      headers,
      ...dataRows,
      totalRow
    ])

    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 26 },
      { wch: 26 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 }
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
      notify(t('noRecordsToDownload'))
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
    doc.text(getGeneratedOnText(), 14, 22)

    const dataRows = filteredRecords.map(
      (record, index) => [
        index + 1,
        getCustomerName(record),
        getCategoryName(record),
        getLoanName(record.finance_type),
        `₹${formatMoney(record.amount)}`,
        `₹${formatMoney(record.paid)}`,
        `₹${formatMoney(record.pending)}`,
        formatDate(record.next_due_date),
        t(getStatus(record))
      ]
    )

    // Totals are part of the table so they stay on the same page as the list.
    const tableRows = [
      ...dataRows,
      [
        '',
        t('total'),
        '',
        '',
        `₹${formatMoney(totalAmount)}`,
        `₹${formatMoney(totalPaid)}`,
        `₹${formatMoney(totalPending)}`,
        '',
        ''
      ]
    ]

    autoTable(doc, {
      startY: 28,

      margin: { left: 14, right: 14, top: 28, bottom: 18 },

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

      body: tableRows,

      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        valign: 'middle'
      },

      headStyles: {
        fillColor: [53, 16, 120],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },

      alternateRowStyles: {
        fillColor: [245, 243, 255]
      },

      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 42 },
        2: { cellWidth: 36 },
        3: { cellWidth: 26 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 30 },
        6: { halign: 'right', cellWidth: 30 },
        7: { cellWidth: 30 },
        8: { halign: 'center', cellWidth: 26 }
      },

      didParseCell: (data) => {
        if (
          data.section === 'body' &&
          data.row.index === dataRows.length
        ) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [239, 230, 255]
        }
      },

      didDrawPage: (data) => {
        doc.setFontSize(8)
        doc.text(
          `Page ${data.pageNumber}`,
          doc.internal.pageSize.getWidth() - 14,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'right' }
        )
      }
    })

    doc.save(`${getFileName()}.pdf`)
  }

  return (
    <div className="weekly-page">
      <p>{t('appName')}</p>

      <h1>{t('reports')}</h1>

      <p>{t('reportsPageDescription')}</p>

      <button
        onClick={() => navigate('/admin')}
        style={{
          marginBottom: '20px',
          background: '#ffffff',
          color: '#351078',
          border: '1px solid #c4b5fd',
          borderRadius: '10px',
          padding: '0.55rem 0.9rem',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        ← {t('adminDashboard')}
      </button>

      <div className="weekly-summary finance-reports-card">
        <h2>{t('financeReports')}</h2>

        <div className="report-filters" style={{ background: 'var(--primary-50, #F5F3FF)' }}>
          {[
            { key: 'all', label: t('all') },
            { key: 'daily', label: t('dailyLoan') },
            { key: 'weekly', label: t('weeklyLoan') },
            { key: 'monthly', label: t('monthlyLoan') },
            { key: 'interest_only', label: t('interestOnlyLoan') },
            { key: 'pending', label: t('pending') },
            { key: 'overdue', label: t('overdue') },
            { key: 'paid', label: t('paid') }
          ].map(({ key, label }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  background: active ? 'var(--primary-800, #3B1A82)' : '#ffffff',
                  color: active ? '#ffffff' : 'var(--primary-800, #3B1A82)',
                  border: `1px solid ${active ? 'var(--primary-800, #3B1A82)' : 'var(--primary-100, #EDE9FE)'}`,
                  borderRadius: '10px',
                  padding: '0.5rem 0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {label}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => navigate('/reports/collections')}
            style={{
              background: 'var(--primary-100, #EDE9FE)',
              color: 'var(--primary-800, #3B1A82)',
              border: '1px solid var(--primary-100, #EDE9FE)',
              borderRadius: '10px',
              padding: '0.5rem 0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {t('collectionReport')}
          </button>
        </div>

        <div className="finance-reports-search" style={{ marginTop: '18px' }}>
          <input
            type="text"
            placeholder={t('searchCustomerOrCategory')}
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              color: '#1f2937'
            }}
          />
        </div>
      </div>

      {loading ? (
        <p>{t('loadingRecords')}</p>
      ) : (
        <>
          <h2>{getReportName()}</h2>

          <div className="weekly-summary finance-reports-stats">
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
                <h3 style={{ color: '#FCA5A5' }}>{overdueCount}</h3>
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
            <button
              type="button"
              onClick={downloadExcel}
              style={{
                background: '#351078',
                color: '#ffffff',
                border: '1px solid #351078',
                borderRadius: '10px',
                padding: '0.55rem 0.95rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              📗 {t('downloadExcel')}
            </button>

            <button
              type="button"
              onClick={downloadPDF}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: '1px solid #dc2626',
                borderRadius: '10px',
                padding: '0.55rem 0.95rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
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
                  minWidth: '900px',
                  borderCollapse: 'collapse',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                <thead>
                  <tr style={{ background: '#f5f3ff' }}>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('customer')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('collectionCategory')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('loanType')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('total')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('paid')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('pending')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('nextDueDate')}</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#351078', whiteSpace: 'nowrap' }}>{t('status')}</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <strong>
                          {getCustomerName(record)}
                        </strong>

                        <br />

                        <small style={{ color: '#6b7280' }}>
                          {getCustomerId(record)}
                        </small>
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        {getCategoryName(record)}
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        {getLoanName(
                          record.finance_type
                        )}
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        ₹{formatMoney(record.amount)}
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top', color: '#351078', fontWeight: 600 }}>
                        ₹{formatMoney(record.paid)}
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <strong style={{ color: Number(record.pending || 0) > 0 ? '#b45309' : '#351078' }}>
                          ₹{formatMoney(
                            record.pending
                          )}
                        </strong>
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        {formatDate(
                          record.next_due_date
                        )}
                      </td>

                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        {getStatus(record) === 'overdue' ? '🔴 ' : getStatus(record) === 'paid' ? '🟢 ' : '🟡 '}
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