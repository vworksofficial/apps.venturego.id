export type FullCoverBudget = {
  version: 2
  languageMonths: number
  skillMonths: number
  registrationMcuAmount: number
  languageTuitionTotal: number
  languageAllowanceMonthly: number
  skillTrainingAmount: number
  skillAllowanceMonthly: number
  departureAllowanceAmount: number
}

type LegacyFullCoverBudget = Omit<FullCoverBudget, 'version' | 'languageTuitionTotal'> & {
  version: 1
  languageTuitionMonthly: number
}

export type FullCoverBudgetTotals = {
  languageTuitionTotal: number
  languageAllowanceTotal: number
  skillAllowanceTotal: number
  providerTotal: number
  studentAllowanceTotal: number
  nafaqahTotal: number
  lines: { label: string; recipient: string; amount: number; note?: string }[]
}

export const FULL_COVER_BUDGET_DEFAULTS = {
  languageAllowanceMonthly: 1_000_000,
  skillAllowanceMonthly: 1_000_000,
  departureAllowanceAmount: 3_300_000,
} as const

const isSafeAmount = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000_000

export const normalizeFullCoverBudget = (value: unknown): FullCoverBudget | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.version === 2) return value as FullCoverBudget
  if (input.version === 1) {
    const months = Number(input.languageMonths)
    const tuitionMonthly = Number(input.languageTuitionMonthly)
    if (!Number.isSafeInteger(months) || !isSafeAmount(tuitionMonthly)) return null
    return {
      version: 2,
      languageMonths: months,
      skillMonths: Number(input.skillMonths),
      registrationMcuAmount: Number(input.registrationMcuAmount),
      languageTuitionTotal: tuitionMonthly * months,
      languageAllowanceMonthly: Number(input.languageAllowanceMonthly),
      skillTrainingAmount: Number(input.skillTrainingAmount),
      skillAllowanceMonthly: Number(input.skillAllowanceMonthly),
      departureAllowanceAmount: Number(input.departureAllowanceAmount),
    }
  }
  return null
}

export const createFullCoverBudget = (
  input: Partial<FullCoverBudget>,
  durations: { languageMonths: number; skillMonths: number },
): FullCoverBudget => ({
  version: 2,
  languageMonths: durations.languageMonths,
  skillMonths: durations.skillMonths,
  registrationMcuAmount: Number(input.registrationMcuAmount) || 0,
  languageTuitionTotal: Number(input.languageTuitionTotal) || 0,
  languageAllowanceMonthly:
    input.languageAllowanceMonthly === undefined
      ? FULL_COVER_BUDGET_DEFAULTS.languageAllowanceMonthly
      : Number(input.languageAllowanceMonthly) || 0,
  skillTrainingAmount: Number(input.skillTrainingAmount) || 0,
  skillAllowanceMonthly:
    input.skillAllowanceMonthly === undefined
      ? FULL_COVER_BUDGET_DEFAULTS.skillAllowanceMonthly
      : Number(input.skillAllowanceMonthly) || 0,
  departureAllowanceAmount:
    input.departureAllowanceAmount === undefined
      ? FULL_COVER_BUDGET_DEFAULTS.departureAllowanceAmount
      : Number(input.departureAllowanceAmount) || 0,
})

