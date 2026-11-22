import type { FinancingApplicationRecord } from './firebase-data'

export type AdditionalRecipient = {
  id: string
  title: string
  bank: string
  accountName: string
  accountNumber: string
  amount: number
  notes: string
}

export type TransferDetailsState = {
  principal: number
  adminFee: number
  adminVworks: number
  adminOperasional: number
  lpkAmount: number
  lpkBank: string
  lpkAccountName: string
  lpkAccountNumber: string
  lpkNotes: string
  additionalRecipients: AdditionalRecipient[]
  pocketMoney: number
  applicantBank: string
  applicantAccountName: string
  applicantAccountNumber: string
  applicantNotes: string
  operasionalBank: string
  operasionalAccountNumber: string
  operasionalRecipientName: string
}

export function formatThousandsNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('id-ID')
}

export function parseThousandsInput(value: string): number {
  return Number(value.replace(/\D/g, '')) || 0
}

export function createInitialTransferState(app: FinancingApplicationRecord): TransferDetailsState {
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
  const adminVworks = Math.round(adminFee * 0.6)
  const adminOperasional = adminFee - adminVworks
  const netAmount = Math.max(0, principal - adminFee)

  const savedInvoice = Number(plan.hppLpkInvoiceAmount)
  const departureInvoice = Number(departure.outstandingLPKAmount)
  const lpkAmount =
    Number.isSafeInteger(savedInvoice) && savedInvoice >= 0
      ? savedInvoice
      : Number.isSafeInteger(departureInvoice) && departureInvoice >= 0
        ? departureInvoice
        : 0

  const savedPocketMoney = Number(plan.hppPocketMoneyAmount)
  const pocketMoney =
    Number.isSafeInteger(savedPocketMoney) && savedPocketMoney >= 0
      ? savedPocketMoney
      : Math.max(0, netAmount - lpkAmount)

  const lpkBank = String(bankAccounts.lpk?.bankName ?? '').trim()
  const lpkAccountName =
    String(bankAccounts.lpk?.accountName ?? '').trim() ||
    (app.lpkName ? `LPK ${app.lpkName}` : 'LPK Mitra')
  const lpkAccountNumber = String(bankAccounts.lpk?.accountNumber ?? '').trim()

  const applicantBank = String(bankAccounts.applicant?.bankName ?? '').trim()
  const applicantAccountNumber = String(bankAccounts.applicant?.accountNumber ?? '').trim()
  const applicantAccountName =
    String(bankAccounts.applicant?.accountName ?? '').trim() || app.applicantName

  return {
    principal,
    adminFee,
    adminVworks,
    adminOperasional,
    lpkAmount,
    lpkBank,
    lpkAccountName,
    lpkAccountNumber,
    lpkNotes: app.applicantName,
    additionalRecipients: [],
    pocketMoney,
    applicantBank,
    applicantAccountName,
    applicantAccountNumber,
    applicantNotes: `Uang Saku ${app.applicantName}`,
    operasionalBank: 'Jenius SMBC Indonesia',
    operasionalAccountNumber: '90020422216',
    operasionalRecipientName: 'Panut',
  }
}

/**
 * Menghasilkan format pesan WhatsApp resmi untuk finance / tukang transfer:
 *
 * 29. Dimas Pranaika Putra
 *
 * *PLAFON PEMBIAYAAN*
 * Rp33.000.000
 *
 * *Jasa Administrasi 5%*
 * Rp1.650.000
 * _*Alokasi*_
 * - Rp990.000 (PT Vworks Kolaborasi Bersama)
 * - Rp660.000 (Operasional Pencairan)
 *
 * *Sisa Beban LPK*
 * Rp27.500.000
 * BRI. LPK CAHAYA MANDIRI INDONESIA
 * 033401001355306
 * Ket. Dimas Pranaika Putra
 *
 * *Uang Saku Siswa (Nafaqah)*
 * Rp3.850.000
 * BNI. Dimas Pranaika Putra
 * 2059015299
 * Ket. Uang Saku Dimas Pranaika Putra
 *
 * Notes:
 * *Operasional Pencairan*
 * Rp660.000
 * Jenius SMBC Indonesia
 * 90020422216
 * Panut
 */
export function buildDepartureTransferWhatsappMessage(
  studentNumberOrIndex: string | number,
  applicantName: string,
  state: TransferDetailsState,
): string {
  const lpkBankAndName = [state.lpkBank, state.lpkAccountName].filter(Boolean).join('. ') || 'LPK'
  const applicantBankAndName =
    [state.applicantBank, state.applicantAccountName].filter(Boolean).join('. ') || applicantName

  const lines: string[] = [
    `${studentNumberOrIndex}. ${applicantName}`,
    '',
    '*PLAFON PEMBIAYAAN*',
    `Rp${formatThousandsNumber(state.principal)}`,
    '',
    '*Jasa Administrasi 5%*',
    `Rp${formatThousandsNumber(state.adminFee)}`,
    '_*Alokasi*_',
    `- Rp${formatThousandsNumber(state.adminVworks)} (PT Vworks Kolaborasi Bersama)`,
    `- Rp${formatThousandsNumber(state.adminOperasional)} (Operasional Pencairan)`,
    '',
    '*Sisa Beban LPK*',
    `Rp${formatThousandsNumber(state.lpkAmount)}`,
    lpkBankAndName,
    state.lpkAccountNumber || '....................',
    `Ket. ${state.lpkNotes || applicantName}`,
  ]

  // Tambahkan penerima komisi / LPK lain jika ada
  for (const recipient of state.additionalRecipients) {
    const bankAndName =
      [recipient.bank, recipient.accountName].filter(Boolean).join('. ') || 'Penerima'
    lines.push(
      '',
      `*${recipient.title || 'Pencairan Komisi / LPK Lain'}*`,
      `Rp${formatThousandsNumber(recipient.amount)}`,
      bankAndName,
      recipient.accountNumber || '....................',
      `Ket. ${recipient.notes || applicantName}`,
    )
  }

  lines.push(
    '',
    '*Uang Saku Siswa (Nafaqah)*',
    `Rp${formatThousandsNumber(state.pocketMoney)}`,
    applicantBankAndName,
    state.applicantAccountNumber || '....................',
    `Ket. ${state.applicantNotes || `Uang Saku ${applicantName}`}`,
    '',
    'Notes:',
    '*Operasional Pencairan*',
    `Rp${formatThousandsNumber(state.adminOperasional)}`,
    state.operasionalBank || 'Jenius SMBC Indonesia',
    state.operasionalAccountNumber || '90020422216',
    state.operasionalRecipientName || 'Panut',
  )

  return lines.join('\n')
}
