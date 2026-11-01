export function generateCustomerId() {
  const time = Date.now()
    .toString()
    .slice(-6)

  const random = Math.floor(
    100 + Math.random() * 900
  )

  return `CUS${time}${random}`
}
