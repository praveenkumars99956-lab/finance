import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function CollectionReport() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    loadCollections()
  }, [])

  const formatMoney = (value) => {
    return Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

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
    switch (type) {
      case 'daily':
        return t('dailyLoan')

      case 'weekly':
        return t('weeklyLoan')

      case 'monthly':
        return t('monthlyLoan')

      case 'interest_only':
      case 'interest-only':
        return t('interestOnlyLoan')

      default:
        return type || '-'
    }
  }

  // =========================================
  // LOAD COLLECTIONS
  // =========================================

  const loadCollections = async () => {
    setLoading(true)

    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession()

    if (
      sessionError ||
      !sessionData?.session
    ) {
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

      alert(
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

  const filteredRecords =
    useMemo(() => {
      return records.filter(
        (record) => {
          const text =
            search
              .trim()
              .toLowerCase()

          const matchesSearch =
            !text ||
            record.customerName
              .toLowerCase()
              .includes(text) ||
            record.customerId
              .toLowerCase()
              .includes(text) ||
            record.agentName
              .toLowerCase()
              .includes(text) ||
            record.agentCode
              .toLowerCase()
              .includes(text) ||
            record.category
              .toLowerCase()
              .includes(text)

          const matchesType =
            typeFilter === 'all' ||
            record.financeType ===
              typeFilter

          const matchesFrom =
            !fromDate ||
            record.paymentDate >=
              fromDate

          const matchesTo =
            !toDate ||
            record.paymentDate <=
              toDate

          return (
            matchesSearch &&
            matchesType &&
            matchesFrom &&
            matchesTo
          )
        }
      )
    }, [
      records,
      search,
      typeFilter,
      fromDate,
      toDate
    ])

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

  const downloadExcel = () => {
    if (filteredRecords.length === 0) {
      alert(t('noCollectionRecordsAvailable'))
      return
    }

    const rows = filteredRecords.map((record, index) => ({
      [t('serialNumber')]: index + 1,
      [t('date')]: record.paymentDate,
      [t('customerId')]: record.customerId,
      [t('customerName')]: record.customerName,
      [t('phone')]: record.phone,
      [t('agent')]: record.agentName,
      [t('agentIdLabel')]: record.agentCode,
      [t('collectionCategory')]: record.category,
      [t('loanType')]: getFinanceTypeName(record.financeType),
      [t('collectedAmount')]: record.paymentAmount,
      [t('balanceBefore')]: record.balanceBefore,
      [t('balanceAfter')]: record.balanceAfter
    }))

    rows.push({
      [t('serialNumber')]: '',
      [t('date')]: '',
      [t('customerId')]: '',
      [t('customerName')]: t('total'),
      [t('phone')]: '',
      [t('agent')]: '',
      [t('agentIdLabel')]: '',
      [t('collectionCategory')]: '',
      [t('loanType')]: '',
      [t('collectedAmount')]: totalCollected,
      [t('balanceBefore')]: '',
      [t('balanceAfter')]: ''
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
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

  const downloadPDF = () => {
    if (
      filteredRecords.length === 0
    ) {
      alert(
          t('noCollectionRecordsAvailable')
      )
      return
    }

    const doc =
      new jsPDF({
        orientation: 'landscape'
      })

    doc.setFontSize(18)

    doc.text(
        t('collectionReport'),
      14,
      15
    )

    doc.setFontSize(10)

    doc.text(
        t('generatedOn', { date: new Date().toLocaleDateString({ en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', ml: 'ml-IN' }[i18n.resolvedLanguage] || 'en-IN') }),
      14,
      22
    )

    const rows =
      filteredRecords.map(
        (record, index) => [
          index + 1,

          formatDate(
            record.paymentDate
          ),

          record.customerName,

          record.agentName,

          record.category,

          getFinanceTypeName(
            record.financeType
          ),

          `₹${formatMoney(record.paymentAmount)}`,
          `₹${formatMoney(record.balanceBefore)}`,
          `₹${formatMoney(record.balanceAfter)}`
        ]
      )

    autoTable(doc, {
      startY: 28,

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

      body: rows,

      styles: {
        fontSize: 8
      }
    })

    const finalY =
      doc.lastAutoTable
        ?.finalY || 40

    doc.setFontSize(11)

    doc.text(
      `${t('totalCollected')}: ₹${formatMoney(totalCollected)}`,
      14,
      finalY + 10
    )

    doc.save(
      'collection-report.pdf'
    )
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="customer-profile-page">

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

        <button
          className="back-button"
          onClick={() =>
            navigate('/reports')
          }
        >
          ← {t('reports')}
        </button>

      </div>

      {/* FILTERS */}

      <div className="daily-manage-section">

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

          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(
                e.target.value
              )
            }
          >
            <option value="all">
              {t('allLoanTypes')}
            </option>

            <option value="daily">
              {t('dailyLoan')}
            </option>

            <option value="weekly">
              {t('weeklyLoan')}
            </option>

            <option value="monthly">
              {t('monthlyLoan')}
            </option>

            <option value="interest_only">
              {t('interestOnlyLoan')}
            </option>
          </select>

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

      </div>

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
          margin: '20px 0'
        }}
      >

        <button
          onClick={downloadExcel}
        >
          📗 {t('downloadExcel')}
        </button>

        <button
          onClick={downloadPDF}
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
            style={{
              overflowX: 'auto'
            }}
          >

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}
            >

              <thead>

                <tr>

                  <th style={thStyle}>
                    {t('date')}
                  </th>

                  <th style={thStyle}>
                    {t('customer')}
                  </th>

                  <th style={thStyle}>
                    {t('agent')}
                  </th>

                  <th style={thStyle}>
                    {t('collectionCategory')}
                  </th>

                  <th style={thStyle}>
                    {t('loanType')}
                  </th>

                  <th style={thStyle}>
                    {t('collected')}
                  </th>

                  <th style={thStyle}>
                    {t('balanceBefore')}
                  </th>

                  <th style={thStyle}>
                    {t('balanceAfter')}
                  </th>

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

                      <td style={tdStyle}>

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