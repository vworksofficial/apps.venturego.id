import type { FinancingApplicationRecord } from './firebase-data'

export type TransferBreakdown = {
  principal: number
  adminFee: number
  netAmount: number
  invoiceLpk: number
  cilAmount: number
  pocketMoney: number
  transportAmplop: number
  lpkBank: string
  lpkAccountName: string
  lpkAccountNumber: string
  applicantBank: string
  applicantAccountNumber: string
  applicantAccountName: string
}

export function formatThousandsNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('id-ID')
}

export function getTransferBreakdown(app: FinancingApplicationRecord): TransferBreakdown {
  const plan = app.financialPlan ?? {}
  const personal = (app.personalDetails ?? {}) as Record<string, unknown>
  const bankAccounts = (personal.bankAccounts ?? {}) as {
    applicant?: Record<string, unknown>
    lpk?: Record<string, unknown>
  }
  const departure = (app.departureDetails ?? {}) as Record<string, unknown>

  const planPrincipal = Number(plan.principal)
  const departurePrincipal = Number(departure.requestedFinancingAmount)
  const principal =
    Number.isSafeInteger(planPrincipal) && planPrincipal > 0
      ? planPrincipal
      : Number.isSafeInteger(departurePrincipal) && departurePrincipal > 0
        ? departurePrincipal
        : 0

  const adminFee = Math.round(principal * 0.05)
  const netAmount = Math.max(0, principal - adminFee)

  const savedInvoice = Number(plan.hppLpkInvoiceAmount)
  const departureInvoice = Number(departure.outstandingLPKAmount)
  const invoiceLpk =
    Number.isSafeInteger(savedInvoice) && savedInvoice >= 0
      ? savedInvoice
      : Number.isSafeInteger(departureInvoice) && departureInvoice >= 0
        ? departureInvoice
        : 0

  const savedPocketMoney = Number(plan.hppPocketMoneyAmount)
  const pocketMoney =
    Number.isSafeInteger(savedPocketMoney) && savedPocketMoney >= 0
      ? savedPocketMoney
      : Math.max(0, netAmount - invoiceLpk)

  // 2% dari plafon untuk Transport+Amplop petugas penandatanganan akad
  const transportAmplop = Math.round(principal * 0.02)

  const lpkBank = String(bankAccounts.lpk?.bankName ?? '').trim()
  const lpkAccountName = String(bankAccounts.lpk?.accountName ?? '').trim()
  const lpkAccountNumber = String(bankAccounts.lpk?.accountNumber ?? '').trim()

  const applicantBank = String(bankAccounts.applicant?.bankName ?? '').trim()
  const applicantAccountNumber = String(bankAccounts.applicant?.accountNumber ?? '').trim()
  const applicantAccountName = String(bankAccounts.applicant?.accountName ?? '').trim()

  return {
    principal,
    adminFee,
    netAmount,
    invoiceLpk,
    cilAmount: 0,
    pocketMoney,
    transportAmplop,
    lpkBank,
    lpkAccountName,
    lpkAccountNumber,
    applicantBank,
    applicantAccountNumber,
    applicantAccountName,
  }
}

/**
 * Menghasilkan format pesan teks WhatsApp untuk finance / tim transfer
 * Contoh:
 * 29. Dimas Pranaika Putra
 *
 * Plafon
 * 33.000.000
 * Biaya Administrasi 5%
 *
 * Jumlah cair
 * 31.350.000
 *
 * Pembagian
 * Transfer SO
 * BRI LPK CAHAYA MANDIRI INDONESIA
 * 033401001355306
 * Jumlah 27.500.000
 * Ket. Dimas Pranaika Putra
 *
 * Transfer CIL
 * BRI 014901002149569
 * LPK CAHAYA INDONESIA LANGGENG
 * Jumlah 0
 * Ket.
 *
 * Transfer Siswa
 * 2059015299 BNI
 * Ket. Dimas Pranaika Putra
 * Jumlah Rp3.850.000
 *
 * Transfer Transport+Amplop
 * Jenius SMBC Indonesia
 * 90020422216
 * Jumlah 660.000
 * Panut
 */
export function buildTransferWhatsappMessage(
  app: FinancingApplicationRecord,
  index: number,
): string {
  const breakdown = getTransferBreakdown(app)

  // Format Baris Transfer SO (LPK Mitra)
  const lpkHeader =
    [breakdown.lpkBank, breakdown.lpkAccountName || (app.lpkName ? `LPK ${app.lpkName}` : '')]
      .filter(Boolean)
      .join(' ') || (app.lpkName ? `LPK ${app.lpkName}` : 'Rekening LPK')
  const lpkNumber = breakdown.lpkAccountNumber || '....................'

  // Format Baris Transfer Siswa
  const studentBankLine =
    [breakdown.applicantAccountNumber, breakdown.applicantBank].filter(Boolean).join(' ') ||
    '....................'

  const lines = [
    `${index + 1}. ${app.applicantName}`,
    '',
    'Plafon',
    formatThousandsNumber(breakdown.principal),
    'Biaya Administrasi 5%',
    '',
    'Jumlah cair',
    formatThousandsNumber(breakdown.netAmount),
    '',
    'Pembagian',
    'Transfer SO',
    lpkHeader,
    lpkNumber,
    `Jumlah ${formatThousandsNumber(breakdown.invoiceLpk)}`,
    `Ket. ${app.applicantName}`,
    '',
    'Transfer CIL',
    'BRI 014901002149569',
    'LPK CAHAYA INDONESIA LANGGENG',
    `Jumlah ${formatThousandsNumber(breakdown.cilAmount)}`,
    'Ket.',
    '',
    'Transfer Siswa ',
    studentBankLine,
    `Ket. ${app.applicantName}`,
    `Jumlah Rp${formatThousandsNumber(breakdown.pocketMoney)}`,
    '',
    'Transfer Transport+Amplop',
    'Jenius SMBC Indonesia',
    '90020422216',
    `Jumlah ${formatThousandsNumber(breakdown.transportAmplop)}`,
    'Panut',
  ]

  return lines.join('\n')
}