export const validateFullCoverBudget = (value: unknown, requireComplete = true): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Isi rincian enam komponen kebutuhan Full Cover pada tab Budgeting.'
  }
  const raw = value as Record<string, unknown>
  const budget = normalizeFullCoverBudget(value)
  const amountFields = [
    'registrationMcuAmount',
    'languageTuitionTotal',
    'languageAllowanceMonthly',
    'skillTrainingAmount',
    'skillAllowanceMonthly',
    'departureAllowanceAmount',
  ] as const
  const versionFields = raw.version === 1 ? ['languageTuitionMonthly'] : ['languageTuitionTotal']
  const allowedFields = new Set([
    'version',
    'languageMonths',
    'skillMonths',
    ...versionFields,
    'registrationMcuAmount',
    'languageAllowanceMonthly',
    'skillTrainingAmount',
    'skillAllowanceMonthly',
    'departureAllowanceAmount',
  ])
  if (
    !budget ||
    Object.keys(raw).some((field) => !allowedFields.has(field)) ||
    !Number.isInteger(budget.languageMonths) ||
    budget.languageMonths < 1 ||
    budget.languageMonths > 60 ||
    !Number.isInteger(budget.skillMonths) ||
    budget.skillMonths < 1 ||
    budget.skillMonths > 60 ||
    amountFields.some((field) => !isSafeAmount(budget[field]))
  )
    return 'Rincian nominal Full Cover tidak valid. Periksa seluruh nominal dan durasi pelatihan.'
  if (requireComplete && amountFields.some((field) => budget[field] <= 0)) {
    return 'Lengkapi seluruh komponen kebutuhan Full Cover dengan nominal lebih dari Rp0 sebelum menyetujui.'
  }
  const totals = calculateFullCoverBudget(budget)
  if (
    !Number.isSafeInteger(totals.nafaqahTotal) ||
    totals.nafaqahTotal > 10_000_000_000 ||
    (requireComplete && totals.nafaqahTotal <= 0)
  ) {
    return 'Total kebutuhan Full Cover melebihi batas nominal yang dapat diproses.'
  }
  return null
}

export const calculateFullCoverBudget = (
  input: FullCoverBudget | LegacyFullCoverBudget,
): FullCoverBudgetTotals => {
  const budget =
    normalizeFullCoverBudget(input) ??
    createFullCoverBudget({}, { languageMonths: 0, skillMonths: 0 })
  const languageTuitionTotal = budget.languageTuitionTotal
  const languageAllowanceTotal = budget.languageAllowanceMonthly * budget.languageMonths
  const skillAllowanceTotal = budget.skillAllowanceMonthly * budget.skillMonths
  const providerTotal =
    budget.registrationMcuAmount + languageTuitionTotal + budget.skillTrainingAmount
  const studentAllowanceTotal =
    languageAllowanceTotal + skillAllowanceTotal + budget.departureAllowanceAmount
  const nafaqahTotal = providerTotal + studentAllowanceTotal
  return {
    languageTuitionTotal,
    languageAllowanceTotal,
    skillAllowanceTotal,
    providerTotal,
    studentAllowanceTotal,
    nafaqahTotal,
    lines: [
      {
        label: 'Biaya pendaftaran dan Medical Check Up (MCU)',
        recipient: 'Klinik/rumah sakit yang ditunjuk',
        amount: budget.registrationMcuAmount,
      },
      {
        label: `Pendidikan Bahasa Jepang Tahap 1 (${budget.languageMonths} bulan)`,
        recipient: 'LPK mitra',
        amount: languageTuitionTotal,
      },
      {
        label: `Uang saku Pendidikan Bahasa Jepang Tahap 1 (${budget.languageMonths} bulan)`,
        recipient: 'Siswa',
        amount: languageAllowanceTotal,
        note: `${formatRupiah(budget.languageAllowanceMonthly)} per bulan`,
      },
      {
        label: 'Pelatihan Skill Kerja Tahap 2 dan pengurusan dokumen',
        recipient: 'LPK mitra',
        amount: budget.skillTrainingAmount,
        note: 'Termasuk paspor, visa, COE, tiket, pendampingan, dan pemantapan pra-keberangkatan',
      },
      {
        label: `Uang saku Pelatihan Skill Kerja Tahap 2 (${budget.skillMonths} bulan)`,
        recipient: 'Siswa',
        amount: skillAllowanceTotal,
        note: `${formatRupiah(budget.skillAllowanceMonthly)} per bulan`,
      },
      {
        label: 'Uang saku keberangkatan ke Jepang (disalurkan setelah COE terbit)',
        recipient: 'Siswa',
        amount: budget.departureAllowanceAmount,
      },
    ],
  }
}

export const formatRupiah = (value: number) => `Rp${value.toLocaleString('id-ID')}`
