type LifecycleApplication = {
  status?: unknown
  financialPlan?: unknown
  paidInstallments?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** True when an earlier application still prevents another program from starting. */
export function blocksAdditionalProgram(application: LifecycleApplication): boolean {
  const status = typeof application.status === 'string' ? application.status : 'SUBMITTED'
  const financialPlan = asRecord(application.financialPlan)
  const schedule = Array.isArray(financialPlan.schedule) ? financialPlan.schedule : []
  const paidInstallments = new Set(
    Array.isArray(application.paidInstallments)
      ? application.paidInstallments.filter(
          (installment): installment is number => Number.isInteger(installment) && installment > 0,
        )
      : [],
  )
  const validSchedule = schedule.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const installment = Number((entry as Record<string, unknown>).installment)
    const amount = Number((entry as Record<string, unknown>).amount)
    return Number.isInteger(installment) &&
      installment > 0 &&
      Number.isSafeInteger(amount) &&
      amount >= 0
      ? [{ installment, amount }]
      : []
  })

  if (validSchedule.length > 0) {
    const paidAmount = validSchedule.reduce(
      (total, entry) => total + (paidInstallments.has(entry.installment) ? entry.amount : 0),
      0,
    )
    const totalObligation = financialPlan.totalObligation
    const obligationCovered =
      typeof totalObligation !== 'number' || !Number.isSafeInteger(totalObligation)
        ? true
        : paidAmount >= totalObligation
    return (
      validSchedule.length !== schedule.length ||
      !validSchedule.every((entry) => paidInstallments.has(entry.installment)) ||
      !obligationCovered
    )
  }

  if (status === 'COMPLETED') return false
  if (status === 'REJECTED' || status === 'CANCELLED') {
    const totalObligation = financialPlan.totalObligation
    return typeof totalObligation === 'number' && Number.isSafeInteger(totalObligation)
      ? totalObligation > 0
      : false
  }

  return true
}
