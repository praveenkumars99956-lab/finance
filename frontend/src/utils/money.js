const LOCALE_BY_LANGUAGE = {
  en: 'en-IN',
  ta: 'ta-IN',
  hi: 'hi-IN',
  ml: 'ml-IN'
}

export function formatMoney(value, language = 'en') {
  const locale = LOCALE_BY_LANGUAGE[language] || 'en-IN'

  return Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}
