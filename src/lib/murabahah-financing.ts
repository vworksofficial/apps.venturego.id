export type AlumniBusinessSector =
  | 'PETERNAKAN'
  | 'PERTANIAN'
  | 'PERIKANAN'
  | 'PERDAGANGAN'
  | 'JASA'
  | 'BENGKEL'
  | 'KULINER'
  | 'LAINNYA'

export const ALUMNI_BUSINESS_SECTOR_LABELS: Record<AlumniBusinessSector, string> = {
  PETERNAKAN: 'Peternakan',
  PERTANIAN: 'Pertanian & Perkebunan',
  PERIKANAN: 'Perikanan & Tambak',
  PERDAGANGAN: 'Perdagangan & Toko / Grosir',
  JASA: 'Jasa & Layanan Mandiri',
  BENGKEL: 'Bengkel & Otomotif / Las',
  KULINER: 'Kuliner, Makanan & Minuman',
  LAINNYA: 'Sektor Usaha Lainnya',
}

export type ItemProcurementPlan = {
  itemName: string
  specification?: string
  estimatedCost: number
}

export type AlumniBusinessDetails = {
  businessName: string
  businessSector: AlumniBusinessSector
  businessAddress: string
  businessCity?: string
  businessProvince?: string
  businessDescription?: string
  disbursementBank?: {
    bankName: string
    accountNumber: string
    accountHolderName: string
  }
}

export type PhysicalDocumentsReceipt = {
  receivedAt: string | null
  receivedBy: string | null
  receiptNumber: string | null
  items: {
    ktpAsli: boolean
    kkAsli: boolean
    aktaLahirAsli: boolean
    ijazahSdAsli: boolean
    ijazahSmpAsli: boolean
    ijazahSmaAsli: boolean
  }
  storageLocation: string | null
  returnedAt: string | null
  returnedTo: string | null
}

export type MurabahahScheduleRow = {
  installment: number
  dueDate: string // YYYY-MM-25
  amount: number
  remainingBalance: number
}

export type MurabahahFinancialPlan = {
  contractType: 'MURABAHAH'
  pricingStatus: 'ESTIMATED' | 'AGREED'
  contractNumber?: string
  itemProcurementPlan: ItemProcurementPlan[]
  principal: number // Tsaman (Harga Beli Barang)
  adminFeePercentage: number // Default 3%
  adminFeeAmount: number // 3% x Tsaman
  netDisbursedAmount: number // Tsaman - adminFeeAmount
  marginAmount: number // Ribh (Keuntungan VentureGo)
  totalObligation: number // Tsaman + marginAmount
  tenorMonths: number // Tenor cicilan
  monthlyInstallment: number // Angsuran per bulan
  firstInstallmentAmount?: number
  finalInstallmentAmount?: number
  dueDateDayOfMonth: 25 // Tanggal 25 setiap bulan
  startDate?: string
  firstPaymentDate?: string
  schedule: MurabahahScheduleRow[]
  settlementNotes?: string
  akadDocument?: {
    driveFileId?: string
    issuedAt?: string
    contractNumber?: string
    reference?: string
  }
}

const ROMAN_MONTHS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const

export function toRomanMonth(monthIndexZeroBased: number): string {
  return ROMAN_MONTHS[Math.max(0, Math.min(11, monthIndexZeroBased))] ?? 'I'
}

/**
 * Format nomor akad resmi Murabahah:
 * Contoh: 014/MRB-JPN/VSV-WSB/VIII/2026
 */
export function buildMurabahahContractNumber(
  sequenceNumber: number,
  destinationCode: string = 'JPN',
  date: Date = new Date(),
): string {
  const seq = String(sequenceNumber).padStart(3, '0')
  const country = destinationCode.toUpperCase()
  const romanMonth = toRomanMonth(date.getMonth())
  const year = date.getFullYear()
  return `${seq}/MRB-${country}/VSV-WSB/${romanMonth}/${year}`
}

export type CalculateMurabahahParams = {
  principal: number // Tsaman
  marginAmount: number // Ribh
  tenorMonths: number // 6, 12, 18, 24
  adminFeePercentage?: number // Default 3
  startDate?: string // YYYY-MM-DD
  firstPaymentDate?: string // YYYY-MM-25
  itemProcurementPlan?: ItemProcurementPlan[]
}

/**
 * Kalkulasi baku finansial Murabahah sesuai naskah kerjasama PT Vworks.
 */
export function calculateMurabahahFinancials(
  params: CalculateMurabahahParams,
): MurabahahFinancialPlan {
  const principal = Math.max(0, Math.round(Number(params.principal) || 0))
  const marginAmount = Math.max(0, Math.round(Number(params.marginAmount) || 0))
  const tenorMonths = Math.max(1, Math.min(36, Math.round(Number(params.tenorMonths) || 12)))
  const adminFeePercentage =
    typeof params.adminFeePercentage === 'number' && Number.isFinite(params.adminFeePercentage)
      ? Math.max(0, params.adminFeePercentage)
      : 3
  const adminFeeAmount = Math.round((principal * adminFeePercentage) / 100)
  const netDisbursedAmount = Math.max(0, principal - adminFeeAmount)
  const totalObligation = principal + marginAmount

  const regularInstallment = Math.floor(totalObligation / tenorMonths)
  const finalInstallment = totalObligation - regularInstallment * (tenorMonths - 1)

  // Tentukan tanggal angsuran pertama (jatuh tempo tgl 25)
  let startYear = new Date().getFullYear()
  let startMonth = new Date().getMonth() + 1 // 1-12
  if (params.firstPaymentDate && /^\d{4}-\d{2}-\d{2}$/.test(params.firstPaymentDate)) {
    const parts = params.firstPaymentDate.split('-').map(Number)
    if (parts[0] && parts[1]) {
      startYear = parts[0]
      startMonth = parts[1]
    }
  } else if (params.startDate && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate)) {
    const parts = params.startDate.split('-').map(Number)
    if (parts[0] && parts[1]) {
      startYear = parts[0]
      startMonth = parts[1] + 1
      if (startMonth > 12) {
        startMonth = 1
        startYear += 1
      }
    }
  }

  let remaining = totalObligation
  const schedule: MurabahahScheduleRow[] = []

  for (let i = 1; i <= tenorMonths; i++) {
    let year = startYear
    let month = startMonth + (i - 1)
    while (month > 12) {
      month -= 12
      year += 1
    }
    const dueDate = `${year}-${String(month).padStart(2, '0')}-25`
    const amount = i === tenorMonths ? finalInstallment : regularInstallment
    remaining = Math.max(0, remaining - amount)

    schedule.push({
      installment: i,
      dueDate,
      amount,
      remainingBalance: remaining,
    })
  }

  return {
    contractType: 'MURABAHAH',
    pricingStatus: 'ESTIMATED',
    itemProcurementPlan: params.itemProcurementPlan ?? [],
    principal,
    adminFeePercentage,
    adminFeeAmount,
    netDisbursedAmount,
    marginAmount,
    totalObligation,
    tenorMonths,
    monthlyInstallment: regularInstallment,
    firstInstallmentAmount: regularInstallment,
    finalInstallmentAmount: finalInstallment,
    dueDateDayOfMonth: 25,
    startDate: params.startDate,
    firstPaymentDate: schedule[0]?.dueDate,
    schedule,
  }
}
