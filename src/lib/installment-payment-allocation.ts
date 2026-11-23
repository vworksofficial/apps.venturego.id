type InstallmentRow = { installment: number; amount: number }

type ExistingInstallmentPayment = {
  status?: unknown
  installmentNumber?: unknown
  amount?: unknown
}

export type InstallmentAllocation = { installmentNumber: number; amount: number }

export function allocateInstallmentPayment(
  schedule: InstallmentRow[],
  paidInstallments: Iterable<number>,
  payments: ExistingInstallmentPayment[],
  amount: number,
  startingInstallment: number,
): InstallmentAllocation[] | null {
  if (!Number.isSafeInteger(amount) || amount < 1) return null

  const paidSet = new Set(paidInstallments)
  const paidByInstallment = new Map<number, number>()
  for (const payment of payments) {
    if (payment.status !== 'PAID') continue
    const installmentNumber = Number(payment.installmentNumber)
    const paidAmount = Number(payment.amount)
    if (
      Number.isSafeInteger(installmentNumber) &&
      Number.isSafeInteger(paidAmount) &&
      paidAmount > 0
    ) {
      paidByInstallment.set(
        installmentNumber,
        (paidByInstallment.get(installmentNumber) ?? 0) + paidAmount,
      )
    }
  }

  const firstUnpaid = schedule.find((row) => {
    const scheduledAmount = Number(row.amount)
    const alreadyPaid = paidSet.has(row.installment)
      ? scheduledAmount
      : Math.min(scheduledAmount, paidByInstallment.get(row.installment) ?? 0)
    return scheduledAmount > alreadyPaid
  })
  if (!firstUnpaid || firstUnpaid.installment !== startingInstallment) return null

  let remaining = amount
  const allocations: InstallmentAllocation[] = []
  for (const row of schedule) {
    if (row.installment < startingInstallment || remaining === 0) continue
    const scheduledAmount = Number(row.amount)
    if (!Number.isSafeInteger(scheduledAmount) || scheduledAmount < 1) return null
    const alreadyPaid = paidSet.has(row.installment)
      ? scheduledAmount
      : Math.min(scheduledAmount, paidByInstallment.get(row.installment) ?? 0)
    const outstanding = Math.max(0, scheduledAmount - alreadyPaid)
    if (outstanding === 0) continue
    const allocatedAmount = Math.min(remaining, outstanding)
    allocations.push({ installmentNumber: row.installment, amount: allocatedAmount })
    remaining -= allocatedAmount
  }

  return remaining === 0 ? allocations : null
}
