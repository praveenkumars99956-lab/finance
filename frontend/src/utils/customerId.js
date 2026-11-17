function randomDigits(count) {
  const max = 10 ** count

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    return String(buffer[0] % max).padStart(count, '0')
  }

  return String(Math.floor(Math.random() * max)).padStart(count, '0')
}

export function generateCustomerId() {
  const time = Date.now()
    .toString()
    .slice(-4)

  return `CUS${time}${randomDigits(5)}`
}
