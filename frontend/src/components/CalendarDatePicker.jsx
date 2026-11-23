import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SelectMenu from './SelectMenu'

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

  const today = useMemo(() => {
    const now = new Date()

    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    }
  }, [])

  const selectedDate = parseDateValue(value)
  const selectedYear = selectedDate?.year
  const selectedMonth = selectedDate?.month
  const minDate = min ? String(min).slice(0, 10) : ''
  const maxDate = max ? String(max).slice(0, 10) : ''
  const todayValue = getTodayValue()

  const isDateOutsideBounds = (dateValue) =>
    Boolean(
      (minDate && dateValue < minDate) ||
      (maxDate && dateValue > maxDate)
    )

  const [visibleYear, setVisibleYear] = useState(
    selectedDate?.year || today.year
  )

  const [visibleMonth, setVisibleMonth] = useState(
    selectedDate?.month || today.month
  )

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return

    setVisibleYear((year) =>
      year === selectedYear ? year : selectedYear
    )
    setVisibleMonth((month) =>
      month === selectedMonth ? month : selectedMonth
    )
  }, [selectedYear, selectedMonth])

  const monthNames = Array.from(
    { length: 12 },
    (_, index) => new Intl.DateTimeFormat(locale, { month: 'long' })
      .format(new Date(2024, index, 1))
  )

  const years = []
  for (
    let year = today.year - 20;
    year <= today.year + 30;
    year += 1
  ) {
    years.push(year)
  }

  const daysInMonth = new Date(
    visibleYear,
    visibleMonth,
    0
  ).getDate()

  const firstDay = new Date(
    visibleYear,
    visibleMonth - 1,
    1
  ).getDay()

  const previousMonth = () => {
    if (visibleMonth === 1) {
      setVisibleMonth(12)
      setVisibleYear((year) => year - 1)
    } else {
      setVisibleMonth((month) => month - 1)
    }
  }

  const nextMonth = () => {
    if (visibleMonth === 12) {
      setVisibleMonth(1)
      setVisibleYear((year) => year + 1)
    } else {
      setVisibleMonth((month) => month + 1)
    }
  }

  const selectDate = (day) => {
    const newDate = formatDateValue(
      visibleYear,
      visibleMonth,
      day
    )

    if (isDateOutsideBounds(newDate)) {
      return
    }

    if (typeof onChange === 'function') {
      onChange(newDate)
    }
  }

  const selectToday = () => {
    if (isDateOutsideBounds(todayValue)) {
      return
    }

    setVisibleYear(today.year)
    setVisibleMonth(today.month)

    if (typeof onChange === 'function') {
      onChange(todayValue)
    }
  }

  const selectMinDate = () => {
    if (!minDate || isDateOutsideBounds(minDate)) return
    const parsed = parseDateValue(minDate)
    if (parsed) {
      setVisibleYear(parsed.year)
      setVisibleMonth(parsed.month)
    }
    if (typeof onChange === 'function') {
      onChange(minDate)
    }
  }

  const clearDate = () => {
    if (typeof onChange === 'function') {
      onChange('')
    }
  }

  const formatDisplay = (dateValue) => {
    const parsed = parseDateValue(dateValue)
    if (!parsed) return t('noDateSelected')
    return new Date(parsed.year, parsed.month - 1, parsed.day).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }

  const getDisplayDate = () => formatDisplay(value)

  const calendarStyle = {
    width: '100%',
    maxWidth: '360px',
    border: '1px solid var(--fs-inline-border, #ddd6fe)',
    borderRadius: '12px',
    padding: '12px',
    background: 'var(--fs-inline-card, #ffffff)',
    boxSizing: 'border-box',
    boxShadow: '0 4px 14px rgba(53, 16, 120, 0.06)'
  }

  const headerStyle = {
    marginBottom: '10px',
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'linear-gradient(180deg, var(--fs-inline-tint, #f5f3ff) 0%, var(--fs-inline-tint-deep, #ede9fe) 100%)',
    border: '1px solid var(--fs-inline-border, #ddd6fe)'
  }

  const toolbarStyle = {
    display: 'grid',
    gridTemplateColumns: '38px 1fr 38px',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '10px'
  }

  const navButtonStyle = {
    height: '36px',
    border: '1px solid var(--fs-inline-border, #c4b5fd)',
    borderRadius: '8px',
    background: 'var(--fs-inline-card, #ffffff)',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#351078',
    fontWeight: 700
  }

  const selectRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 92px',
    gap: '6px'
  }

  const weekdayStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    textAlign: 'center',
    marginBottom: '4px'
  }

  const weekdayItemStyle = {
    padding: '4px 0',
    fontSize: '12px',
    fontWeight: '700',
    color: '#6b7280'
  }

  const daysStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '4px'
  }

  const dayButtonStyle = {
    width: '100%',
    aspectRatio: '1 / 1',
    minHeight: '34px',
    border: '1px solid transparent',
    borderRadius: '10px',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#111827'
  }

  const selectedDayStyle = {
    ...dayButtonStyle,
    background: '#351078',
    color: '#ffffff',
    fontWeight: '700',
    borderColor: '#351078',
    boxShadow: '0 2px 6px rgba(53,16,120,0.25)'
  }

  const actionButtonStyle = (primary = false, disabled = false) => ({
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    border: `1px solid ${primary ? '#351078' : '#c4b5fd'}`,
    borderRadius: '8px',
    background: primary ? '#351078' : '#ffffff',
    color: primary ? '#ffffff' : '#351078',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1
  })

  const canSelectToday = !isDateOutsideBounds(todayValue)
  const canSelectMin = Boolean(minDate) && !isDateOutsideBounds(minDate)

  const handleManualInput = (e) => {
    const next = e.target.value
    if (!next) {
      if (typeof onChange === 'function') onChange('')
      return
    }
    if (isDateOutsideBounds(next)) return
    const parsed = parseDateValue(next)
    if (parsed) {
      setVisibleYear(parsed.year)
      setVisibleMonth(parsed.month)
    }
    if (typeof onChange === 'function') onChange(next)
  }

  return (
    <div
      style={calendarStyle}
      role="group"
      aria-label={label}
    >
      <div style={headerStyle}>
        <div style={{ fontSize: '12px', color: '#6d28d9', fontWeight: 700, marginBottom: 2 }}>
          {t('collectionDate', 'Collection Date')}
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
          {getDisplayDate()}
        </div>
        <div style={{ marginTop: 6 }}>
          <input
            type="date"
            value={value || ''}
            min={minDate || undefined}
            max={maxDate || undefined}
            onChange={handleManualInput}
            aria-label={label}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid var(--fs-inline-border, #c4b5fd)',
              background: 'var(--fs-inline-card, #ffffff)',
              color: '#1f2937',
              fontSize: '14px'
            }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: '12px', color: '#5b6472' }}>
          {minDate || maxDate
            ? `${t('allowed', 'Allowed')}: ${minDate ? formatDisplay(minDate) : '—'} ${t('to', 'to')} ${maxDate ? formatDisplay(maxDate) : '—'}`
            : t('selectCollectionDate', 'Select a collection date')}
        </div>
      </div>

      <div style={toolbarStyle}>
        <button
          type="button"
          style={navButtonStyle}
          onClick={previousMonth}
          aria-label={t('previousMonth', 'Previous month')}
        >
          ‹
        </button>

        <div style={selectRowStyle}>
          <SelectMenu
            value={visibleMonth}
            onChange={(value) => setVisibleMonth(Number(value))}
            ariaLabel={t('month', 'Month')}
            variant="compact"
            options={monthNames.map((month, index) => ({
              value: index + 1,
              label: month
            }))}
          />

          <SelectMenu
            value={visibleYear}
            onChange={(value) => setVisibleYear(Number(value))}
            ariaLabel={t('year', 'Year')}
            variant="compact"
            options={years.map((year) => ({
              value: year,
              label: String(year)
            }))}
          />
        </div>

        <button
          type="button"
          style={navButtonStyle}
          onClick={nextMonth}
          aria-label={t('nextMonth', 'Next month')}
        >
          ›
        </button>
      </div>

      <div style={weekdayStyle}>
        {Array.from({ length: 7 }, (_, index) =>
          new Intl.DateTimeFormat(locale, { weekday: 'short' })
            .format(new Date(2023, 0, index + 1))
        ).map((day, index) => (
          <div key={`${day}-${index}`} style={weekdayItemStyle}>
            {day}
          </div>
        ))}
      </div>

      <div style={daysStyle}>
        {Array.from({ length: firstDay }, (_, index) => (
          <div key={`empty-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const dateValue = formatDateValue(visibleYear, visibleMonth, day)
          const isSelected = value === dateValue
          const isDisabled = isDateOutsideBounds(dateValue)
          const isToday = dateValue === todayValue

          return (
            <button
              key={dateValue}
              type="button"
              disabled={isDisabled}
              title={isToday ? t('today') : undefined}
              style={
                isSelected
                  ? selectedDayStyle
                  : isDisabled
                    ? {
                        ...dayButtonStyle,
                        color: '#cbd5e1',
                        cursor: 'not-allowed',
                        background: 'var(--fs-inline-soft, #f8fafc)'
                      }
                    : {
                        ...dayButtonStyle,
                        borderColor: isToday ? '#a78bfa' : 'transparent',
                        background: isToday ? 'var(--fs-inline-tint, #f5f3ff)' : 'transparent',
                        fontWeight: isToday ? 700 : 400
                      }
              }
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                selectDate(day)
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !isDisabled) {
                  e.currentTarget.style.background = 'var(--fs-inline-tint, #eef2ff)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !isDisabled) {
                  e.currentTarget.style.background = isToday
                    ? 'var(--fs-inline-tint, #f5f3ff)'
                    : 'transparent'
                }
              }}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={actionButtonStyle(true, !canSelectToday)}
          disabled={!canSelectToday}
          onClick={(event) => {
            event.preventDefault()
            selectToday()
          }}
        >
          {t('today')}
        </button>

        {minDate && (
          <button
            type="button"
            style={actionButtonStyle(false, !canSelectMin)}
            disabled={!canSelectMin}
            onClick={(event) => {
              event.preventDefault()
              selectMinDate()
            }}
          >
            {t('earliestAllowed', 'Earliest')}
          </button>
        )}

        <button
          type="button"
          style={actionButtonStyle(false, false)}
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