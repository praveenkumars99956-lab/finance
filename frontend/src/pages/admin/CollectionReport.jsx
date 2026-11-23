import { formatMoney as formatMoneyValue } from '../../utils/money'
import { normalizeFinanceType } from '../../utils/financeType'
import { matchesCollectionReport } from '../../utils/reportFilters'
import { notify } from '../../utils/notify'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'
import { subscribeToCollections } from '../../services/collectionsRealtime'
import SelectMenu from '../../components/SelectMenu'

function CollectionReport() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    loadCollections()

    let unsubscribeRealtime = () => {}

    getCurrentWorkspaceId()
      .then((workspaceId) => {
        unsubscribeRealtime = subscribeToCollections({
          workspaceId,
          onChange: () => loadCollections(false)
        })
      })
      .catch(() => {
        // Realtime is best-effort; focus refresh below keeps data fresh.
      })

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadCollections(false)
      }
    }

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      unsubscribeRealtime()
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  const formatMoney = (value) => formatMoneyValue(value)

  const formatDate = (value) => {
    if (!value) return '-'

    const locale = {
      en: 'en-IN',
      ta: 'ta-IN',
      hi: 'hi-IN',
      ml: 'ml-IN'
    }[i18n.resolvedLanguage] || 'en-IN'

    return new Date(`${value}T00:00:00`).toLocaleDateString(locale)
  }

  const getFinanceTypeName = (type) => {
    switch (normalizeFinanceType(type)) {
      case 'daily':
        return t('dailyLoan')

      case 'weekly':
        return t('weeklyLoan')

      case 'monthly':
        return t('monthlyLoan')

      case 'interest_only':
        return t('interestOnlyLoan')

      default:
        return type || '-'
    }
  }

  // =========================================
  // LOAD COLLECTIONS
  // =========================================

  async function loadCollections(showLoader = true) {
    if (showLoader) setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (
      sessionError ||
      !sessionData?.session
    ) {
      setLoading(false)
      navigate('/')
      return
    }

    // Payment transactions

    const {
      data: paymentData,
      error: paymentError
    } = await supabase
      .from('finance_payments')
      .select(`
        id,
        finance_record_id,
        payment_date,
        payment_amount,
        balance_before,
        balance_after,
        created_at,

        finance_records (
          id,
          finance_type,
          collection_category_id,

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
        )
      `)
      .order('payment_date', {
        ascending: false
      })
      .order('created_at', {
        ascending: false
      })

    if (paymentError) {
      console.error(
        'COLLECTION REPORT ERROR:',
        paymentError
      )

      notify(
        `Unable to load collection report: ${paymentError.message}`
      )

      setLoading(false)
      return
    }

    // Collection evidence

    const {
      data: evidenceData,
      error: evidenceError
    } = await supabase
      .from('collection_evidence')
      .select(`
        payment_id,
        agent_id,

        agents (
          id,
          agent_id,
          full_name
        )
      `)

    if (evidenceError) {
      console.error(
        'EVIDENCE ERROR:',
        evidenceError
      )
    }

    // Category → Agent assignments
    // Used for old payments without evidence.

    const {
      data: assignmentData,
      error: assignmentError
    } = await supabase
      .from('category_agent_assignments')
      .select(`
        category_id,
        status,

        agents (
          id,
          agent_id,
          full_name
        )
      `)
      .eq('status', 'active')

    if (assignmentError) {
      console.error(
        'ASSIGNMENT ERROR:',
        assignmentError
      )
    }

    const evidenceMap = {}

    for (const evidence of evidenceData || []) {
      evidenceMap[evidence.payment_id] = evidence
    }

    const assignmentMap = {}

    for (const assignment of assignmentData || []) {
      if (!assignmentMap[assignment.category_id]) {
        assignmentMap[assignment.category_id] =
          assignment.agents
      }
    }

    const combined = (paymentData || []).map(
      (payment) => {
        const finance =
          payment.finance_records || {}

        const customer =
          finance.customers || {}

        const category =
          finance.collection_categories || {}

        const evidence =
          evidenceMap[payment.id] || null

        const assignedAgent =
          assignmentMap[
            finance.collection_category_id
          ] || null

        const agent =
          evidence?.agents ||
          assignedAgent ||
          null

        return {
          id: payment.id,

          paymentDate:
            payment.payment_date,

          paymentAmount:
            Number(
              payment.payment_amount || 0
            ),

          balanceBefore:
            Number(
              payment.balance_before || 0
            ),

          balanceAfter:
            Number(
              payment.balance_after || 0
            ),

          financeType:
            finance.finance_type || '-',

          customerId:
            customer.customer_id || '-',

          customerName:
            customer.full_name || '-',

          phone:
            customer.phone || '-',

          category:
            category.category_name ||
            'Not Assigned',

          agentName:
            agent?.full_name ||
            'Not Assigned',

          agentCode:
            agent?.agent_id || '-'
        }
      }
    )

    setRecords(combined)
    setLoading(false)
  }

  // =========================================
  // FILTER
  // =========================================

  const filteredRecords = useMemo(() => {
    return records.filter((record) =>
      matchesCollectionReport(record, {
        search,
        typeFilter,
        fromDate,
        toDate
      })
    )
  }, [records, search, typeFilter, fromDate, toDate])

  const totalCollected =
    filteredRecords.reduce(
      (total, record) =>
        total +
        record.paymentAmount,
      0
    )

  const uniqueCustomers =
    new Set(
      filteredRecords.map(
        (record) =>
          record.customerId
      )
    ).size

  const uniqueAgents =
    new Set(
      filteredRecords
        .filter(
          (record) =>
            record.agentCode !== '-'
        )
        .map(
          (record) =>
            record.agentCode
        )
    ).size

  // =========================================
  // EXCEL
  // =========================================

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
      notify(t('noCollectionRecordsAvailable'))
      return
    }

    const XLSX = (await import('xlsx/dist/xlsx.mini.min.js')).default

    const headers = [
      t('serialNumber'),
      t('date'),
      t('customerId'),
      t('customerName'),
      t('phone'),
      t('agent'),
      t('agentIdLabel'),
      t('collectionCategory'),
      t('loanType'),
      t('collectedAmount'),
      t('balanceBefore'),
      t('balanceAfter')
    ]

    const dataRows = filteredRecords.map(
      (record, index) => [
        index + 1,
        record.paymentDate,
        record.customerId,
        record.customerName,
        record.phone,
        record.agentName,
        record.agentCode,
        record.category,
        getFinanceTypeName(record.financeType),
        Number(record.paymentAmount || 0),
        Number(record.balanceBefore || 0),
        Number(record.balanceAfter || 0)
      ]
    )

    const totalRow = [
      '',
      '',
      '',
      t('total'),
      '',
      '',
      '',
      '',
      '',
      totalCollected,
      '',
      ''
    ]

    const worksheet = XLSX.utils.aoa_to_sheet([
      [t('collectionReport')],
      [getGeneratedOnText()],
      [],
      headers,
      ...dataRows,
      totalRow
    ])

    worksheet['!cols'] = [
      { wch: 8 }, { wch: 15 }, { wch: 18 }, { wch: 22 },
      { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 22 },
      { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, t('collectionReport'))
    XLSX.writeFile(workbook, 'collection-report.xlsx')
  }

  // =========================================
  // PDF
  // =========================================

  const downloadPDF = async () => {
    if (
      filteredRecords.length === 0
    ) {
      notify(
        t('noCollectionRecordsAvailable')
      )
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
    doc.text(t('collectionReport'), 14, 15)

    doc.setFontSize(10)
    doc.text(getGeneratedOnText(), 14, 22)

    const dataRows = filteredRecords.map(
      (record, index) => [
        index + 1,
        formatDate(record.paymentDate),
        record.customerName,
        record.agentName,
        record.category,
        getFinanceTypeName(record.financeType),
        `₹${formatMoney(record.paymentAmount)}`,
        `₹${formatMoney(record.balanceBefore)}`,
        `₹${formatMoney(record.balanceAfter)}`
      ]
    )

    const tableRows = [
      ...dataRows,
      [
        '',
        '',
        t('total'),
        '',
        '',
        '',
        `₹${formatMoney(totalCollected)}`,
        '',
        ''
      ]
    ]

    autoTable(doc, {
      startY: 28,

      margin: { left: 14, right: 14, top: 28, bottom: 18 },

      head: [[
        t('serialNumber'),
        t('date'),
        t('customer'),
        t('agent'),
        t('collectionCategory'),
        t('loanType'),
        t('collected'),
        t('balanceBefore'),
        t('balanceAfter')
      ]],

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
        1: { cellWidth: 28 },
        2: { cellWidth: 46 },
        3: { cellWidth: 38 },
        4: { cellWidth: 38 },
        5: { cellWidth: 26 },
        6: { halign: 'right', cellWidth: 30 },
        7: { halign: 'right', cellWidth: 30 },
        8: { halign: 'right', cellWidth: 30 }
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

    doc.save('collection-report.pdf')
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page reports-page-shell">

      <div className="customer-profile-header">

        <div>
          <p>{t('appName')}</p>

          <h1>
            {t('collectionReport')}
          </h1>

          <span>
            {t('collectionReportPageDescription')}
          </span>
        </div>

        <div
          className="collection-report-header-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >

          <button
            type="button"
            className="collection-report-filters-button flex items-center gap-space-xs px-space-md py-space-sm rounded-DEFAULT bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-label-lg text-label-lg border-0 cursor-pointer font-semibold"
            onClick={() =>
              setShowFilters(true)
            }
          >
            <span className="material-symbols-outlined text-[18px]">filter_alt</span>
            <span>{t('reportFilters')}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/reports')}
            style={{
              background: '#ffffff',
              color: '#351078',
              border: '1px solid #c4b5fd',
              borderRadius: '10px',
              padding: '0.55rem 0.9rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ← {t('reports')}
          </button>

        </div>

      </div>

      {/* FILTERS */}

      {showFilters && (

      <div className="collection-report-filters-section daily-manage-section">

        <h2>
          {t('reportFilters')}
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >

          <input
            type="text"
            placeholder={t('searchCustomerAgentCategory')}
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
          />

          <SelectMenu
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel={t('filterByLoanType', 'Filter by loan type')}
            variant="compact"
            options={[
              { value: 'all', label: t('allLoanTypes') },
              { value: 'daily', label: t('dailyLoan') },
              { value: 'weekly', label: t('weeklyLoan') },
              { value: 'monthly', label: t('monthlyLoan') },
              { value: 'interest_only', label: t('interestOnlyLoan') }
            ]}
          />

          <label>
            {t('fromDate')}:{' '}

            <input
              type="date"
              value={fromDate}
              onChange={(e) =>
                setFromDate(
                  e.target.value
                )
              }
            />
          </label>

          <label>
            {t('toDate')}:{' '}

            <input
              type="date"
              value={toDate}
              onChange={(e) =>
                setToDate(
                  e.target.value
                )
              }
            />
          </label>

        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="collection-report-filters-cancel-button back-button"
            onClick={() => {
              setSearch('')
              setTypeFilter('all')
              setFromDate('')
              setToDate('')
            }}
          >
            {t('clearFilters', 'Clear filters')}
          </button>

          {/* CLOSE FILTERS WITHOUT RESETTING APPLIED VALUES */}
          <button
            type="button"
            className="collection-report-filters-cancel-button back-button"
            onClick={() =>
              setShowFilters(false)
            }
          >
            {t('cancel')}
          </button>
        </div>

      </div>

      )}

      {/* SUMMARY */}

      <div className="daily-manage-summary">

        <div>
          <span>
            {t('transactions')}
          </span>

          <strong>
            {filteredRecords.length}
          </strong>
        </div>

        <div>
          <span>
            {t('totalCollected')}
          </span>

          <strong>
            ₹{formatMoney(
              totalCollected
            )}
          </strong>
        </div>

        <div>
          <span>
            {t('customers')}
          </span>

          <strong>
            {uniqueCustomers}
          </strong>
        </div>

        <div>
          <span>
            {t('agents')}
          </span>

          <strong>
            {uniqueAgents}
          </strong>
        </div>

      </div>

      {/* DOWNLOAD */}

      <div
        style={{
          display: 'flex',
          gap: '12px',
          margin: '20px 0',
          flexWrap: 'wrap'
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

      {/* TABLE */}

      <div className="daily-manage-section">

        <h2>
          {t('collectionTransactions')}
        </h2>

        {loading ? (

          <p>
            {t('loadingCollectionReport')}
          </p>

        ) : filteredRecords.length === 0 ? (

          <p>
            {t('noCollectionTransactionsFound')}
          </p>

        ) : (

          <div
            className="reports-table-wrapper"
            style={{
              overflowX: 'auto'
            }}
          >

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
                  <th style={{ ...thStyle, color: '#351078' }}>{t('date')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('customer')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('agent')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('collectionCategory')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('loanType')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('collected')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('balanceBefore')}</th>
                  <th style={{ ...thStyle, color: '#351078' }}>{t('balanceAfter')}</th>
                </tr>
              </thead>

              <tbody>

                {filteredRecords.map(
                  (record) => (

                    <tr
                      key={record.id}
                      style={{
                        borderTop:
                          '1px solid #e5e7eb'
                      }}
                    >

                      <td style={tdStyle}>
                        {formatDate(
                          record.paymentDate
                        )}
                      </td>

                      <td style={tdStyle}>

                        <strong>
                          {record.customerName}
                        </strong>

                        <div
                          style={{
                            fontSize: '12px'
                          }}
                        >
                          {record.customerId}
                        </div>

                      </td>

                      <td style={tdStyle}>

                        {record.agentName}

                        <div
                          style={{
                            fontSize: '12px'
                          }}
                        >
                          {record.agentCode}
                        </div>

                      </td>

                      <td style={tdStyle}>
                        {record.category}
                      </td>

                      <td style={tdStyle}>
                        {getFinanceTypeName(
                          record.financeType
                        )}
                      </td>

                      <td style={{ ...tdStyle, color: '#351078' }}>

                        <strong>
                          ₹{formatMoney(
                            record.paymentAmount
                          )}
                        </strong>

                      </td>

                      <td style={tdStyle}>
                        ₹{formatMoney(
                          record.balanceBefore
                        )}
                      </td>

                      <td style={tdStyle}>
                        ₹{formatMoney(
                          record.balanceAfter
                        )}
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  whiteSpace: 'nowrap'
}

const tdStyle = {
  padding: '12px',
  verticalAlign: 'top'
}

export default CollectionReport