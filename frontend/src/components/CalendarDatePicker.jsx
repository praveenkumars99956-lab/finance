import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const pad = (value) => String(value).padStart(2, '0')

const formatDateValue = (year, month, day) => {
  return `${year}-${pad(month)}-${pad(day)}`
}

const parseDateValue = (value) => {
  if (!value) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return null

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

const getTodayValue = () => {
  const today = new Date()

  return formatDateValue(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  )
}

function CalendarDatePicker({
  value = '',
  onChange,
  label = 'Date',
  min = '',
  max = ''
}) {
  const { i18n, t } = useTranslation()
  const locale = {
    en: 'en-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
    ml: 'ml-IN'
  }[i18n.resolvedLanguage] || 'en-IN'
  // =========================================
  // TODAY
  // =========================================

  const today = useMemo(() => {
    const now = new Date()

    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    }
  }, [])

  // =========================================
  // SELECTED DATE
  // =========================================

  const selectedDate = parseDateValue(value)
  const selectedYear = selectedDate?.year
  const selectedMonth = selectedDate?.month

  const isDateOutsideBounds = (dateValue) =>
    Boolean(
      (min && dateValue < String(min).slice(0, 10)) ||
      (max && dateValue > String(max).slice(0, 10))
    )

  // =========================================
  // VISIBLE CALENDAR MONTH
  // =========================================

  const [visibleYear, setVisibleYear] = useState(
    selectedDate?.year || today.year
  )

  const [visibleMonth, setVisibleMonth] = useState(
    selectedDate?.month || today.month
  )

  // =========================================
  // UPDATE CALENDAR WHEN VALUE CHANGES
  // =========================================

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return

    setVisibleYear((year) =>
      year === selectedYear ? year : selectedYear
    )
    setVisibleMonth((month) =>
      month === selectedMonth ? month : selectedMonth
    )
  }, [selectedYear, selectedMonth])

  // =========================================
  // MONTH NAMES
  // =========================================

  const monthNames = Array.from(
    { length: 12 },
    (_, index) => new Intl.DateTimeFormat(locale, { month: 'long' })
      .format(new Date(2024, index, 1))
  )

  // =========================================
  // YEAR OPTIONS
  // =========================================

  const years = []

  for (
    let year = today.year - 20;
    year <= today.year + 30;
    year += 1
  ) {
    years.push(year)
  }

  // =========================================
  // DAYS IN MONTH
  // =========================================

  const daysInMonth = new Date(
    visibleYear,
    visibleMonth,
    0
  ).getDate()

  // =========================================
  // FIRST DAY
  // =========================================

  const firstDay = new Date(
    visibleYear,
    visibleMonth - 1,
    1
  ).getDay()

  // =========================================
  // PREVIOUS MONTH
  // =========================================

  const previousMonth = () => {
    if (visibleMonth === 1) {
      setVisibleMonth(12)
      setVisibleYear((year) => year - 1)
    } else {
      setVisibleMonth((month) => month - 1)
    }
  }

  // =========================================
  // NEXT MONTH
  // =========================================

  const nextMonth = () => {
    if (visibleMonth === 12) {
      setVisibleMonth(1)
      setVisibleYear((year) => year + 1)
    } else {
      setVisibleMonth((month) => month + 1)
    }
  }

  // =========================================
  // SELECT DATE
  // =========================================

  const selectDate = (day) => {
    const newDate = formatDateValue(
      visibleYear,
      visibleMonth,
      day
    )

    if (isDateOutsideBounds(newDate)) {
      return
    }

    console.log('CALENDAR DATE SELECTED:', newDate)

    if (typeof onChange === 'function') {
      onChange(newDate)
    }
  }

  // =========================================
  // TODAY
  // =========================================

  const selectToday = () => {
    const todayValue = getTodayValue()

    if (isDateOutsideBounds(todayValue)) {
      return
    }

    setVisibleYear(today.year)
    setVisibleMonth(today.month)

    if (typeof onChange === 'function') {
      onChange(todayValue)
    }
  }

  // =========================================
  // CLEAR
  // =========================================

  const clearDate = () => {
    if (typeof onChange === 'function') {
      onChange('')
    }
  }

  // =========================================
  // DISPLAY DATE
  // =========================================

  const getDisplayDate = () => {
    const parsed = parseDateValue(value)

    if (!parsed) {
      return t('noDateSelected')
    }

    return new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day
    ).toLocaleDateString(
      locale,
      {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }
    )
  }

  // =========================================
  // STYLES
  // =========================================

  const calendarStyle = {
    width: '100%',
    maxWidth: '320px',
    border: '1px solid #d7e0ed',
    borderRadius: '10px',
    padding: '12px',
    background: '#ffffff',
    boxSizing: 'border-box'
  }

  const toolbarStyle = {
    display: 'grid',
    gridTemplateColumns: '42px 1fr 42px',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '12px'
  }

  const navButtonStyle = {
    height: '38px',
    border: '1px solid #d7e0ed',
    borderRadius: '7px',
    background: '#ffffff',
    cursor: 'pointer',
    fontSize: '17px'
  }

  const selectRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 90px',
    gap: '5px'
  }

  const selectStyle = {
    width: '100%',
    height: '38px',
    border: '1px solid #d7e0ed',
    borderRadius: '7px',
    background: '#ffffff',
    padding: '0 8px'
  }

  const weekdayStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    textAlign: 'center',
    marginBottom: '5px'
  }

  const weekdayItemStyle = {
    padding: '5px 0',
    fontSize: '12px',
    fontWeight: '700',
    color: '#44546a'
  }

  const daysStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '3px'
  }

  const dayButtonStyle = {
    width: '100%',
    aspectRatio: '1 / 1',
    minHeight: '34px',
    border: 'none',
    borderRadius: '50%',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px'
  }

  const selectedDayStyle = {
    ...dayButtonStyle,
    background: '#1769e0',
    color: '#ffffff',
    fontWeight: '700'
  }

  const bottomButtonStyle = {
    padding: '7px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    background: '#ffffff',
    cursor: 'pointer'
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div
      style={calendarStyle}
      role="group"
      aria-label={label}
    >
      {/* =====================================
          MONTH NAVIGATION
          ===================================== */}

      <div style={toolbarStyle}>
        <button
          type="button"
          style={navButtonStyle}
          onClick={previousMonth}
        >
          &lt;
        </button>

        <div style={selectRowStyle}>
          {/* MONTH */}

          <select
            value={visibleMonth}
            style={selectStyle}
            onChange={(e) => {
              setVisibleMonth(
                Number(e.target.value)
              )
            }}
          >
            {monthNames.map((month, index) => (
              <option
                key={month}
                value={index + 1}
              >
                {month}
              </option>
            ))}
          </select>

          {/* YEAR */}

          <select
            value={visibleYear}
            style={selectStyle}
            onChange={(e) => {
              setVisibleYear(
                Number(e.target.value)
              )
            }}
          >
            {years.map((year) => (
              <option
                key={year}
                value={year}
              >
                {year}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          style={navButtonStyle}
          onClick={nextMonth}
        >
          &gt;
        </button>
      </div>

      {/* =====================================
          WEEK DAYS
          ===================================== */}

      <div style={weekdayStyle}>
        {[
          ...Array.from({ length: 7 }, (_, index) =>
            new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
              .format(new Date(2023, 0, index + 1))
          )
        ].map((day, index) => (
          <div
            key={`${day}-${index}`}
            style={weekdayItemStyle}
          >
            {day}
          </div>
        ))}
      </div>

      {/* =====================================
          CALENDAR DAYS
          ===================================== */}

      <div style={daysStyle}>
        {/* EMPTY DAYS */}

        {Array.from(
          {
            length: firstDay
          },
          (_, index) => (
            <div
              key={`empty-${index}`}
            />
          )
        )}

        {/* DATE BUTTONS */}

        {Array.from(
          {
            length: daysInMonth
          },
          (_, index) => {
            const day = index + 1

            const dateValue =
              formatDateValue(
                visibleYear,
                visibleMonth,
                day
              )

            const isSelected =
              value === dateValue
            const isDisabled =
              isDateOutsideBounds(dateValue)

            return (
              <button
                key={dateValue}
                type="button"
                disabled={isDisabled}
                style={
                  isSelected
                    ? selectedDayStyle
                    : isDisabled
                      ? {
                          ...dayButtonStyle,
                          color: '#cbd5e1',
                          cursor: 'not-allowed'
                        }
                      : dayButtonStyle
                }
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()

                  selectDate(day)
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background =
                      '#eef4ff'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background =
                      'transparent'
                  }
                }}
              >
                {day}
              </button>
            )
          }
        )}
      </div>

      {/* =====================================
          SELECTED DATE
          ===================================== */}

      <div
        style={{
          marginTop: '12px'
        }}
      >
        <div
          style={{
            fontSize: '12px',
            color: '#64748b'
          }}
        >
          {t('selectedDate')}
        </div>

        <strong>
          {getDisplayDate()}
        </strong>
      </div>

      {/* =====================================
          TODAY / CLEAR
          ===================================== */}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '10px'
        }}
      >
        <button
          type="button"
          style={bottomButtonStyle}
          disabled={isDateOutsideBounds(getTodayValue())}
          onClick={(event) => {
            event.preventDefault()
            selectToday()
          }}
        >
          {t('today')}
        </button>

        <button
          type="button"
          style={bottomButtonStyle}
          onClick={(event) => {
            event.preventDefault()
            clearDate()
          }}
        >
          {t('clear')}
        </button>
      </div>
    </div>
  )
}

export default CalendarDatePicker