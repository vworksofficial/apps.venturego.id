/**
 * Rekening resmi operasional perusahaan untuk pembayaran angsuran siswa.
 */
export const COMPANY_BANK_ACCOUNT = {
  bankName: 'Bank BRI',
  accountNumber: '044301001341566',
  accountHolder: 'PT Vworks Kolaborasi Bersama',
} as const

export type CompanyBankAccount = typeof COMPANY_BANK_ACCOUNT
