import {
  calculateFullCoverBudget,
  calculateFullCoverCharges,
  normalizeFullCoverBudget,
} from '@/lib/full-cover-budget'

export type InstallmentScheduleRow = {
  installment: number
  dueDate: string
  amount: number
}

const asSafeInteger = (value: unknown) => {
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

/** Resolve the same installment amounts for the applicant UI and payment-proof API. */
export function resolveInstallmentSchedule(
  product: unknown,
  financialPlan: Record<string, unknown>,
): InstallmentScheduleRow[] {
  const isFullCover = product === 'FULL_COVER'
  const savedRows = Array.isArray(financialPlan.schedule)
    ? financialPlan.schedule.flatMap((value): InstallmentScheduleRow[] => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const row = value as Record<string, unknown>
        const installment = asSafeInteger(row.installment)
        const amount = asSafeInteger(row.amount)
        if (
          !installment ||
          installment < 1 ||
          installment > 36 ||
          amount === null ||
          amount < 1 ||
          typeof row.dueDate !== 'string'
        ) {
          return []
        }
        return [{ installment, dueDate: row.dueDate, amount }]
      })
    : []
  const savedByInstallment = new Map(savedRows.map((row) => [row.installment, row]))
  const savedCount = savedRows.reduce((count, row) => Math.max(count, row.installment), 0)
  const termsCount = asSafeInteger(
    isFullCover || product === 'ALUMNI_FINANCING'
      ? financialPlan.tenorMonths
      : financialPlan.installmentCount,
  )
  const count = Math.min(36, Math.max(savedCount, termsCount ?? 0))
  if (count < 1) return []
  if (
    savedCount === count &&
    savedRows.length === count &&
    Array.from({ length: count }, (_, index) => savedByInstallment.has(index + 1)).every(Boolean)
  ) {
    return Array.from({ length: count }, (_, index) => savedByInstallment.get(index + 1)!)
  }

  const normalizedBudget = isFullCover
    ? normalizeFullCoverBudget(financialPlan.fullCoverBudget)
    : null
  const fullCoverBudget = normalizedBudget ? calculateFullCoverBudget(normalizedBudget) : null
  const fullCoverCharges = fullCoverBudget
    ? calculateFullCoverCharges(fullCoverBudget.nafaqahTotal)
    : null
  const fullCoverUjrah =
    asSafeInteger(financialPlan.ujrahTotal) || fullCoverCharges?.ujrahTotal || 0
  const fullCoverJuala =
    asSafeInteger(financialPlan.jualaTotal) || fullCoverCharges?.jualaTotal || 0
  const fullCoverObligation =
    asSafeInteger(financialPlan.totalObligation) ||
    (fullCoverBudget ? fullCoverBudget.nafaqahTotal + fullCoverUjrah : 0)
  const total = isFullCover
    ? asSafeInteger(financialPlan.totalObligationIfCoe) || fullCoverObligation + fullCoverJuala
    : (asSafeInteger(financialPlan.totalObligation) ?? 0)
  if (total < 1) return []

  const regularAmount =
    asSafeInteger(
      isFullCover
        ? financialPlan.monthlyInstallmentAfterCoe
        : financialPlan.monthlyInstallmentAmount,
    ) || Math.floor(total / count)
  const fallbackFinalAmount = isFullCover
    ? asSafeInteger(financialPlan.finalInstallmentAfterCoe) || regularAmount
    : total - regularAmount * (count - 1)
  if (regularAmount < 1 || fallbackFinalAmount < 1) return []

  return Array.from({ length: count }, (_, index) => {
    const installment = index + 1
    const saved = savedByInstallment.get(installment)
    return {
      installment,
      dueDate: saved?.dueDate ?? '',
      amount: saved?.amount ?? (installment === count ? fallbackFinalAmount : regularAmount),
    }
  })
}
