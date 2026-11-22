'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { DOCUMENT_DEFINITIONS, getKtpDocumentIndex, isFormPendaftaranLabel } from '@/lib/documents'
import { FINANCING_OPTIONS } from '@/lib/financing-plan'
import {
  APPLICATION_STATUSES,
  PRICING_STATUSES,
  type AdminPaymentProofRecord,
  type AdminPaymentRecord,
  type ApplicationDocumentStatus,
  type FinancingApplicationRecord,
} from '@/lib/firebase-data'
import {
  approveApplicationDocument,
  approveApplicationPricing,
  cancelAkadDocumentIssuance,
  deleteApplicationDocument,
  deleteApplicationAkadPhoto,
  issueAkadDocument,
  rejectAndDeleteApplication,
  revertApplicationPricingToEstimated,
  saveFinancialPlan,
  setApplicationPricingAgreed,
  updateApplicationWorkflow,
} from './actions'
import { AdminVipPanel } from './vip-panel'
import { FinanceTermsFields } from './finance-terms-fields'
import { FullCoverBudgetFields } from './full-cover-budget-fields'
import { validateFullCoverBudget } from '@/lib/full-cover-budget'
import { InstallmentMonitor } from './installment-monitor'
import { resolveInstallmentSchedule } from '@/lib/installment-schedule'

const STATUS_LABELS: Record<(typeof APPLICATION_STATUSES)[number], string> = {
  SUBMITTED: 'Terkirim',
  ELIGIBILITY_REVIEW: 'Pemeriksaan kelayakan',
  DOCUMENT_REVIEW: 'Pemeriksaan dokumen',
  REVISION_REQUIRED: 'Perlu perbaikan',
  COST_VERIFICATION: 'Verifikasi biaya',
  APPROVED: 'Disetujui',
  CONTRACT_PREPARATION: 'Persiapan akad',
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-blue-50 text-[#0b57d0] ring-blue-200',
  ELIGIBILITY_REVIEW: 'bg-blue-50 text-[#0b57d0] ring-blue-200',
  DOCUMENT_REVIEW: 'bg-purple-50 text-purple-700 ring-purple-200',
  REVISION_REQUIRED: 'bg-amber-50 text-amber-800 ring-amber-200',
  COST_VERIFICATION: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  APPROVED: 'bg-teal-50 text-teal-800 ring-teal-200',
  CONTRACT_PREPARATION: 'bg-violet-50 text-violet-800 ring-violet-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-slate-100 text-slate-800 ring-slate-300',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const STATUS_WORKFLOW_GROUPS = [
  {
    label: 'Tahap Verifikasi Awal',
    statuses: ['SUBMITTED', 'ELIGIBILITY_REVIEW', 'DOCUMENT_REVIEW', 'REVISION_REQUIRED'] as const,
  },
  {
    label: 'Tahap Persetujuan & Akad',
    statuses: ['COST_VERIFICATION', 'APPROVED', 'CONTRACT_PREPARATION'] as const,
  },
  {
    label: 'Tahap Realisasi & Selesai',
    statuses: ['ACTIVE', 'COMPLETED'] as const,
  },
  {
    label: 'Tahap Pembatalan & Penolakan',
    statuses: ['REJECTED', 'CANCELLED'] as const,
  },
]

const DOCUMENT_STATUS_LABELS: Record<ApplicationDocumentStatus, string> = {
  NOT_UPLOADED: 'Belum diunggah',
  UPLOADED: 'Menunggu tinjauan',
  VERIFIED: 'Sesuai',
  REVISION_REQUIRED: 'Tidak sesuai',
}

const DOCUMENT_BADGE_STYLES: Record<ApplicationDocumentStatus, string> = {
  NOT_UPLOADED: 'bg-slate-100 text-slate-600',
  UPLOADED: 'bg-amber-50 text-amber-800',
  VERIFIED: 'bg-emerald-50 text-emerald-700',
  REVISION_REQUIRED: 'bg-red-50 text-red-700',
}

const PRICING_STATUS_LABELS: Record<(typeof PRICING_STATUSES)[number], string> = {
  ESTIMATED: 'Belum Disetujui',
  VERIFIED: 'Disetujui',
  AGREED: 'Disetujui',
}

const PRICING_BADGE_STYLES: Record<string, string> = {
  ESTIMATED: 'bg-slate-100 text-slate-700',
  VERIFIED: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
  AGREED: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  PAID: 'Lunas',
  EXPIRED: 'Kedaluwarsa',
  FAILED: 'Gagal',
}

const PAYMENT_BADGE_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-800',
  PAID: 'bg-emerald-50 text-emerald-700',
  EXPIRED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-red-50 text-red-700',
}

const ACTIVE_INSTALLMENT_FILTERS: {
  id: 'ALL' | 'OVERDUE' | 'DUE_SOON' | 'CURRENT'
  label: string
}[] = [
  { id: 'ALL', label: 'Semua' },
  { id: 'OVERDUE', label: 'Terlambat' },
  { id: 'DUE_SOON', label: 'Jatuh tempo' },
  { id: 'CURRENT', label: 'Berjalan' },
]

const STUDENT_DIRECTORY_FILTERS: {
  id: 'ALL' | 'IN_PROGRESS' | 'ACTIVE' | 'ALUMNI'
  label: string
}[] = [
  { id: 'ALL', label: 'Semua Siswa' },
  { id: 'IN_PROGRESS', label: 'Dalam Proses' },
  { id: 'ACTIVE', label: 'Siswa Aktif' },
  { id: 'ALUMNI', label: 'Alumni' },
]

const RELIGION_LABELS: Record<string, string> = {
  ISLAM: 'Islam',
  PROTESTANT: 'Kristen Protestan',
  CATHOLIC: 'Katolik',
  HINDU: 'Hindu',
  BUDDHIST: 'Buddha',
  CONFUCIAN: 'Konghucu',
}

const DOC_PROGRESS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Belum diproses',
  IN_PROGRESS: 'Sedang diproses',
  ISSUED: 'Sudah terbit',
}

const LANGUAGE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Belum mulai',
  BASIC_N5: 'N5 Dasar',
  N5: 'N5',
  N4: 'N4',
  N3_PLUS: 'N3 atau lebih tinggi',
}

const NEED_LABELS: Record<string, string> = {
  LANGUAGE_TRAINING: 'Biaya pelatihan bahasa',
  LANGUAGE_ALLOWANCE: 'Uang saku pelatihan bahasa',
  SKILL_TRAINING: 'Biaya pelatihan skill',
  SKILL_ALLOWANCE: 'Uang saku pelatihan skill',
  MEDICAL: 'Biaya pendaftaran & MCU',
  DOCUMENT: 'Biaya pengurusan dokumen keberangkatan',
  LPK_PAYMENT: 'Pembayaran LPK',
  ALLOWANCE: 'Biaya uang saku keberangkatan',
  TRANSPORT: 'Transportasi',
  ACCOMMODATION: 'Akomodasi',
  OTHER: 'Kebutuhan lainnya',
}

type MenuId =
  | 'dashboard'
  | 'applications'
  | 'contracts'
  | 'archiving'
  | 'students'
  | 'paymentMonitor'
  | 'activeInstallments'
  | 'alumni'
  | 'vip'
  | 'audit'

type DetailTabId =
  | 'profile'
  | 'nominal'
  | 'documents'
  | 'pricing'
  | 'contract'
  | 'installment-history'
  | 'program-history'

const SIDEBAR_GROUPS: {
  group: string
  items: {
    id: MenuId
    label: string
    subtitle: string
    defaultTab: DetailTabId
  }[]
}[] = [
  {
    group: 'Menu Utama',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        subtitle: 'Ringkasan operasional, metrik utama, dan pengajuan terbaru',
        defaultTab: 'profile',
      },
      {
        id: 'applications',
        label: 'Pengajuan',
        subtitle: 'Daftar seluruh pengajuan pembiayaan dan status tahapan',
        defaultTab: 'profile',
      },
      {
        id: 'contracts',
        label: 'Persiapan Akad',
        subtitle: 'Penyusunan rincian Nafaqah, Ujrah, simulasi, dan penguncian akad final',
        defaultTab: 'pricing',
      },
      {
        id: 'archiving',
        label: 'Pengarsipan',
        subtitle: 'Pengarsipan naskah akad resmi, salinan PDF basah, dan foto dokumentasi akad',
        defaultTab: 'contract',
      },
      {
        id: 'activeInstallments',
        label: 'Siswa Aktif',
        subtitle: 'Siswa aktif yang sedang berjalan dan dalam masa angsuran',
        defaultTab: 'profile',
      },
      {
        id: 'alumni',
        label: 'Alumni',
        subtitle:
          'Siswa alumni yang telah menyelesaikan seluruh kewajiban angsuran secara lunas tuntas',
        defaultTab: 'installment-history',
      },
      {
        id: 'students',
        label: 'Semua Siswa',
        subtitle: 'Direktori biodata siswa, LPK mitra, kesiapan keberangkatan, & berkas',
        defaultTab: 'documents',
      },
      {
        id: 'paymentMonitor',
        label: 'Monitor Angsuran',
        subtitle: 'Tinjau bukti transfer siswa dan catat pembayaran yang disetujui',
        defaultTab: 'installment-history',
      },
    ],
  },
  {
    group: 'Mitra',
    items: [
      {
        id: 'vip',
        label: 'Mitra VIP',
        subtitle: 'Vworks Investment Partner: data diri, setoran, penarikan, dan bagi hasil',
        defaultTab: 'profile',
      },
    ],
  },
  {
    group: 'Laporan & Audit',
    items: [
      {
        id: 'audit',
        label: 'Log Audit',
        subtitle: 'Riwayat perubahan rincian biaya dan jejak verifikasi staf',
        defaultTab: 'profile',
      },
    ],
  },
]

const SIDEBAR_WORKFLOW_STEPS: Partial<Record<MenuId, number>> = {
  applications: 1,
  contracts: 2,
  archiving: 3,
  activeInstallments: 4,
  alumni: 5,
}

const DETAIL_TABS: { id: DetailTabId; label: string }[] = [
  { id: 'profile', label: 'Profil' },
  { id: 'documents', label: 'Berkas' },
  { id: 'nominal', label: 'Nominal Pengajuan' },
  { id: 'pricing', label: 'Draft Akad' },
  { id: 'contract', label: 'Status Persetujuan' },
  { id: 'installment-history', label: 'Riwayat Angsuran' },
  { id: 'program-history', label: 'Riwayat Program' },
]

function formatDisplayApplicationId(id: string): string {
  if (!id) return ''
  if (id.startsWith('VSV-LGC-')) {
    const rawSuffix = id.slice('VSV-LGC-'.length)
    // Jika hanya nomor urut pendek (misal: "001" atau 8 char hex), biarkan
    if (rawSuffix.length <= 8 && !rawSuffix.includes('-') && !rawSuffix.includes(' ')) {
      return id
    }
    // Hasilkan hash deterministik 8 karakter uppercase
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i)
      hash |= 0
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8).toUpperCase()
    return `VSV-LGC-${hex}`
  }
  return id
}

function DestinationFlag({ destination }: { destination: string }) {
  if (destination === 'JAPAN') {
    return (
      <svg
        aria-hidden="true"
        className="inline-block size-3.5 shrink-0 rounded-[2px] ring-1 ring-slate-200"
        viewBox="0 0 24 24"
      >
        <rect fill="#ffffff" height="24" width="24" />
        <circle cx="12" cy="12" r="6" fill="#bc002d" />
      </svg>
    )
  }
  return (
    <svg
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 rounded-[2px] ring-1 ring-slate-200"
      viewBox="0 0 24 24"
    >
      <rect fill="#e30a17" height="24" width="24" />
      <path
        d="M15.2 12a5.2 5.2 0 1 1-2.2-4.3A4.2 4.2 0 1 0 16.4 13"
        fill="#ffffff"
        stroke="#ffffff"
        strokeLinejoin="round"
        strokeWidth="0.6"
      />
      <path
        d="M16.8 10.2l2.9.85-1.85 2.35.02-2.92 2.86.9-2.87.88.03 2.92-1.87-2.35z"
        fill="#ffffff"
      />
    </svg>
  )
}

function MenuIcon({ id }: { id: MenuId }) {
  switch (id) {
    case 'dashboard':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <rect height="7" rx="1.5" width="7" x="3" y="3" />
          <rect height="7" rx="1.5" width="7" x="14" y="3" />
          <rect height="7" rx="1.5" width="7" x="3" y="14" />
          <rect height="7" rx="1.5" width="7" x="14" y="14" />
        </svg>
      )
    case 'applications':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect height="4" rx="1" width="6" x="9" y="3" />
          <path d="M9 12h6M9 16h4" strokeLinecap="round" />
        </svg>
      )
    case 'students':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" strokeLinecap="round" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" strokeLinecap="round" />
        </svg>
      )
    case 'paymentMonitor':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <rect height="17" rx="2" width="17" x="3.5" y="3.5" />
          <path
            d="M7 8h10M7 12h4m2.5 4.5 1.5 1.5 3-3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'contracts':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" />
        </svg>
      )
    case 'archiving':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'activeInstallments':
      return (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M16 11l2 2 4-4" />
        </svg>
      )
    case 'alumni':
      return (
        <svg
          aria-hidden="true"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="m2 10 10-5 10 5-10 5-10-5Z" strokeLinejoin="round" />
          <path
            d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'vip':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            d="m12 3 2.5 5.1 5.6.8-4.1 4 .97 5.6L12 15.9l-5 2.6.97-5.6-4.1-4 5.6-.8L12 3Z"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'audit':
      return (
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" strokeLinecap="round" />
        </svg>
      )
  }
}

const formatRupiah = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? `Rp${value.toLocaleString('id-ID')}` : '—'

const formatDateShort = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatDateLong = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '—'
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!iso) return value
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const SCHEME_LABELS: Record<string, string> = {
  WAKALAH_BIL_UJRAH: 'Wakalah bil Ujrah',
  WAKALAH_BIL_UJRAH_AND_JUALAH: "Wakalah bil Ujrah + Ju'alah",
}

const formatDateTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID')
}

const formatSizeMb = (size?: number) =>
  typeof size === 'number' && size > 0 ? `${(size / 1024 / 1024).toFixed(2)} MB` : ''

type ScheduleRow = {
  installment: number
  dueDate: string
  amount: number
  remainingBalance?: number
}

type InstallmentDetail = ScheduleRow & {
  appliedAmount: number
  remaining: number
  isPaid: boolean
  isPartial: boolean
}

const addDaysIso = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const getDaysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000)

type InstallmentSummary = {
  schedule: ScheduleRow[]
  rows: InstallmentDetail[]
  isLegacy: boolean
  paidCount: number
  paidAmount: number
  obligation: number | null
  remaining: number
  unpaidCount: number
  nextDue: InstallmentDetail | null
  overdueCount: number
  dueSoon: boolean
}

const getNominalProgressPercent = (summary: InstallmentSummary) => {
  const totalObligation =
    summary.obligation ?? summary.schedule.reduce((sum, row) => sum + row.amount, 0)
  if (totalObligation <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((summary.paidAmount / totalObligation) * 100)))
}

const summarizeInstallments = (
  app: FinancingApplicationRecord,
  todayIso: string,
  payments: AdminPaymentRecord[] = [],
): InstallmentSummary => {
  const schedule = resolveInstallmentSchedule(app.product, app.financialPlan ?? {})
  const paidSet = new Set(Array.isArray(app.paidInstallments) ? app.paidInstallments : [])
  const isLegacy =
    Boolean(app.legacy) ||
    (typeof app.contractScheme === 'string' && app.contractScheme.startsWith('LEGACY_'))
  const applicationPayments = payments.filter(
    (payment) =>
      payment.applicationDocId === app.id ||
      (!payment.applicationDocId && payment.applicationId === app.applicationId),
  )
  const paidApplicationPayments = applicationPayments.filter((payment) => payment.status === 'PAID')
  const allocatedByInstallment = new Map<number, number>()
  for (const payment of paidApplicationPayments) {
    if (payment.installmentNumber === null) continue
    allocatedByInstallment.set(
      payment.installmentNumber,
      (allocatedByInstallment.get(payment.installmentNumber) ?? 0) + payment.amount,
    )
  }
  const rows: InstallmentDetail[] = schedule.map((row) => {
    const allocatedAmount = Math.min(row.amount, allocatedByInstallment.get(row.installment) ?? 0)
    const isPaid = paidSet.has(row.installment) || (row.amount > 0 && allocatedAmount >= row.amount)
    const appliedAmount = isPaid ? row.amount : allocatedAmount
    return {
      ...row,
      appliedAmount,
      remaining: Math.max(0, row.amount - appliedAmount),
      isPaid,
      isPartial: !isPaid && appliedAmount > 0,
    }
  })
  const paidCount = rows.filter((row) => row.isPaid).length
  const scheduledPaidAmount = rows.reduce((sum, row) => sum + row.appliedAmount, 0)
  const paidAmount = isLegacy
    ? Math.max(
        typeof app.paidAmount === 'number' && Number.isFinite(app.paidAmount) ? app.paidAmount : 0,
        paidApplicationPayments.reduce((sum, payment) => sum + payment.amount, 0),
        scheduledPaidAmount,
      )
    : scheduledPaidAmount
  const obligation =
    typeof app.financialPlan?.totalObligation === 'number'
      ? app.financialPlan.totalObligation
      : null
  const unpaidRows = rows.filter((row) => !row.isPaid)
  const remaining = Math.max(
    0,
    (obligation ?? schedule.reduce((sum, row) => sum + row.amount, 0)) - paidAmount,
  )
  const soon = addDaysIso(todayIso, 7)
  const nextDue = unpaidRows[0] ?? null
  const overdueCount = unpaidRows.filter((row) =>
    Boolean(row.dueDate && row.dueDate < todayIso && (isLegacy || row.isPartial)),
  ).length
  return {
    schedule,
    rows,
    isLegacy,
    paidCount,
    paidAmount,
    obligation,
    remaining,
    unpaidCount: unpaidRows.length,
    nextDue,
    overdueCount,
    dueSoon: Boolean(
      nextDue &&
      (isLegacy || nextDue.isPartial) &&
      nextDue.dueDate >= todayIso &&
      nextDue.dueDate <= soon,
    ),
  }
}

const isAlumnus = (app: FinancingApplicationRecord, summary: InstallmentSummary) => {
  if (app.status === 'COMPLETED') return true
  if (app.status === 'REJECTED' || app.status === 'CANCELLED') return false
  if (!isLegacyApplication(app) && app.status !== 'ACTIVE') return false
  return (
    summary.obligation !== null &&
    summary.obligation > 0 &&
    summary.remaining === 0 &&
    summary.paidCount >= summary.schedule.length
  )
}

const isLegacyApplication = (app: FinancingApplicationRecord) =>
  Boolean(app.legacy) ||
  (typeof app.contractScheme === 'string' && app.contractScheme.startsWith('LEGACY_'))

const hasActiveInstallment = (app: FinancingApplicationRecord, summary: InstallmentSummary) => {
  if (isAlumnus(app, summary)) return false
  if (app.status === 'REJECTED' || app.status === 'CANCELLED') return false
  if (summary.remaining <= 0) return false

  // Record legacy dianggap aktif selama masih ada sisa kewajiban
  if (isLegacyApplication(app)) return true

  // Siswa aktif harus berstatus ACTIVE dan dokumen akad telah diterbitkan
  // Data yang dikembalikan ke persiapan akad atau pengajuan otomatis keluar dari halaman siswa aktif
  return app.status === 'ACTIVE' && Boolean(app.financialPlan?.akadDocument)
}

const getStudentDirectoryCategory = (
  app: FinancingApplicationRecord,
  summary: InstallmentSummary,
): 'IN_PROGRESS' | 'ACTIVE' | 'ALUMNI' | 'CLOSED' => {
  if (isAlumnus(app, summary)) return 'ALUMNI'
  if (hasActiveInstallment(app, summary)) return 'ACTIVE'
  if (app.status === 'REJECTED' || app.status === 'CANCELLED') return 'CLOSED'
  return 'IN_PROGRESS'
}

const compareInstallmentRows = (
  a: { summary: InstallmentSummary },
  b: { summary: InstallmentSummary },
) => {
  const aOverdue = a.summary.overdueCount > 0 ? 0 : 1
  const bOverdue = b.summary.overdueCount > 0 ? 0 : 1
  if (aOverdue !== bOverdue) return aOverdue - bOverdue
  const aDue = a.summary.nextDue?.dueDate ?? '9999-99-99'
  const bDue = b.summary.nextDue?.dueDate ?? '9999-99-99'
  if (aDue !== bDue) return aDue.localeCompare(bDue)
  return b.summary.remaining - a.summary.remaining
}

function DrawerAction({
  label,
  onClick,
  variant = 'secondary',
  ariaLabel,
  disabled = false,
}: {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-not-allowed disabled:opacity-60 ${
        variant === 'primary'
          ? 'bg-[#0b57d0] text-white hover:bg-[#0842a0]'
          : 'border border-slate-200 bg-white text-[#0b57d0] hover:border-[#0b57d0]/30 hover:bg-blue-50'
      }`}
      disabled={disabled}
      onClick={onClick}
      suppressHydrationWarning
      type="button"
    >
      {label}
      <svg
        aria-hidden="true"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function SwipeToApprove({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const dragStart = useRef<{ pointerX: number; offset: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const progress = (() => {
    const trackWidth = trackRef.current?.clientWidth ?? 0
    const maxOffset = Math.max(trackWidth - 152, 1)
    return Math.min(offset / maxOffset, 1)
  })()
  const finishDrag = () => {
    dragStart.current = null
    if (progress >= 0.95) {
      setOffset(Math.max((trackRef.current?.clientWidth ?? 152) - 152, 0))
      setConfirmed(true)
      onConfirm()
      return
    }
    setOffset(0)
  }

  return (
    <div
      aria-label="Geser dan tahan hingga ujung untuk Setujui Rincian"
      className={`relative h-12 w-full touch-pan-y overflow-hidden rounded-xl border transition-colors ${
        disabled ? 'border-slate-200 bg-slate-100' : 'border-emerald-200 bg-emerald-50/80'
      }`}
      ref={trackRef}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <span
          className={`whitespace-nowrap text-[11px] font-semibold italic text-emerald-900/70 transition-opacity ${progress > 0.04 ? 'opacity-100' : 'opacity-0'}`}
          style={{ clipPath: `inset(0 ${Math.max(0, 100 - progress * 100)}% 0 0)` }}
        >
          <em>Bismillah</em> Semoga Lancar &amp; Berkah
        </span>
      </div>
      <button
        aria-label="Geser untuk Setujui Rincian"
        className={`absolute left-0 top-0 z-10 flex h-full w-[152px] touch-none items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-white shadow-md transition-[transform,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400 ${
          disabled ? 'bg-slate-400' : 'bg-gradient-to-br from-emerald-500 to-emerald-700'
        }`}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === 'End' || event.key === 'ArrowRight') {
            event.preventDefault()
            setOffset(Math.max((trackRef.current?.clientWidth ?? 152) - 152, 0))
          }
          if (event.key === 'Enter' && progress >= 0.82) finishDrag()
        }}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragStart.current = { pointerX: event.clientX, offset }
        }}
        onPointerMove={(event) => {
          if (!dragStart.current || disabled) return
          const maxOffset = Math.max((trackRef.current?.clientWidth ?? 152) - 152, 0)
          setOffset(
            Math.max(
              0,
              Math.min(
                maxOffset,
                dragStart.current.offset + event.clientX - dragStart.current.pointerX,
              ),
            ),
          )
        }}
        onPointerUp={finishDrag}
        onPointerCancel={() => {
          dragStart.current = null
          setOffset(0)
        }}
        style={{ transform: `translateX(${offset}px)` }}
        type="button"
      >
        <span>{confirmed ? 'Menyimpan…' : 'Geser & Tahan'}</span>
        <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
          <path
            d="M5 12h13m-5-5 5 5-5 5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
    </div>
  )
}

function ApplicationDrawerForm({
  application,
  activeTab,
  setActiveTab,
  pending,
  approvalSaving,
  error,
  savedNotice,
  onDismissError,
  onDismissSaved,
  onSave,
  onWorkflow,
  onApproveDocument,
  onDeleteDocument,
  onApprovePricing,
  onAgreePricing,
  onUploadAgreement,
  onClose,
  payments,
  todayIso,
}: {
  application: FinancingApplicationRecord
  payments: AdminPaymentRecord[]
  todayIso: string
  activeTab: DetailTabId
  setActiveTab: (tab: DetailTabId) => void
  pending: boolean
  approvalSaving: boolean
  error: string
  savedNotice: string
  onDismissError: () => void
  onDismissSaved: () => void
  onSave: (application: FinancingApplicationRecord, formData: FormData) => void
  onWorkflow: (
    applicationId: string,
    status: string,
    internalNotes: string,
    departureDate?: string,
  ) => void
  onApproveDocument: (applicationId: string, documentIndex: number) => void
  onDeleteDocument: (applicationId: string, documentIndex: number) => void
  onApprovePricing: (applicationId: string, newNominal: number | null) => void
  onAgreePricing: (applicationId: string) => void
  onUploadAgreement: (applicationId: string, file: File) => Promise<void>
  onClose: () => void
}) {
  const [visitedTabs, setVisitedTabs] = useState<Set<DetailTabId>>(() => new Set([activeTab]))
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [showNominalInput, setShowNominalInput] = useState(false)
  const [fullCoverBudgetDirty, setFullCoverBudgetDirty] = useState(false)
  const [newNominal, setNewNominal] = useState('')
  const [workflowStatus, setWorkflowStatus] = useState(application.status)
  const [workflowNotes, setWorkflowNotes] = useState(application.internalNotes ?? '')
  const [flightDepartureDate, setFlightDepartureDate] = useState(application.departureDate ?? '')
  const [agreementUploading, setAgreementUploading] = useState(false)
  const [agreementUploadError, setAgreementUploadError] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null)
  const [akadIssuing, setAkadIssuing] = useState(false)
  const [akadIssueError, setAkadIssueError] = useState('')
  const [akadPreviewOpen, setAkadPreviewOpen] = useState(false)
  const [akadPreviewPdfUrl, setAkadPreviewPdfUrl] = useState<string | null>(null)
  const [akadPreviewLoading, setAkadPreviewLoading] = useState(false)
  const [akadPreviewError, setAkadPreviewError] = useState('')
  const [akadPdfSaving, setAkadPdfSaving] = useState(false)
  const [akadPdfError, setAkadPdfError] = useState('')
  const akadPreviewFrameRef = useRef<HTMLIFrameElement>(null)

  const router = useRouter()

  useEffect(() => {
    setFullCoverBudgetDirty(false)
  }, [application.id, application.financialPlan?.fullCoverBudget])

  useEffect(() => {
    setVisitedTabs((current) =>
      current.has(activeTab) ? current : new Set([...current, activeTab]),
    )
  }, [activeTab])

  const shouldRenderTab = (tab: DetailTabId) => activeTab === tab || visitedTabs.has(tab)

  const definitions =
    DOCUMENT_DEFINITIONS[application.product] ?? DOCUMENT_DEFINITIONS.DEPARTURE_BRIDGING
  const uploadedCount = application.documents.filter((doc) => Boolean(doc.fileId)).length
  const verifiedCount = application.documents.filter((doc) => doc.status === 'VERIFIED').length
  const reviewCount = application.documents.filter((doc) => doc.status === 'UPLOADED').length
  const revisionCount = application.documents.filter(
    (doc) => doc.status === 'REVISION_REQUIRED',
  ).length

  const pricingStatus = String(application.financialPlan?.pricingStatus ?? 'ESTIMATED')
  const agreementPdfCurrent = Boolean(
    application.agreementPdf &&
    application.agreementPdf.agreementReference ===
      application.financialPlan?.finalAgreementReference,
  )

  const personal = application.personalDetails ?? {}
  const bankAccounts = (personal.bankAccounts ?? {}) as {
    applicant?: Record<string, unknown>
    lpk?: Record<string, unknown>
  }
  const eligibility = application.eligibility ?? {}
  const fullCover = application.fullCoverDetails ?? {}
  const departure = application.departureDetails ?? {}

  const ktpIndex = getKtpDocumentIndex(application.product)
  const ktpDocument = application.documents[ktpIndex]
  const ktpIsPdf = String(ktpDocument?.mimeType ?? '')
    .toLowerCase()
    .includes('pdf')

  const previewDocument = previewIndex !== null ? application.documents[previewIndex] : null
  const previewIsPdf = String(previewDocument?.mimeType ?? '')
    .toLowerCase()
    .includes('pdf')

  const requestedAmount =
    application.product === 'DEPARTURE_BRIDGING'
      ? Number(departure.requestedFinancingAmount) || 0
      : 0
  const estimatedMonthlyUjrah =
    application.product === 'DEPARTURE_BRIDGING' && requestedAmount > 0
      ? Math.round(requestedAmount * 0.024)
      : null
  const estimatedTotalUjrah = estimatedMonthlyUjrah === null ? null : estimatedMonthlyUjrah * 12
  const estimatedAdminFee =
    application.product === 'DEPARTURE_BRIDGING' && requestedAmount > 0
      ? Math.round(requestedAmount * 0.05)
      : null
  const estimatedCashDisbursed =
    estimatedAdminFee === null ? null : requestedAmount - estimatedAdminFee
  const estimatedFinancingTotal =
    estimatedTotalUjrah === null ? null : requestedAmount + estimatedTotalUjrah

  const nominalCap =
    application.product === 'DEPARTURE_BRIDGING' &&
    Number.isSafeInteger(requestedAmount) &&
    requestedAmount > 0
      ? requestedAmount
      : null
  const standardNominalOptions = FINANCING_OPTIONS.filter(
    (option) => nominalCap !== null && option.amount <= nominalCap,
  )
  const customApplicantNominalOption =
    nominalCap !== null && !FINANCING_OPTIONS.some((option) => option.amount === nominalCap)
      ? [{ amount: nominalCap, label: `Nominal diajukan (${formatRupiah(nominalCap)})` }]
      : []
  const nominalOptions = [...standardNominalOptions, ...customApplicantNominalOption]
  const parsedNewNominal = Number(newNominal.replace(/[^\d]/g, ''))
  const newNominalValid =
    Number.isSafeInteger(parsedNewNominal) &&
    parsedNewNominal > 0 &&
    parsedNewNominal <= 10_000_000_000 &&
    (nominalCap === null || parsedNewNominal <= nominalCap) &&
    (application.product !== 'DEPARTURE_BRIDGING' ||
      nominalOptions.some((option) => option.amount === parsedNewNominal))

  const pricingStatusLabel =
    pricingStatus === 'ESTIMATED'
      ? 'Belum Disetujui'
      : (PRICING_STATUS_LABELS[pricingStatus as keyof typeof PRICING_STATUS_LABELS] ?? 'Disetujui')

  const akadMeta = (application.financialPlan?.akadDocument ?? null) as {
    documentNumber?: string
    studentNumber?: string
    issuedAt?: string
    fileName?: string
  } | null
  const akadIssued = Boolean(akadMeta)
  const financeTermsKey = useMemo(
    () => JSON.stringify(application.financialPlan ?? {}),
    [application.financialPlan],
  )

  const downloadAkadPreviewPdf = async () => {
    if (!akadPreviewPdfUrl || akadPdfSaving) return

    setAkadPdfSaving(true)
    setAkadPdfError('')
    try {
      const response = await fetch(`/api/admin/applications/${application.id}/akad?mode=pdf`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(result?.message || 'PDF belum dapat dibuat. Silakan coba lagi.')
      }

      const blob = await response.blob()
      const signature = await blob.slice(0, 5).text()
      if (blob.type !== 'application/pdf' || signature !== '%PDF-') {
        throw new Error('Server tidak mengembalikan file PDF yang valid. Silakan coba lagi.')
      }

      const disposition = response.headers.get('Content-Disposition') ?? ''
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      const fileName = encodedName
        ? decodeURIComponent(encodedName)
        : plainName || `Draft Akad VSV - ${application.applicantName}.pdf`
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      setAkadPdfError(
        error instanceof Error ? error.message : 'PDF belum dapat dibuat. Silakan coba lagi.',
      )
    } finally {
      setAkadPdfSaving(false)
    }
  }
  const akadGateOpen = pricingStatus === 'VERIFIED' || pricingStatus === 'AGREED' || akadIssued

  const openAkadPreview = async () => {
    // Revoke any existing blob URL to free memory
    if (akadPreviewPdfUrl) {
      URL.revokeObjectURL(akadPreviewPdfUrl)
      setAkadPreviewPdfUrl(null)
    }
    setAkadPreviewOpen(true)
    setAkadPreviewError('')
    setAkadPreviewLoading(true)
    try {
      const response = await fetch(`/api/admin/applications/${application.id}/akad?mode=pdf`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || 'Pratinjau PDF akad belum dapat dimuat.')
      }
      const blob = await response.blob()
      setAkadPreviewPdfUrl(URL.createObjectURL(blob))
    } catch (err) {
      setAkadPreviewError(
        err instanceof Error ? err.message : 'Pratinjau PDF akad belum dapat dimuat.',
      )
    } finally {
      setAkadPreviewLoading(false)
    }
  }

  const issueAkad = () => {
    if (
      !window.confirm(
        'Terbitkan dokumen akad? NIS akan diterbitkan, status angsuran menjadi Aktif, dan rincian biaya terkunci.',
      )
    ) {
      return
    }
    setAkadIssueError('')
    setAkadIssuing(true)
    void (async () => {
      try {
        const result = await issueAkadDocument(application.id)
        if (!result.ok) {
          setAkadIssueError(result.message)
          return
        }
        setAkadPreviewOpen(false)
        if (akadPreviewPdfUrl) {
          URL.revokeObjectURL(akadPreviewPdfUrl)
          setAkadPreviewPdfUrl(null)
        }
        router.refresh()
      } catch (err) {
        setAkadIssueError(
          err instanceof Error ? err.message : 'Dokumen akad belum dapat diterbitkan.',
        )
      } finally {
        setAkadIssuing(false)
      }
    })()
  }

  const planNafaqah = Number(application.financialPlan?.nafaqahTotal) || 0
  const planUjrah = Number(application.financialPlan?.ujrahTotal) || 0
  const planJuala = Number(application.financialPlan?.jualaTotal) || 0
  const planTotal = Number(application.financialPlan?.totalObligation) || 0
  const planTotalAfterCoe =
    Number(application.financialPlan?.totalObligationIfCoe) || planTotal + planJuala
  const planPrincipalRaw = Number(application.financialPlan?.principal)
  const planPrincipal =
    Number.isSafeInteger(planPrincipalRaw) && planPrincipalRaw > 0
      ? planPrincipalRaw
      : requestedAmount
  const planAdminFee = Math.round(planPrincipal * 0.05)
  const planApproved =
    (pricingStatus === 'VERIFIED' || pricingStatus === 'AGREED') && planNafaqah > 0 && planUjrah > 0
  const approvedWakalahRows = [
    ['Principal (nominal disetujui)', formatRupiah(planPrincipal)],
    ['Rata-rata Ujrah per bulan (12 bulan)', formatRupiah(Math.round(planUjrah / 12))],
    ['Total Ujrah (12 bulan)', formatRupiah(planUjrah)],
    ['Biaya admin (5%)', formatRupiah(planAdminFee)],
    ['Pencairan bersih ke pemohon', formatRupiah(planPrincipal - planAdminFee)],
    ['Total nominal kewajiban', formatRupiah(planTotal)],
  ] as const
  const approvedFullCoverRows = [
    ['Total Nafaqah', formatRupiah(application.financialPlan?.nafaqahTotal)],
    ['Total Ujrah', formatRupiah(application.financialPlan?.ujrahTotal)],
    ['Ju’alah (saat COE terbit)', formatRupiah(application.financialPlan?.jualaTotal)],
    [
      'Tenor setelah keberangkatan',
      application.financialPlan?.tenorMonths
        ? `${String(application.financialPlan.tenorMonths)} bulan`
        : '—',
    ],
    ['Total kewajiban (di luar Ju’alah)', formatRupiah(application.financialPlan?.totalObligation)],
    ['Total kewajiban jika COE terbit (termasuk Ju’alah)', formatRupiah(planTotalAfterCoe)],
    [
      'Angsuran per bulan (setelah COE)',
      formatRupiah(application.financialPlan?.monthlyInstallmentAfterCoe),
    ],
  ] as const

  const workflowDirty =
    workflowStatus !== application.status ||
    workflowNotes !== (application.internalNotes ?? '') ||
    flightDepartureDate !== (application.departureDate ?? '')

  const selectAgreementPdf = async (file: File | undefined) => {
    setAgreementUploadError('')
    if (!file) return
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setAgreementUploadError('Pilih berkas akad berformat PDF.')
      return
    }
    if (file.size <= 0 || file.size > 4 * 1024 * 1024) {
      setAgreementUploadError('Ukuran PDF akad maksimal 4 MB.')
      return
    }
    setAgreementUploading(true)
    try {
      await onUploadAgreement(application.id, file)
    } catch (error) {
      setAgreementUploadError(
        error instanceof Error ? error.message : 'PDF akad belum dapat diunggah.',
      )
    } finally {
      setAgreementUploading(false)
    }
  }

  const selectAkadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setPhotoUploading(true)
    setPhotoError('')
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i])
      }
      const response = await fetch(`/api/admin/applications/${application.id}/akad-photos`, {
        method: 'POST',
        body: formData,
      })
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
      }
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Gagal mengunggah foto dokumentasi akad.')
      }
      router.refresh()
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Gagal mengunggah foto dokumentasi akad.')
    } finally {
      setPhotoUploading(false)
    }
  }

  const handleDeleteAkadPhoto = async (fileId: string) => {
    if (!confirm('Hapus foto dokumentasi akad ini?')) return
    setPhotoUploading(true)
    setPhotoError('')
    try {
      const result = await deleteApplicationAkadPhoto(application.id, fileId)
      if (!result.ok) {
        throw new Error(result.message)
      }
      router.refresh()
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Gagal menghapus foto dokumentasi akad.')
    } finally {
      setPhotoUploading(false)
    }
  }

  return (
    <form
      action={(formData) => onSave(application, formData)}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white"
    >
      {/* Drawer Header: identity + close */}
      <div className="relative overflow-hidden border-b border-blue-800/20 bg-gradient-to-br from-[#0b57d0] to-[#0842a0] px-6 py-4 text-white">
        <div className="absolute -right-10 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
                {application.applicationId}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                {application.product === 'FULL_COVER' ? 'VSV Full Cover' : 'VSV Dana Keberangkatan'}
              </span>
            </div>
            <button
              aria-label="Tutup panel pengajuan"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </div>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
            {application.applicantName}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-blue-100">
            <span className="font-medium text-white">{application.lpkName}</span>
            <span aria-hidden="true" className="text-white/50">
              |
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-white/90">
              <DestinationFlag destination={application.destination} />
              {application.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
            </span>
          </p>
        </div>
        {error && (
          <div
            className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800"
            role="alert"
          >
            <span>{error}</span>
            <button className="underline" onClick={onDismissError} type="button">
              Tutup
            </button>
          </div>
        )}
        {savedNotice && (
          <div
            className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900"
            role="status"
          >
            <span>✓ {savedNotice}</span>
            <button className="underline" onClick={onDismissSaved} type="button">
              Tutup
            </button>
          </div>
        )}
      </div>

      {/* Drawer Navigation Tabs — solid pill tab bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <div
          aria-label="Tab detail pengajuan"
          className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {DETAIL_TABS.map((tab, index) => {
            const isActive = activeTab === tab.id
            let badge = ''
            if (tab.id === 'documents') badge = `${uploadedCount}/${application.documents.length}`

            return (
              <button
                aria-selected={isActive}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] ${
                  isActive
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="text-xs leading-none">
                  {application.product === 'FULL_COVER' && tab.id === 'nominal' ? (
                    <em>Budgeting</em>
                  ) : (
                    tab.label
                  )}
                </span>
                {badge && (
                  <span
                    className={`text-xs font-normal ${
                      isActive ? 'text-white/80' : 'text-slate-500'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scrollable Drawer Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
        {/* TAB: PROFILE */}
        <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">Profil Pemohon</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Biodata, dokumen identitas, dan program LPK mitra
              </p>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  KTP Pemohon
                </h4>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {ktpDocument?.fileId ? (
                    ktpIsPdf ? (
                      <iframe
                        className="h-44 w-full bg-white"
                        src={`/api/admin/applications/${application.id}/documents/${ktpIndex}?inline=1`}
                        title="Pratinjau KTP pemohon"
                      />
                    ) : (
                      <img
                        alt="KTP pemohon"
                        className="h-44 w-full bg-white object-contain"
                        src={`/api/admin/applications/${application.id}/documents/${ktpIndex}?inline=1`}
                      />
                    )
                  ) : (
                    <div className="flex h-44 items-center justify-center px-4 text-center text-xs text-slate-400">
                      KTP belum diunggah
                    </div>
                  )}
                </div>
                {ktpDocument?.fileId && (
                  <a
                    className="mt-1.5 inline-block text-[11px] font-semibold text-[#0b57d0] underline"
                    href={`/api/admin/applications/${application.id}/documents/${ktpIndex}`}
                  >
                    Unduh KTP {formatSizeMb(ktpDocument.size)}
                  </a>
                )}
              </div>

              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Biodata & Kontak
                </h4>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-slate-400">Nama Lengkap</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">
                      {application.applicantName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">No. WhatsApp</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">{application.phone}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Tempat, Tgl Lahir</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">
                      {String(personal.birthPlace ?? '—')}, {formatDateLong(personal.birthDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Gender & Agama</dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">
                      {personal.gender === 'FEMALE' ? 'Perempuan' : 'Laki-laki'} ·{' '}
                      {RELIGION_LABELS[String(personal.religion ?? '')] ??
                        String(personal.religion ?? '—')}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Alamat KTP</dt>
                    <dd className="mt-0.5 rounded-lg bg-slate-50 p-2.5 text-slate-800">
                      {String(personal.idCardAddress ?? '—')}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Alamat Domisili / Korespondensi</dt>
                    <dd className="mt-0.5 rounded-lg bg-slate-50 p-2.5 text-slate-800">
                      {String(personal.domicileAddress ?? '—')}{' '}
                      {personal.domicilePostalCode
                        ? `(${String(personal.domicilePostalCode)})`
                        : ''}
                    </dd>
                  </div>
                </dl>
                {bankAccounts.applicant || bankAccounts.lpk ? (
                  <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Rekening yang diajukan
                    </h4>
                    <dl className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
                      {[
                        ['Rekening pribadi', bankAccounts.applicant],
                        ['Rekening LPK', bankAccounts.lpk],
                      ].map(([label, account]) => {
                        const details = account as Record<string, unknown> | undefined
                        if (!details) return null
                        return (
                          <div className="min-w-0" key={String(label)}>
                            <dt className="text-slate-400">{String(label)}</dt>
                            <dd className="mt-0.5 break-words font-semibold text-slate-900">
                              {String(details.bankName ?? '—')} ·{' '}
                              {String(details.accountNumber ?? '—')} ·{' '}
                              {String(details.accountName ?? '—')}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                  </section>
                ) : null}
              </div>
            </div>

            <div className="border-t border-slate-100 p-5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Program LPK & Kesiapan Keberangkatan
              </h4>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
                <div className="min-w-0">
                  <dt className="truncate text-slate-400">LPK Mitra</dt>
                  <dd
                    className="mt-0.5 truncate font-semibold text-slate-900"
                    title={application.lpkName}
                  >
                    {application.lpkName}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-slate-400">Tujuan & Skema</dt>
                  <dd
                    className="mt-0.5 truncate font-semibold text-slate-900"
                    title={`${application.destination === 'JAPAN' ? 'Jepang' : 'Turki'} · ${
                      SCHEME_LABELS[String(application.contractScheme ?? 'WAKALAH_BIL_UJRAH')] ??
                      String(application.contractScheme ?? '—')
                    }`}
                  >
                    {application.destination === 'JAPAN' ? 'Jepang' : 'Turki'} ·{' '}
                    {SCHEME_LABELS[String(application.contractScheme ?? 'WAKALAH_BIL_UJRAH')] ??
                      String(application.contractScheme ?? '—')}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-slate-400">Status COE & Visa</dt>
                  <dd
                    className="mt-0.5 truncate font-semibold text-slate-900"
                    title={`COE: ${
                      DOC_PROGRESS_LABELS[String(eligibility.coeStatus ?? '')] ?? '—'
                    } · Visa: ${DOC_PROGRESS_LABELS[String(eligibility.visaStatus ?? '')] ?? '—'}`}
                  >
                    COE: {DOC_PROGRESS_LABELS[String(eligibility.coeStatus ?? '')] ?? '—'} · Visa:{' '}
                    {DOC_PROGRESS_LABELS[String(eligibility.visaStatus ?? '')] ?? '—'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-slate-400">Perkiraan Keberangkatan</dt>
                  <dd className="mt-0.5 truncate font-semibold text-slate-900">
                    {formatDateLong(eligibility.estimatedDeparture)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {[
                  ['Pelatihan dimulai', eligibility.trainingStarted],
                  ['Pelatihan selesai', eligibility.trainingCompleted],
                  ['Lulus penempatan', eligibility.placementPassed],
                  ['Paspor tersedia', eligibility.hasPassport],
                  ['Kontrak kerja ada', eligibility.hasWorkContract],
                  ['Izin orang tua/wali', eligibility.guardianApproval],
                ].map(([label, val]) => (
                  <div
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
                      val ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-500'
                    }`}
                    key={String(label)}
                  >
                    <span className="truncate whitespace-nowrap">{String(label)}</span>
                    <strong className="shrink-0">{val ? 'Ya' : 'Tidak'}</strong>
                  </div>
                ))}
              </div>
              {application.product === 'FULL_COVER' && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  Level bahasa:{' '}
                  <strong>
                    {LANGUAGE_LABELS[String(fullCover.languageLevel ?? '')] ??
                      String(fullCover.languageLevel ?? '—')}
                  </strong>{' '}
                  · Durasi bahasa:{' '}
                  <strong>{String(fullCover.languageTrainingMonths ?? '—')} bln</strong> · Skill:{' '}
                  <strong>{String(fullCover.skillTrainingMonths ?? '—')} bln</strong>
                  <p className="mt-1">
                    Kebutuhan:{' '}
                    <strong>
                      {(application.fundingNeeds ?? [])
                        .map((n) => NEED_LABELS[String(n.category)] ?? String(n.category))
                        .join(', ') || '—'}
                    </strong>
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Section: Formulir Pendaftaran Siswa (Digital) */}
          <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Formulir Pendaftaran Siswa (Digital)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Data formulir pendaftaran yang diisi secara online oleh siswa
                </p>
              </div>
              {application.registrationForm ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  Sudah Dilengkapi
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                  Belum Diisi
                </span>
              )}
            </div>

            {application.registrationForm ? (
              <div className="space-y-5 p-5 text-xs">
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Data Tambahan Pemohon
                  </h4>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">Nama Gadis Ibu Kandung</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.motherMaidenName ?? '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">NPWP</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.npwp || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Jam Hubungi</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.contactHourStart ?? '—')} -{' '}
                        {String(application.registrationForm.contactHourEnd ?? '—')}{' '}
                        {String(application.registrationForm.contactTimeZone ?? '')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Jumlah Tanggungan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.dependentsCount ?? '0')} Orang
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Pendidikan Terakhir</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.lastEducation ?? '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">No. Telepon Rumah</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.homePhone || '—')}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Pekerjaan di Negara Tertuju (
                    {String(application.registrationForm.destinationCountry ?? '—')})
                  </h4>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">Nama Perusahaan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.companyName || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Bidang Usaha</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.companyBusiness || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Posisi / Peran</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.companyRole || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Alamat Perusahaan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.companyAddress || '—')},{' '}
                        {String(application.registrationForm.companyCity || '')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Status Pekerjaan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.employmentStatus || '—')}
                        {application.registrationForm.employmentStatusOther
                          ? ` (${String(application.registrationForm.employmentStatusOther)})`
                          : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Estimasi Pendapatan</dt>
                      <dd className="mt-0.5 font-semibold text-emerald-700">
                        Rp{' '}
                        {Number(application.registrationForm.monthlyIncome || 0).toLocaleString(
                          'id-ID',
                        )}{' '}
                        / bln
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Kontak Emergency (Darurat)
                  </h4>
                  <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-slate-400">Nama Kontak</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.emergencyName || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Hubungan</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.emergencyRelation || '—')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">No. HP / WA</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {String(application.registrationForm.emergencyMobile || '—')}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400">Alamat Domisili</dt>
                      <dd className="mt-0.5 text-slate-800">
                        {String(application.registrationForm.emergencyAddress || '—')} (RT{' '}
                        {String(application.registrationForm.emergencyRt || '')}/RW{' '}
                        {String(application.registrationForm.emergencyRw || '')},{' '}
                        {String(application.registrationForm.emergencyCity || '')})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Status Tempat Tinggal</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {application.registrationForm.emergencyCohabitation === 'TINGGAL_SERUMAH'
                          ? 'Tinggal Serumah'
                          : 'Tidak Serumah'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[11px] text-slate-400">
                    Dilengkapi pada:{' '}
                    {formatDateLong(String(application.registrationForm.completedAt || ''))}
                  </span>
                  <button
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b57d0] hover:underline"
                    onClick={() => setActiveTab('documents')}
                    type="button"
                  >
                    <span>Tinjau PDF di Tab Berkas</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Siswa belum melengkapi formulir pendaftaran digital.
              </div>
            )}
          </section>
        </div>

        {/* TAB: NOMINAL PENGAJUAN */}
        <div className={activeTab === 'nominal' ? 'block space-y-4' : 'hidden'}>
          {application.product === 'FULL_COVER' && (
            <FullCoverBudgetFields
              fullCoverDetails={application.fullCoverDetails}
              financialPlan={application.financialPlan ?? {}}
              key={JSON.stringify([
                application.financialPlan?.fullCoverBudget ?? null,
                application.financialPlan?.tenorMonths ?? null,
                application.financialPlan?.ujrahTotal ?? null,
                application.financialPlan?.jualaTotal ?? null,
                application.fullCoverDetails?.languageTrainingMonths,
                application.fullCoverDetails?.skillTrainingMonths,
              ])}
              lpkName={application.lpkName}
              disabled={akadIssued}
              onDirtyChange={setFullCoverBudgetDirty}
              pending={pending}
            />
          )}
          {application.product === 'DEPARTURE_BRIDGING' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-[11px] font-medium text-slate-500">
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Nominal Diajukan'
                    : 'Total Nafaqah + Ujrah'}
                </span>
                <strong className="mt-1 block text-xl font-extrabold text-[#0b57d0]">
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? formatRupiah(departure.requestedFinancingAmount)
                    : application.financialPlan?.fullCoverBudget
                      ? formatRupiah(planNafaqah + planUjrah)
                      : planNafaqah > 0 && planUjrah > 0
                        ? formatRupiah(planNafaqah + planUjrah)
                        : 'Menunggu rincian'}
                </strong>
                <span className="mt-1 block text-[11px] text-slate-400">
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Plafon maksimum persetujuan staf'
                    : application.financialPlan?.fullCoverBudget
                      ? 'Total kebutuhan + Ujrah, sebelum Ju’alah bersyarat COE'
                      : planNafaqah > 0 && planUjrah > 0
                        ? 'Nilai berdasarkan rincian biaya saat ini'
                        : 'Nilai tampil setelah Nafaqah dan Ujrah diisi di Draft Akad'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-[11px] font-medium text-slate-500">
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Sisa Kewajiban LPK'
                    : 'Status Biaya'}
                </span>
                <strong
                  className={`mt-1 block text-xl font-extrabold ${
                    application.product === 'DEPARTURE_BRIDGING'
                      ? 'text-slate-900'
                      : pricingStatus === 'AGREED'
                        ? 'text-emerald-700'
                        : pricingStatus === 'VERIFIED'
                          ? 'text-amber-700'
                          : 'text-slate-700'
                  }`}
                >
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? formatRupiah(departure.outstandingLPKAmount)
                    : pricingStatusLabel}
                </strong>
                <span className="mt-1 block text-[11px] text-slate-400">
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Tagihan yang belum ditutup LPK'
                    : 'Tahap verifikasi rincian biaya'}
                </span>
              </div>
            </div>
          )}

          {application.product === 'DEPARTURE_BRIDGING' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-slate-900">Nominal Wakalah (Sistem)</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {planApproved
                    ? 'Rincian tersimpan mengikuti nilai yang disetujui. Ujrah per bulan di bawah adalah rata-rata untuk periode 12 bulan; biaya admin 5%.'
                    : 'Perhitungan otomatis berbasis nominal yang diajukan: ujrah 2,4% per bulan dikalikan 12 bulan dan biaya admin 5%.'}
                </p>
              </div>
              <dl className="divide-y divide-slate-100 px-5 text-xs">
                {(planApproved
                  ? approvedWakalahRows
                  : ([
                      ['Principal (nominal diajukan)', formatRupiah(requestedAmount)],
                      ['Ujrah per bulan (2,4%)', formatRupiah(estimatedMonthlyUjrah)],
                      ['Ujrah × 12 bulan', formatRupiah(estimatedTotalUjrah)],
                      ['Biaya admin (5%)', formatRupiah(estimatedAdminFee)],
                      ['Pencairan bersih ke pemohon', formatRupiah(estimatedCashDisbursed)],
                      ['Total nominal kewajiban', formatRupiah(estimatedFinancingTotal)],
                    ] as const)
                ).map(([label, value], index, rows) => (
                  <div
                    className={`flex items-center justify-between py-2.5 ${
                      index === rows.length - 1 ? 'font-bold text-[#0b57d0]' : 'text-slate-600'
                    }`}
                    key={label}
                  >
                    <dt>{label}</dt>
                    <dd
                      className={
                        index === rows.length - 1 ? 'text-sm' : 'font-semibold text-slate-900'
                      }
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section
            aria-labelledby="pricing-approval-title"
            className="overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-white via-blue-50/40 to-emerald-50/40 shadow-sm ring-1 ring-blue-900/5"
          >
            <div className="border-b border-blue-100/80 bg-white/75 px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b57d0] to-emerald-600 text-white shadow-sm shadow-blue-900/15">
                  <svg
                    aria-hidden="true"
                    className="size-[18px]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path
                      d="M8.5 12.5l2.5 2.5 4.5-5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className="text-[15px] font-bold tracking-tight text-slate-900"
                      id="pricing-approval-title"
                    >
                      Persetujuan Biaya
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${
                        PRICING_BADGE_STYLES[pricingStatus] ?? 'bg-slate-100 text-slate-700'
                      } ring-slate-200`}
                    >
                      {pricingStatusLabel}
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
                    {pricingStatus === 'ESTIMATED'
                      ? application.product === 'FULL_COVER'
                        ? 'Simpan rincian pada Budgeting. Nafaqah, Ujrah Wakalah, Ju’alah, dan tenor dihitung otomatis dari alokasi tersimpan. Lengkapi ketentuan akad yang masih diperlukan pada Draft Akad sebelum menerbitkan dokumen akad.'
                        : 'Persetujuan nominal pembiayaan siswa. Pilih "Setujui" untuk menyetujui sesuai nominal yang diajukan, atau "Setujui dengan Nominal Baru" untuk menetapkan plafon lain. Setelah disetujui, siswa otomatis berpindah ke halaman Persiapan Akad.'
                      : 'Nominal pembiayaan telah disetujui dan pengajuan pemohon telah dipindahkan ke menu Persiapan Akad.'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 bg-white/55 px-5 py-4 sm:px-6">
              {pricingStatus === 'ESTIMATED' ? (
                <>
                  {application.product === 'FULL_COVER' ? (
                    <SwipeToApprove
                      disabled={
                        pending ||
                        !application.financialPlan?.fullCoverBudget ||
                        fullCoverBudgetDirty ||
                        validateFullCoverBudget(application.financialPlan?.fullCoverBudget) !== null
                      }
                      onConfirm={() => onApprovePricing(application.id, null)}
                    />
                  ) : (
                    <DrawerAction
                      label={pending ? 'Menyimpan…' : 'Setujui'}
                      onClick={() => onApprovePricing(application.id, null)}
                      disabled={pending}
                      variant="primary"
                    />
                  )}
                  {application.product === 'DEPARTURE_BRIDGING' && (
                    <DrawerAction
                      disabled={pending}
                      label="Setujui dengan Nominal Baru"
                      onClick={() => setShowNominalInput(true)}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
                    <svg
                      className="size-4 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Nominal telah disetujui — siswa berada di menu Persiapan Akad
                  </span>
                  {!akadIssued && application.product === 'DEPARTURE_BRIDGING' && (
                    <DrawerAction
                      disabled={pending}
                      label="Setujui dengan Nominal Baru"
                      onClick={() => setShowNominalInput(true)}
                    />
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Rincian Biaya yang Disetujui</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {planApproved
                    ? 'Rincian final yang menjadi dasar penawaran kepada pemohon.'
                    : 'Rincian akan tampil setelah biaya disetujui.'}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                  PRICING_BADGE_STYLES[pricingStatus] ?? 'bg-slate-100 text-slate-700'
                } ring-slate-200`}
              >
                {pricingStatusLabel}
              </span>
            </div>
            {planApproved ? (
              <dl className="divide-y divide-slate-100 px-5 text-xs">
                {(application.product === 'DEPARTURE_BRIDGING'
                  ? approvedWakalahRows
                  : approvedFullCoverRows
                ).map(([label, value], index, rows) => (
                  <div
                    className={`flex items-center justify-between gap-4 py-2.5 ${
                      index === rows.length - 1 ? 'font-bold text-[#0b57d0]' : 'text-slate-600'
                    }`}
                    key={label}
                  >
                    <dt>{label}</dt>
                    <dd
                      className={`shrink-0 text-right ${
                        index === rows.length - 1 ? 'text-sm' : 'font-semibold text-slate-900'
                      }`}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-5 py-4 text-xs text-slate-500">
                Belum ada rincian biaya yang disetujui.
              </p>
            )}
          </section>
        </div>

        {/* TAB: DOCUMENTS */}
        <div className={activeTab === 'documents' ? 'block space-y-4' : 'hidden'}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <span>
              Terunggah:{' '}
              <strong>
                {uploadedCount}/{application.documents.length}
              </strong>
            </span>
            <span>
              Menunggu tinjauan: <strong className="text-amber-700">{reviewCount}</strong>
            </span>
            <span>
              Sesuai: <strong className="text-emerald-700">{verifiedCount}</strong>
            </span>
            <span>
              Tidak sesuai: <strong className="text-red-700">{revisionCount}</strong>
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="px-3.5 py-2.5">No</th>
                  <th className="px-3.5 py-2.5">Dokumen</th>
                  <th className="px-3.5 py-2.5">Kategori</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {definitions.map((def, index) => {
                  const document = application.documents.find(
                    (doc) =>
                      doc.documentType === def.label ||
                      (isFormPendaftaranLabel(def.label) &&
                        isFormPendaftaranLabel(doc.documentType ?? '')),
                  ) ??
                    application.documents[index] ?? {
                      documentType: def.label,
                      status: 'NOT_UPLOADED',
                    }
                  const currentStatus = document.status
                  return (
                    <tr className="hover:bg-slate-50" key={`${def.label}-${index}`}>
                      <td className="px-3.5 py-2.5 text-slate-400">{index + 1}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="font-medium text-slate-900">
                          {def.label}
                          {def?.required && <span className="ml-1 text-red-500">*</span>}
                        </span>
                        {document.fileId && (
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            {document.fileName ?? 'berkas'}{' '}
                            {document.size ? `· ${formatSizeMb(document.size)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-500">
                        {def?.section === 'dokumen-susulan'
                          ? 'Susulan'
                          : def?.section === 'dokumen-pendukung'
                            ? 'Persyaratan'
                            : 'Utama'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            DOCUMENT_BADGE_STYLES[currentStatus] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {DOCUMENT_STATUS_LABELS[currentStatus] ?? currentStatus}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            aria-label={`Pratinjau ${document.documentType}`}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-[#0b57d0]/30 hover:text-[#0b57d0] disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!document.fileId}
                            onClick={() => setPreviewIndex(index)}
                            title="Pratinjau berkas"
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="size-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              viewBox="0 0 24 24"
                            >
                              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </svg>
                          </button>
                          <button
                            aria-label={`Hapus berkas ${document.documentType}`}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!document.fileId || pending}
                            onClick={() => onDeleteDocument(application.id, index)}
                            title="Hapus berkas (status menjadi Tidak sesuai)"
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="size-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
                                strokeLinecap="round"
                              />
                              <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                            </svg>
                          </button>
                          <button
                            aria-label={`Tandai sesuai ${document.documentType}`}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!document.fileId || pending}
                            onClick={() => onApproveDocument(application.id, index)}
                            title="Tandai sesuai"
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="size-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              viewBox="0 0 24 24"
                            >
                              <path
                                d="M5 13l4 4L19 7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TAB: PRICING & DRAFT AKAD */}
        <div className={activeTab === 'pricing' ? 'flex flex-col gap-6' : 'hidden'}>
          {/* EXECUTIVE HERO: PROGRAM & JENIS AKAD SUMMARY */}
          {(() => {
            const isFullCover = application.product === 'FULL_COVER'
            const programSubtitle = isFullCover
              ? 'Program Pembiayaan Pelatihan Bahasa, Skill, & Penempatan Kerja'
              : 'Program Pembiayaan Dana Talang Tiket & Persiapan Berangkat'
            const akadDescription = isFullCover
              ? 'Skema pembiayaan terpadu yang memadukan pelimpahan kuasa pengurusan pendidikan bahasa/skill (Wakalah bil Ujrah) serta komitmen imbalan atas pencapaian keberhasilan penempatan kerja ke luar negeri (Ju’alah). Hak dan kewajiban diselaraskan secara transparan pasca siswa resmi bekerja dan memperoleh penghasilan di negara tujuan.'
              : 'Siswa (Muwakkil) memberikan pelimpahan kuasa penuh kepada VentureGo (Wakil) untuk mengurus, membiayai, dan menyelesaikan kewajiban persiapan keberangkatan siswa ke negara tujuan dengan imbalan jasa (Ujrah) yang disepakati secara transparan dan proporsional tanpa bunga/riba. Biaya pokok (Nafaqah) disalurkan langsung kepada pihak LPK mitra dan maskapai.'

            return (
              <section
                className={`relative overflow-hidden rounded-2xl border p-5 shadow-xs ${isFullCover ? 'border-amber-200/70 bg-gradient-to-br from-white via-amber-50/25 to-emerald-50/25' : 'border-slate-200/90 bg-gradient-to-br from-white via-blue-50/25 to-slate-50'}`}
              >
                {/* Decorative background glow */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -right-10 -top-10 size-56 rounded-full blur-xl ${isFullCover ? 'bg-amber-100/45' : 'bg-blue-100/40'}`}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-0 right-1/4 size-32 rounded-full blur-2xl ${isFullCover ? 'bg-emerald-100/40' : 'bg-indigo-50/50'}`}
                />

                <div className="relative space-y-4">
                  {/* Main Header with Glowing Icon */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div
                      className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr text-white shadow-md ring-4 ${isFullCover ? 'from-amber-500 to-emerald-600 shadow-emerald-500/20 ring-amber-50' : 'from-[#0b57d0] to-[#4285f4] shadow-blue-500/20 ring-blue-50'}`}
                    >
                      <svg
                        aria-hidden="true"
                        className="size-5.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                          Penyusunan Naskah Akad
                        </h2>
                        {akadIssued ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                            <svg
                              className="size-3 text-emerald-600"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.5}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                            Naskah Akad Terbit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                            <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                            Fase Penyusunan Draft
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{programSubtitle}</p>
                    </div>
                  </div>

                  {/* Deskripsi Karakteristik Syariah & Dinamika Akad */}
                  <div className="rounded-xl border border-blue-100/80 bg-white/90 p-4 shadow-2xs">
                    <div className="flex items-start gap-2.5">
                      <svg
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[#0b57d0]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                        />
                      </svg>
                      <div className="space-y-1 text-xs">
                        <strong className="font-bold text-slate-900">
                          Karakteristik & Landasan Akad:
                        </strong>
                        <p className="leading-relaxed text-slate-600">{akadDescription}</p>
                      </div>
                    </div>

                    {/* 3 Dinamika Penyesuaian Pilar */}
                    <div className="mt-3.5 grid gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50/80 px-3 py-2">
                        <span className="text-[10px] font-semibold text-slate-500">
                          Prinsip Biaya Riil (Nafaqah)
                        </span>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-800">
                          Beban riil tagihan LPK & kebutuhan persiapan tanpa mark-up sepihak
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50/80 px-3 py-2">
                        <span className="text-[10px] font-semibold text-slate-500">
                          Imbalan Jasa Terbuka (Ujrah)
                        </span>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-800">
                          Proporsional sesuai kesepakatan, tanpa bunga berjalan maupun denda
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50/80 px-3 py-2">
                        <span className="text-[10px] font-semibold text-slate-500">
                          Keluwesan Angsuran
                        </span>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-800">
                          Mulai diangsur setelah siswa aktif menerima penghasilan di negara tujuan
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )
          })()}

          <fieldset
            className="m-0 min-w-0 border-0 p-0 block disabled:opacity-75 [&_button]:disabled:cursor-not-allowed [&_input]:disabled:bg-slate-50"
            disabled={akadIssued}
          >
            <FinanceTermsFields
              applicantName={application.applicantName}
              departureDetails={application.departureDetails}
              financialPlan={application.financialPlan}
              fullCoverDetails={application.fullCoverDetails}
              personalDetails={application.personalDetails}
              phone={application.phone}
              issuedAkad={akadMeta}
              key={financeTermsKey}
              lpkName={application.lpkName}
              product={application.product}
            />
          </fieldset>

          <section
            className={`relative overflow-hidden rounded-2xl border shadow-sm ${application.product === 'FULL_COVER' ? 'border-amber-200/80 bg-gradient-to-br from-white via-amber-50/25 to-emerald-50/30' : 'border-blue-200/80 bg-gradient-to-br from-white via-blue-50/25 to-slate-50'}`}
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -right-10 -top-12 size-48 rounded-full blur-xl ${application.product === 'FULL_COVER' ? 'bg-emerald-100/50' : 'bg-blue-100/50'}`}
            />
            <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${application.product === 'FULL_COVER' ? 'bg-gradient-to-br from-amber-500 to-emerald-600' : 'bg-gradient-to-br from-[#0b57d0] to-[#4285f4]'}`}
                >
                  <svg
                    aria-hidden="true"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                    <path d="M14 3v5h5" />
                    <path d="M9 13h6M9 17h4" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Dokumen Akad</h3>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${akadIssued ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${akadIssued ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`}
                      />
                      {akadIssued ? 'Telah diterbitkan' : 'Siap ditinjau'}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
                    {akadIssued
                      ? 'Dokumen final tersimpan dan rincian akad telah dikunci.'
                      : 'Pratinjau naskah dari data Draft Akad yang sudah disimpan sebelum diterbitkan.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative space-y-4 px-5 py-4">
              {akadIssued && akadMeta ? (
                <div className="grid gap-3 rounded-xl border border-emerald-200 bg-white/85 p-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-semibold text-emerald-700">Nomor Dokumen</dt>
                    <dd className="mt-0.5 text-sm font-bold text-emerald-950">
                      {akadMeta.documentNumber || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-emerald-700">NIS Pemohon</dt>
                    <dd className="mt-0.5 text-sm font-bold text-emerald-950">
                      {akadMeta.studentNumber || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-emerald-700">Diterbitkan</dt>
                    <dd className="mt-0.5 text-sm font-bold text-emerald-950">
                      {formatDateTime(akadMeta.issuedAt)}
                    </dd>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-white/80 p-3.5">
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <svg
                      aria-hidden="true"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 8v4m0 4h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Belum diterbitkan</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                      Nomor dokumen mengikuti urutan NIS. Status biaya harus Terverifikasi sebelum
                      akad dapat diterbitkan.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
                <button
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
                  disabled={akadPreviewLoading}
                  onClick={openAkadPreview}
                  type="button"
                >
                  Preview PDF
                </button>
                <a
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs font-semibold text-[#0b57d0] shadow-2xs transition hover:border-blue-300 hover:bg-blue-100/70 hover:text-[#0842a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
                  href={`/api/admin/applications/${application.id}/gdocs`}
                  rel="noopener noreferrer"
                  target="_blank"
                  title="Buka naskah akad di Google Docs (tab baru)"
                >
                  <svg
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[#0b57d0]"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                    <path d="M8 12h8v2H8zm0 4h8v2H8z" />
                  </svg>
                  <span>Preview Gdocx</span>
                  <svg
                    aria-hidden="true"
                    className="size-3 shrink-0 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
                {akadIssued ? (
                  <a
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
                    href={`/api/admin/applications/${application.id}/akad?mode=docx`}
                  >
                    Unduh .docx
                  </a>
                ) : (
                  <button
                    className={`rounded-lg px-4 py-2.5 text-xs font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${application.product === 'FULL_COVER' ? 'bg-gradient-to-r from-amber-600 to-emerald-700 hover:from-amber-700 hover:to-emerald-800 focus-visible:outline-emerald-700' : 'bg-[#0b57d0] hover:bg-[#0842a0] focus-visible:outline-[#0b57d0]'}`}
                    disabled={!akadGateOpen || pending || akadIssuing}
                    onClick={issueAkad}
                    type="button"
                  >
                    {akadIssuing ? 'Menerbitkan…' : 'Terbitkan Dokumen Akad'}
                  </button>
                )}
              </div>
              {akadIssueError && (
                <div
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-800"
                  role="alert"
                >
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4m0 4h.01" />
                  </svg>
                  <p>{akadIssueError}</p>
                </div>
              )}
              {!akadIssued && !akadGateOpen && (
                <p className="text-[11px] text-amber-700">
                  Status biaya harus Terverifikasi sebelum dokumen dapat diterbitkan.
                </p>
              )}
            </div>
          </section>

          {!akadIssued && (
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-[11px] leading-5 text-slate-500">
                Simpan perubahan Draft Akad agar pratinjau dan penerbitan dokumen memakai data
                terbaru. Tombol ini menyimpan draft, bukan menerbitkan akad.
              </p>
              <button
                className="shrink-0 rounded-lg bg-[#0b57d0] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0842a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? 'Menyimpan…' : 'Simpan Draft Akad'}
              </button>
            </div>
          )}
        </div>

        {/* TAB: CONTRACT APPROVAL */}
        <div className={activeTab === 'contract' ? 'block space-y-5' : 'hidden'}>
          {/* BAGIAN 1: HEADER & READINESS QUICK BAR */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-blue-50/50 p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Perjalanan Persetujuan Pembiayaan
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                      STATUS_BADGE_STYLES[application.status] ??
                      'bg-slate-100 text-slate-700 ring-slate-200'
                    }`}
                  >
                    {STATUS_LABELS[application.status as keyof typeof STATUS_LABELS] ??
                      application.status}
                  </span>
                  {akadMeta?.studentNumber && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                      NIS {akadMeta.studentNumber}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Pemohon: <strong className="text-slate-800">{application.applicantName}</strong> ·
                  LPK: <strong className="text-slate-800">{application.lpkName}</strong> · Terakhir
                  diperbarui: {formatDateTime(application.updatedAt ?? application.createdAt)}
                </p>
              </div>
            </div>

            {/* Readiness 4-item Checklist Cards */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. Berkas */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-[#0b57d0]/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    1. Kelengkapan Berkas
                  </span>
                  {verifiedCount === application.documents.length &&
                  application.documents.length > 0 ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <strong className="block text-sm font-bold text-slate-900">
                    {verifiedCount}/{application.documents.length} Sesuai
                  </strong>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {reviewCount > 0
                      ? `${reviewCount} menunggu tinjauan`
                      : revisionCount > 0
                        ? `${revisionCount} perlu revisi`
                        : 'Seluruh berkas terverifikasi'}
                  </span>
                </div>
                <button
                  className="mt-3 inline-flex items-center text-[11px] font-semibold text-[#0b57d0] hover:underline"
                  onClick={() => setActiveTab('documents')}
                  type="button"
                >
                  Kelola berkas →
                </button>
              </div>

              {/* 2. Biaya */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-[#0b57d0]/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    2. Penetapan Biaya
                  </span>
                  {pricingStatus === 'AGREED' ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : pricingStatus === 'VERIFIED' ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <strong className="block text-sm font-bold text-slate-900">
                    {pricingStatusLabel} (Keputusan Admin)
                  </strong>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    Principal: {formatRupiah(planPrincipal > 0 ? planPrincipal : requestedAmount)}
                  </span>
                </div>
                <button
                  className="mt-3 inline-flex items-center text-[11px] font-semibold text-[#0b57d0] hover:underline"
                  onClick={() => setActiveTab('nominal')}
                  type="button"
                >
                  Atur nominal →
                </button>
              </div>

              {/* 3. Dokumen Akad Resmi */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-[#0b57d0]/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    3. Dokumen Akad Resmi
                  </span>
                  {akadIssued ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <strong className="block text-sm font-bold text-slate-900">
                    {akadIssued ? 'Akad Terbit' : 'Draft Akad'}
                  </strong>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {akadMeta?.documentNumber ?? 'Belum diterbitkan'}
                  </span>
                </div>
                <button
                  className="mt-3 inline-flex items-center text-[11px] font-semibold text-[#0b57d0] hover:underline"
                  onClick={() => setActiveTab('pricing')}
                  type="button"
                >
                  Kelola naskah akad →
                </button>
              </div>

              {/* 4. Berkas Akad Bertandatangan */}
              <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-xs transition hover:border-[#0b57d0]/40">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">
                    4. Salinan PDF Akad
                  </span>
                  {agreementPdfCurrent ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <svg
                        aria-hidden="true"
                        className="size-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <strong className="block text-sm font-bold text-slate-900">
                    {agreementPdfCurrent ? 'Salinan PDF Siap' : 'Menunggu PDF Basah'}
                  </strong>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {application.financialPlan?.finalAgreementReference
                      ? String(application.financialPlan.finalAgreementReference)
                      : 'Referensi belum diisi'}
                  </span>
                </div>
                <span className="mt-3 text-[11px] text-slate-400">
                  {agreementPdfCurrent ? 'Tersimpan di Drive' : 'Unggah pindaian di bawah'}
                </span>
              </div>
            </div>
          </section>

          {/* BAGIAN 2: TIMELINE STEPPER PERJALANAN PERSETUJUAN */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">Timeline Tahapan Persetujuan</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Keputusan persetujuan dan nominal pembiayaan mutlak ditetapkan oleh staf admin.
              </p>
            </div>

            <div className="p-5 space-y-5">
              {/* Step 1 */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center self-stretch">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white shadow-xs ${
                      verifiedCount === application.documents.length &&
                      application.documents.length > 0
                        ? 'bg-emerald-600 text-white'
                        : uploadedCount > 0
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {verifiedCount === application.documents.length &&
                    application.documents.length > 0 ? (
                      <svg
                        aria-hidden="true"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      '1'
                    )}
                  </div>
                  <div className="my-1.5 w-0.5 grow bg-slate-200" />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Pendaftaran & Pemeriksaan Berkas
                    </h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        verifiedCount === application.documents.length &&
                        application.documents.length > 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : reviewCount > 0
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {verifiedCount === application.documents.length &&
                      application.documents.length > 0
                        ? 'Selesai'
                        : `${verifiedCount}/${application.documents.length} sesuai`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Diajukan pada <strong>{formatDateTime(application.createdAt)}</strong> oleh{' '}
                    <strong>{application.applicantName}</strong> ({application.lpkName}).
                    {reviewCount > 0 && ` Terdapat ${reviewCount} berkas baru menunggu tinjauan.`}
                    {revisionCount > 0 && ` Ada ${revisionCount} berkas perlu perbaikan pemohon.`}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center self-stretch">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white shadow-xs ${
                      pricingStatus === 'AGREED'
                        ? 'bg-emerald-600 text-white'
                        : pricingStatus === 'VERIFIED'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {pricingStatus === 'AGREED' ? (
                      <svg
                        aria-hidden="true"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      '2'
                    )}
                  </div>
                  <div className="my-1.5 w-0.5 grow bg-slate-200" />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Penetapan & Persetujuan Biaya (Keputusan Mutlak Admin)
                    </h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        pricingStatus === 'AGREED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : pricingStatus === 'VERIFIED'
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {pricingStatusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    Admin memiliki wewenang penuh menetapkan nominal pembiayaan: Principal diajukan{' '}
                    <strong>{formatRupiah(requestedAmount)}</strong>
                    {planPrincipal > 0 && planPrincipal !== requestedAmount && (
                      <>
                        {' '}
                        · Disetujui admin: <strong>{formatRupiah(planPrincipal)}</strong>
                      </>
                    )}
                    {planTotal > 0 && (
                      <>
                        {' '}
                        · Total kewajiban: <strong>{formatRupiah(planTotal)}</strong>
                      </>
                    )}
                    . Tidak memerlukan konfirmasi siswa; penetapan langsung sah menjadi acuan akad.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center self-stretch">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white shadow-xs ${
                      akadIssued
                        ? 'bg-emerald-600 text-white'
                        : pricingStatus === 'VERIFIED' || pricingStatus === 'AGREED'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {akadIssued ? (
                      <svg
                        aria-hidden="true"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      '3'
                    )}
                  </div>
                  <div className="my-1.5 w-0.5 grow bg-slate-200" />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Penerbitan Akad & Aktivasi Angsuran
                    </h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        akadIssued
                          ? 'bg-emerald-50 text-emerald-700'
                          : pricingStatus === 'VERIFIED' || pricingStatus === 'AGREED'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {akadIssued ? 'Akad Terbit' : 'Draft Akad'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {akadIssued ? (
                      <>
                        Dokumen akad resmi terbit dengan nomor kontrak{' '}
                        <strong>{akadMeta?.documentNumber}</strong> (NIS:{' '}
                        <strong>{akadMeta?.studentNumber}</strong>). Status angsuran kini Aktif;
                        naskah siap dicetak untuk proses tanda tangan basah bersama pemohon dan
                        wali.
                      </>
                    ) : (
                      'Naskah dokumen akad resmi (.docx) belum diterbitkan. Dapat diterbitkan langsung di tab Draft Akad setelah rincian biaya terverifikasi oleh staf.'
                    )}
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center self-stretch">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white shadow-xs ${
                      agreementPdfCurrent
                        ? 'bg-emerald-600 text-white'
                        : application.status === 'CANCELLED' || application.status === 'REJECTED'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {agreementPdfCurrent ? (
                      <svg
                        aria-hidden="true"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        viewBox="0 0 24 24"
                      >
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      '4'
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      Arsip Salinan Akad Bertanda Tangan Basah
                    </h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        STATUS_BADGE_STYLES[application.status] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {STATUS_LABELS[application.status as keyof typeof STATUS_LABELS] ??
                        application.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {application.status === 'COMPLETED'
                      ? 'Kewajiban pembiayaan siswa telah tuntas selesai sepenuhnya.'
                      : application.status === 'CANCELLED' || application.status === 'REJECTED'
                        ? 'Pengajuan telah ditutup/dibatalkan.'
                        : agreementPdfCurrent
                          ? 'Salinan akad bertanda tangan basah telah tersimpan di arsip.'
                          : application.status === 'ACTIVE'
                            ? 'Angsuran aktif sejak dokumen akad diterbitkan. Unggah salinan bertanda tangan basah untuk melengkapi arsip.'
                            : 'Setelah akad ditandatangani, unggah salinan pindaian bertanda tangan basah untuk melengkapi arsip.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* BAGIAN 3: CATATAN INTERNAL STAF */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-bold text-slate-900">Catatan Internal Staf</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Catatan internal staf mengenai proses verifikasi, kondisi khusus siswa, atau
                kelayakan pengajuan.
              </p>
            </div>
            <div className="p-5 space-y-4">
              {/* Field Tanggal Penerbangan Keberangkatan */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <svg
                        aria-hidden="true"
                        className="size-4 text-[#0b57d0]"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                      </svg>
                      Tanggal Penerbangan Keberangkatan
                    </span>
                    {flightDepartureDate ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        Terjadwal · {formatDateShort(flightDepartureDate)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-normal text-slate-400">
                        Belum dijadwalkan
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    Diinput oleh admin setelah konfirmasi langsung ke siswa saat akad mengenai
                    tanggal tiket penerbangan keberangkatan.
                  </span>
                  <div className="mt-2.5 flex items-center gap-3">
                    <input
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] focus:outline-none"
                      onChange={(event) => setFlightDepartureDate(event.target.value)}
                      type="date"
                      value={flightDepartureDate}
                    />
                    {flightDepartureDate && (
                      <button
                        className="text-[11px] font-medium text-slate-500 hover:text-red-600 transition"
                        onClick={() => setFlightDepartureDate('')}
                        type="button"
                      >
                        Hapus Tanggal
                      </button>
                    )}
                  </div>
                </label>
              </div>

              <label className="space-y-1.5 text-xs font-semibold text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="sr-only">Catatan Internal</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {workflowNotes.length}/2000 karakter
                  </span>
                </div>
                <textarea
                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-normal text-slate-900 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] focus:outline-none"
                  maxLength={2000}
                  onChange={(event) => setWorkflowNotes(event.target.value)}
                  placeholder="Catatan khusus staf mengenai proses verifikasi, kondisi khusus siswa, atau catatan kelayakan…"
                  rows={4}
                  value={workflowNotes}
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span className="text-[11px] text-slate-400">
                  Catatan staf & tanggal penerbangan disimpan terpisah dari rincian biaya.
                </span>
                <button
                  className="rounded-lg bg-[#0b57d0] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#0842a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:opacity-50"
                  disabled={pending || !workflowDirty}
                  onClick={() =>
                    onWorkflow(application.id, workflowStatus, workflowNotes, flightDepartureDate)
                  }
                  type="button"
                >
                  {pending ? 'Menyimpan…' : 'Simpan Catatan & Tanggal'}
                </button>
              </div>
            </div>
          </section>

          {/* BAGIAN 4: BERKAS AKAD FINAL BERTANDATANGAN (PDF VAULT & FIELD UPLOAD) */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Salinan PDF Akad Bertandatangan Basah
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Unggah pindaian (scan) PDF naskah akad Wakalah bil Ujrah yang telah
                    ditandatangani basah oleh siswa/wali dan pihak VentureGo.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    Ref Akad:{' '}
                    <strong className="text-slate-800">
                      {application.financialPlan?.finalAgreementReference
                        ? String(application.financialPlan.finalAgreementReference)
                        : 'Belum diisi'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Existing file box or prominent upload field */}
              {agreementPdfCurrent && application.agreementPdf ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <svg
                        aria-hidden="true"
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {application.agreementPdf.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatSizeMb(application.agreementPdf.size)} · Diunggah oleh{' '}
                        {application.agreementPdf.uploadedBy}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      className="rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0b57d0] shadow-xs transition hover:bg-blue-50"
                      href={`/api/admin/applications/${application.id}/agreement`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Buka PDF Salinan
                    </a>
                    <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50">
                      <span>{agreementUploading ? 'Mengunggah…' : 'Ganti PDF'}</span>
                      <input
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        disabled={agreementUploading}
                        onChange={(event) => {
                          void selectAgreementPdf(event.target.files?.[0])
                          event.target.value = ''
                        }}
                        type="file"
                      />
                    </label>
                  </div>
                </div>
              ) : application.agreementPdf ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-amber-900">
                        PDF tersimpan untuk referensi akad sebelumnya (
                        {application.agreementPdf.fileName}).
                      </p>
                      <p className="mt-1 text-[11px] text-amber-700">
                        Referensi akad pada Draft Akad telah diperbarui. Harap unggah salinan PDF
                        baru untuk menyesuaikan dengan naskah akad terkini.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#0b57d0] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0842a0]">
                      <svg
                        aria-hidden="true"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>
                        {agreementUploading ? 'Mengunggah PDF…' : 'Unggah PDF Versi Baru'}
                      </span>
                      <input
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        disabled={agreementUploading}
                        onChange={(event) => {
                          void selectAgreementPdf(event.target.files?.[0])
                          event.target.value = ''
                        }}
                        type="file"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                /* Field Upload Dropzone yang Jelas & Interaktif */
                <label
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center transition hover:border-[#0b57d0] hover:bg-blue-50/30 ${
                    agreementUploading ? 'pointer-events-none opacity-60' : ''
                  }`}
                >
                  <input
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    disabled={agreementUploading}
                    onChange={(event) => {
                      void selectAgreementPdf(event.target.files?.[0])
                      event.target.value = ''
                    }}
                    type="file"
                  />
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-100/80 text-[#0b57d0] shadow-xs transition-transform group-hover:scale-105">
                    {agreementUploading ? (
                      <svg className="size-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          d="M4 12a8 8 0 018-8v8H4z"
                          fill="currentColor"
                        />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-800 group-hover:text-[#0b57d0]">
                    {agreementUploading
                      ? 'Sedang mengunggah salinan PDF ke Google Drive…'
                      : 'Klik untuk Memilih / Mengunggah Salinan PDF Akad'}
                  </p>
                  <p className="mt-1 max-w-sm text-[11px] text-slate-500">
                    Format berkas PDF, ukuran maksimal 4 MB. Berkas pindaian fisik ini otomatis
                    diarsipkan langsung ke Google Drive siswa.
                  </p>
                  <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs group-hover:border-[#0b57d0] group-hover:text-[#0b57d0]">
                    <svg
                      aria-hidden="true"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Pilih Berkas PDF</span>
                  </div>
                </label>
              )}

              {agreementUploadError && (
                <p className="text-xs text-red-700 font-medium" role="alert">
                  {agreementUploadError}
                </p>
              )}
            </div>
          </section>

          {/* BAGIAN 5: FOTO DOKUMENTASI PENANDATANGANAN AKAD */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Foto Dokumentasi Ketika Akad</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Unggah foto-foto dokumentasi penandatanganan akad (siswa, wali, dan staf/LPK).
                    Tersimpan otomatis di Google Drive pada folder <strong>Dokumentasi Akad</strong>{' '}
                    di dalam folder root siswa.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#0b57d0]">
                    {Array.isArray(application.akadPhotos) ? application.akadPhotos.length : 0} Foto
                    Terunggah
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Existing photos gallery */}
              {Array.isArray(application.akadPhotos) && application.akadPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {application.akadPhotos.map((photo, pIdx) => (
                    <div
                      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-2xs transition hover:shadow-md"
                      key={photo.fileId || pIdx}
                    >
                      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={photo.fileName || `Foto akad ${pIdx + 1}`}
                          className="size-full object-cover transition-transform group-hover:scale-105"
                          src={`/api/admin/applications/${application.id}/akad-photos/${pIdx}?inline=1`}
                        />
                        <button
                          className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() =>
                            setLightboxPhotoUrl(
                              `/api/admin/applications/${application.id}/akad-photos/${pIdx}?inline=1`,
                            )
                          }
                          type="button"
                        >
                          <span className="rounded-lg bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-900 shadow-xs backdrop-blur-xs">
                            Lihat Foto
                          </span>
                        </button>
                      </div>
                      <div className="p-2.5">
                        <p
                          className="truncate text-xs font-semibold text-slate-800"
                          title={photo.fileName}
                        >
                          {photo.fileName}
                        </p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                          <span>{formatSizeMb(photo.size)}</span>
                          <button
                            className="text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
                            disabled={photoUploading}
                            onClick={() => void handleDeleteAkadPhoto(photo.fileId)}
                            title="Hapus foto ini"
                            type="button"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Dropzone */}
              <label
                className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center transition hover:border-[#0b57d0] hover:bg-blue-50/30 ${
                  photoUploading ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                <input
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  disabled={photoUploading}
                  multiple
                  onChange={(event) => {
                    void selectAkadPhotos(event.target.files)
                    event.target.value = ''
                  }}
                  type="file"
                />
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100/80 text-emerald-700 shadow-xs transition-transform group-hover:scale-105">
                  {photoUploading ? (
                    <svg className="size-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="size-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <p className="mt-3 text-xs font-bold text-slate-800 group-hover:text-[#0b57d0]">
                  {photoUploading
                    ? 'Sedang mengunggah foto ke folder Dokumentasi Akad…'
                    : 'Unggah Foto Dokumentasi Akad'}
                </p>
                <p className="mt-1 max-w-sm text-[11px] text-slate-500">
                  Dapat memilih beberapa foto sekaligus (JPG, PNG, WEBP, maks 10 MB per foto).
                  Tersimpan langsung di Google Drive folder <strong>Dokumentasi Akad</strong>.
                </p>
                <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs group-hover:border-[#0b57d0] group-hover:text-[#0b57d0]">
                  <svg
                    aria-hidden="true"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Pilih Foto Dokumentasi</span>
                </div>
              </label>

              {photoError && (
                <p className="text-xs text-red-700 font-medium" role="alert">
                  {photoError}
                </p>
              )}
            </div>
          </section>

          {/* Lightbox Preview Modal */}
          {lightboxPhotoUrl && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
              onClick={() => setLightboxPhotoUrl(null)}
            >
              <div
                className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-black p-2 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-md transition hover:bg-slate-900"
                  onClick={() => setLightboxPhotoUrl(null)}
                  type="button"
                >
                  ✕
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Pratinjau foto dokumentasi akad"
                  className="max-h-[82vh] w-auto rounded-lg object-contain"
                  src={lightboxPhotoUrl}
                />
              </div>
            </div>
          )}
        </div>

        {/* TAB: RIWAYAT ANGSURAN */}
        <div className={activeTab === 'installment-history' ? 'block' : 'hidden'}>
          {(() => {
            const installmentSummary = summarizeInstallments(application, todayIso, payments)
            const scheduleRows = installmentSummary.rows
            const totalObligation =
              installmentSummary.obligation ??
              installmentSummary.schedule.reduce((sum, row) => sum + row.amount, 0)
            const paidAmount = installmentSummary.paidAmount
            const remaining = installmentSummary.remaining
            const isStarted = paidAmount > 0
            const applicationPayments = payments.filter(
              (payment) =>
                payment.applicationDocId === application.id ||
                (!payment.applicationDocId && payment.applicationId === application.applicationId),
            )

            return (
              <div className="space-y-5">
                {/* Ringkasan skema angsuran */}
                <div
                  className={`rounded-2xl border p-4 shadow-xs ${installmentSummary.isLegacy ? 'border-amber-200/80 bg-amber-50/70' : 'border-blue-200/80 bg-blue-50/70'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#0b57d0]">
                      <svg
                        aria-hidden="true"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        {installmentSummary.isLegacy
                          ? 'Jadwal Angsuran LGC · Riwayat Kontrak Lama'
                          : 'Skema Angsuran Fleksibel'}{' '}
                        · {isStarted ? 'Sedang Berjalan' : 'Belum Mulai Mengangsur'}
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {installmentSummary.isLegacy
                          ? 'Tanggal dan nominal mengikuti jadwal kontrak legacy yang diimpor. Status pembayaran memakai paidInstallments dan alokasi transaksi legacy yang tersedia; pembayaran tanpa nomor cicilan ditampilkan terpisah dan tidak ditebak alokasinya.'
                          : 'Jadwal dan nominal cicilan di bawah merupakan asumsi default / estimasi acuan. Tanggal dan besaran angsuran bersifat fleksibel menyesuaikan kemampuan serta kesepakatan riil saat siswa mulai mengangsur.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Tabel Angsuran */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {installmentSummary.isLegacy
                          ? 'Jadwal & Riwayat Pembayaran LGC'
                          : 'Riwayat & Estimasi Angsuran'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {installmentSummary.isLegacy
                          ? 'Rincian cicilan dan transaksi historis yang berhasil dialokasikan ke kontrak lama.'
                          : 'Rincian asumsi default angsuran dan pencatatan pembayaran siswa.'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        isStarted
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                      }`}
                    >
                      <span
                        className={`size-2 rounded-full ${
                          isStarted ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      {isStarted ? 'Angsuran Berjalan' : 'Belum Mulai Mengangsur'}
                    </span>
                  </div>

                  {scheduleRows.length === 0 && !installmentSummary.isLegacy ? (
                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                      <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                        <svg
                          aria-hidden="true"
                          className="size-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <p className="mt-3 text-xs font-bold text-slate-700">
                        Belum ada jadwal angsuran
                      </p>
                      <p className="mt-1 max-w-sm text-[11px] text-slate-500">
                        Jadwal asumsi default akan tersedia setelah rincian biaya disetujui dan
                        dokumen akad diterbitkan.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Stat strip ringkasan */}
                      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
                        <div className="px-5 py-3.5 text-center">
                          <p className="text-[11px] font-medium text-slate-500">
                            {installmentSummary.isLegacy
                              ? 'Total Kewajiban Kontrak'
                              : 'Total Kewajiban (Asumsi)'}
                          </p>
                          <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                            {formatRupiah(totalObligation)}
                          </p>
                        </div>
                        <div className="px-5 py-3.5 text-center">
                          <p className="text-[11px] font-medium text-slate-500">
                            Realisasi Terbayar
                          </p>
                          <p className="mt-0.5 text-sm font-extrabold text-emerald-700">
                            {formatRupiah(paidAmount)}
                          </p>
                        </div>
                        <div className="px-5 py-3.5 text-center">
                          <p className="text-[11px] font-medium text-slate-500">Sisa Kewajiban</p>
                          <p
                            className={`mt-0.5 text-sm font-extrabold ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                          >
                            {formatRupiah(remaining)}
                          </p>
                        </div>
                        <div className="px-5 py-3.5 text-center">
                          <p className="text-[11px] font-medium text-slate-500">Progres Lunas</p>
                          <p className="mt-0.5 text-sm font-extrabold text-slate-800">
                            {installmentSummary.paidCount}
                            <span className="text-xs font-normal text-slate-400">
                              /{scheduleRows.length} bulan
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Tabel jadwal */}
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              <th className="px-5 py-3.5"># Cicilan</th>
                              <th className="px-5 py-3.5">
                                {installmentSummary.isLegacy ? 'Jatuh Tempo' : 'Tanggal Angsuran'}
                              </th>
                              <th className="px-5 py-3.5 text-right">
                                {installmentSummary.isLegacy
                                  ? 'Nominal Angsuran'
                                  : 'Nominal Asumsi (Default)'}
                              </th>
                              <th className="px-5 py-3.5 text-right">Realisasi Bayar</th>
                              <th className="px-5 py-3.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {scheduleRows.length === 0 ? (
                              <tr>
                                <td className="px-5 py-5 text-center text-slate-500" colSpan={5}>
                                  Belum ada rincian jadwal cicilan pada kontrak ini.
                                </td>
                              </tr>
                            ) : (
                              scheduleRows.map((row) => {
                                const overdue =
                                  installmentSummary.isLegacy &&
                                  !row.isPaid &&
                                  row.dueDate < todayIso
                                const rowStatus = row.isPaid
                                  ? 'Lunas'
                                  : row.isPartial
                                    ? overdue
                                      ? 'Sebagian · Terlambat'
                                      : 'Sebagian dibayar'
                                    : overdue
                                      ? 'Terlambat'
                                      : installmentSummary.isLegacy
                                        ? 'Belum dibayar'
                                        : 'Belum Mulai'
                                return (
                                  <tr
                                    className={`transition-colors hover:bg-slate-50/60 ${row.isPaid ? 'bg-emerald-50/20' : ''}`}
                                    key={row.installment}
                                  >
                                    <td className="px-5 py-3.5 font-bold text-slate-800">
                                      Cicilan #{row.installment}
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-500">
                                      {installmentSummary.isLegacy || row.isPaid ? (
                                        <span className="font-medium text-slate-700">
                                          {formatDateShort(row.dueDate)}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                                          <span>—</span>
                                          <span className="text-[10px] text-slate-400 font-normal">
                                            (fleksibel)
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                      <span className="font-semibold text-slate-900">
                                        {formatRupiah(row.amount)}
                                      </span>
                                      {!installmentSummary.isLegacy && (
                                        <span className="block text-[10px] text-slate-400 font-normal">
                                          asumsi default
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                      {row.appliedAmount > 0 ? (
                                        <span className="font-semibold text-emerald-700">
                                          {formatRupiah(row.appliedAmount)}
                                          {row.isPartial && (
                                            <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                                              Sisa {formatRupiah(row.remaining)}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                      <span
                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                          row.isPaid
                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                            : overdue
                                              ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                                              : row.isPartial
                                                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                        }`}
                                      >
                                        {row.isPaid ? '✓ Lunas' : rowStatus}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t border-slate-100 p-4">
                        <h4 className="mb-2 text-xs font-bold text-slate-700">
                          Riwayat Transaksi Angsuran (
                          {
                            applicationPayments.filter((payment) => payment.type === 'INSTALLMENT')
                              .length
                          }
                          )
                        </h4>
                        {applicationPayments.some((payment) => payment.type === 'INSTALLMENT') ? (
                          <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                  <th className="px-3 py-2">Tanggal</th>
                                  <th className="px-3 py-2">Alokasi</th>
                                  <th className="px-3 py-2">Keterangan</th>
                                  <th className="px-3 py-2 text-right">Nominal</th>
                                  <th className="px-3 py-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {applicationPayments
                                  .filter((payment) => payment.type === 'INSTALLMENT')
                                  .map((payment) => (
                                    <tr
                                      className="border-b border-slate-100 last:border-0"
                                      key={payment.id}
                                    >
                                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                        {formatDateShort(payment.paidAt ?? payment.createdAt)}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                        {payment.installmentNumber
                                          ? `Cicilan #${payment.installmentNumber}`
                                          : 'Belum dialokasikan'}
                                      </td>
                                      <td className="px-3 py-2 text-slate-700">
                                        {payment.description || 'Pembayaran angsuran'}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">
                                        {formatRupiah(payment.amount)}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Belum ada transaksi angsuran yang tercatat.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            )
          })()}
        </div>

        {/* TAB: RIWAYAT PROGRAM */}
        <div className={activeTab === 'program-history' ? 'block' : 'hidden'}>
          {(() => {
            const dep = application.departureDetails ?? {}
            const depDest = typeof dep.destination === 'string' ? dep.destination : '-'
            const depAmount = Number(dep.requestedFinancingAmount) || 0
            const programs: {
              applicationId: string
              product: string
              lpk: string
              destination: string
              status: string
              requestedAmount: number
              pricingStatus: string
              akadIssued: boolean
              documentNumber?: string
              createdAt: string
            }[] = [
              {
                applicationId: application.applicationId,
                product:
                  (application.product as string) === 'FULL_COVER'
                    ? 'VSV Full Cover'
                    : 'VSV Dana Keberangkatan',
                lpk: application.lpkName,
                destination: depDest,
                status: application.status,
                requestedAmount: depAmount,
                pricingStatus:
                  typeof application.financialPlan?.pricingStatus === 'string'
                    ? application.financialPlan.pricingStatus
                    : 'ESTIMATED',
                akadIssued: Boolean(
                  application.financialPlan?.akadDocument &&
                  typeof (application.financialPlan.akadDocument as Record<string, unknown>)
                    .documentNumber === 'string',
                ),
                documentNumber:
                  typeof (application.financialPlan?.akadDocument as Record<string, unknown>)
                    ?.documentNumber === 'string'
                    ? String(
                        (application.financialPlan?.akadDocument as Record<string, unknown>)
                          .documentNumber,
                      )
                    : undefined,
                createdAt: application.createdAt,
              },
            ]

            const isRunning = (s: string) => s === 'ACTIVE'
            const isDone = (s: string) => s === 'COMPLETED'

            return (
              <div className="space-y-5">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="text-sm font-bold text-slate-900">Riwayat Program Siswa</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Daftar program pembiayaan yang diikuti siswa beserta informasi umum dan status
                      perjalanan program.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <th className="px-5 py-3.5">Informasi Umum Program</th>
                          <th className="px-5 py-3.5">LPK Mitra & Tujuan</th>
                          <th className="px-5 py-3.5 text-right">Plafon Pembiayaan</th>
                          <th className="px-5 py-3.5">Dokumen Akad</th>
                          <th className="px-5 py-3.5">Status Program</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {programs.map((prog) => (
                          <tr
                            className="hover:bg-slate-50/60 transition-colors"
                            key={prog.applicationId}
                          >
                            <td className="px-5 py-3.5">
                              <span className="block font-semibold text-slate-900">
                                {prog.product}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                ID: {prog.applicationId} · Didaftarkan:{' '}
                                {formatDateShort(prog.createdAt)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="block font-medium text-slate-900">{prog.lpk}</span>
                              <span className="text-[11px] text-slate-500">
                                {prog.destination === 'JAPAN'
                                  ? '🇯🇵 Jepang'
                                  : prog.destination === 'TURKEY'
                                    ? '🇹🇷 Turki'
                                    : prog.destination}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                              {formatRupiah(prog.requestedAmount)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                  prog.akadIssued
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                }`}
                              >
                                {prog.akadIssued ? 'Terbit' : 'Draft'}
                              </span>
                              {prog.documentNumber && (
                                <span className="block mt-0.5 font-mono text-[10px] text-slate-500">
                                  {prog.documentNumber}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                                  isDone(prog.status)
                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                                    : isRunning(prog.status)
                                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                      : prog.status === 'CANCELLED' || prog.status === 'REJECTED'
                                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                }`}
                              >
                                {isDone(prog.status) ? (
                                  '✓ Sudah Selesai'
                                ) : isRunning(prog.status) ? (
                                  <>
                                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Sedang Berjalan
                                  </>
                                ) : (
                                  (STATUS_LABELS[prog.status as keyof typeof STATUS_LABELS] ??
                                  prog.status)
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-100 px-5 py-3">
                    <p className="text-[11px] text-slate-400">
                      Menampilkan {programs.length} program terdaftar untuk siswa ini.
                    </p>
                  </div>
                </section>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Slide-over preview berkas dokumen */}
      {previewIndex !== null && previewDocument && (
        <div className="fixed inset-0 z-[60] flex justify-end overflow-hidden bg-slate-900/50">
          <div className="flex h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">{previewDocument.documentType}</h3>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {previewDocument.fileName ?? 'berkas'}{' '}
                  {previewDocument.size ? `· ${formatSizeMb(previewDocument.size)}` : ''}
                </p>
                <span
                  className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    DOCUMENT_BADGE_STYLES[previewDocument.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {DOCUMENT_STATUS_LABELS[previewDocument.status] ?? previewDocument.status}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                  disabled={pending}
                  onClick={() => {
                    onDeleteDocument(application.id, previewIndex)
                    setPreviewIndex(null)
                  }}
                  type="button"
                >
                  Hapus Berkas
                </button>
                <button
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                  disabled={pending}
                  onClick={() => {
                    onApproveDocument(application.id, previewIndex)
                    setPreviewIndex(null)
                  }}
                  type="button"
                >
                  Tandai Sesuai
                </button>
                <button
                  aria-label="Tutup pratinjau berkas"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  onClick={() => setPreviewIndex(null)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100 p-4">
              {previewIsPdf ? (
                <iframe
                  className="h-full min-h-[60vh] w-full rounded-lg border border-slate-200 bg-white"
                  src={`/api/admin/applications/${application.id}/documents/${previewIndex}?inline=1`}
                  title={`Pratinjau ${previewDocument.documentType}`}
                />
              ) : String(previewDocument.mimeType ?? '').startsWith('image/') ? (
                <img
                  alt={`Pratinjau ${previewDocument.documentType}`}
                  className="mx-auto rounded-lg border border-slate-200 bg-white object-contain"
                  src={`/api/admin/applications/${application.id}/documents/${previewIndex}?inline=1`}
                />
              ) : (
                <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-center">
                  <p className="text-xs text-slate-500">
                    Pratinjau tidak tersedia untuk jenis berkas ini.
                  </p>
                  <a
                    className="rounded-lg bg-[#0b57d0] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0842a0]"
                    href={`/api/admin/applications/${application.id}/documents/${previewIndex}`}
                  >
                    Unduh berkas
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide-over pratinjau dokumen akad */}
      {akadPreviewOpen && (
        <div
          className="fixed inset-0 z-[60] flex justify-end overflow-hidden bg-slate-950/55"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAkadPreviewOpen(false)
              if (akadPreviewPdfUrl) {
                URL.revokeObjectURL(akadPreviewPdfUrl)
                setAkadPreviewPdfUrl(null)
              }
            }
          }}
        >
          <aside
            aria-labelledby="akad-preview-title"
            aria-modal="true"
            className="flex h-dvh w-full max-w-5xl flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0b57d0] via-[#0b57d0] to-[#0842a0] px-5 pb-4 pt-5 text-white sm:px-7 sm:pb-5 sm:pt-6">
              <div className="absolute -right-16 -top-24 size-64 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className="text-base font-bold tracking-tight sm:text-lg"
                      id="akad-preview-title"
                    >
                      Pratinjau Dokumen Akad
                    </h3>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/20">
                      {akadIssued ? 'Terbit' : 'Draft dari data terbaru'}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-blue-100">
                    {application.applicantName} · {application.lpkName}
                  </p>
                </div>
                <div className="relative flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!akadPreviewPdfUrl || akadPreviewLoading || akadPdfSaving}
                    onClick={downloadAkadPreviewPdf}
                    type="button"
                  >
                    {akadPdfSaving ? 'Menyiapkan PDF…' : 'Unduh PDF'}
                  </button>
                  {!akadIssued && (
                    <button
                      className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#0b57d0] shadow-sm transition hover:bg-blue-50 disabled:opacity-60"
                      disabled={!akadGateOpen || pending || akadIssuing}
                      onClick={issueAkad}
                      type="button"
                    >
                      {akadIssuing ? 'Menerbitkan…' : 'Terbitkan Dokumen Akad'}
                    </button>
                  )}
                  <button
                    aria-label="Tutup pratinjau dokumen akad"
                    className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                    onClick={() => {
                      setAkadPreviewOpen(false)
                      if (akadPreviewPdfUrl) {
                        URL.revokeObjectURL(akadPreviewPdfUrl)
                        setAkadPreviewPdfUrl(null)
                      }
                    }}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-100 p-4 sm:p-6">
              {akadPdfError && (
                <p
                  className="mx-auto mb-3 max-w-4xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                  role="alert"
                >
                  {akadPdfError}
                </p>
              )}
              {akadPreviewLoading && (
                <div
                  aria-live="polite"
                  className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-5 py-5"
                  role="status"
                >
                  <div className="flex items-center gap-3 rounded-full border border-blue-100 bg-white px-4 py-2.5 shadow-sm">
                    <span className="size-4 animate-spin rounded-full border-2 border-blue-100 border-t-[#0b57d0]" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Menyiapkan pratinjau PDF
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Mengonversi dokumen akad ke PDF…
                      </p>
                    </div>
                  </div>
                  <div className="w-full max-w-[620px] animate-pulse rounded-sm border border-slate-200 bg-white px-8 py-10 shadow-lg sm:px-14 sm:py-14">
                    <div className="mx-auto h-3 w-28 rounded bg-blue-100" />
                    <div className="mx-auto mt-3 h-2 w-44 rounded bg-slate-200" />
                    <div className="mx-auto mt-8 h-2 w-64 max-w-full rounded bg-slate-200" />
                    <div className="mt-2 h-2 w-full rounded bg-slate-100" />
                    <div className="mt-2 h-2 w-[92%] rounded bg-slate-100" />
                    <div className="mt-2 h-2 w-[86%] rounded bg-slate-100" />
                    <div className="mt-7 h-2 w-40 rounded bg-blue-100" />
                    <div className="mt-3 h-2 w-full rounded bg-slate-100" />
                    <div className="mt-2 h-2 w-[95%] rounded bg-slate-100" />
                    <div className="mt-2 h-2 w-[82%] rounded bg-slate-100" />
                    <div className="mt-2 h-2 w-[88%] rounded bg-slate-100" />
                  </div>
                </div>
              )}
              {akadPreviewError && (
                <div
                  className="mx-auto mt-10 max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"
                  role="alert"
                >
                  <h4 className="text-sm font-bold text-slate-900">
                    Pratinjau PDF belum dapat dimuat
                  </h4>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{akadPreviewError}</p>
                  <button
                    className="mt-4 rounded-lg bg-[#0b57d0] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#0842a0]"
                    onClick={openAkadPreview}
                    type="button"
                  >
                    Coba lagi
                  </button>
                </div>
              )}
              {akadPreviewPdfUrl && !akadPreviewLoading && (
                <iframe
                  className="mx-auto h-full min-h-[75vh] w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-md"
                  ref={akadPreviewFrameRef}
                  src={akadPreviewPdfUrl}
                  title="Preview PDF dokumen akad"
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Slide-over khusus: Setujui dengan Nominal Baru */}
      {showNominalInput && (pricingStatus === 'ESTIMATED' || pricingStatus === 'VERIFIED') && (
        <div
          className="fixed inset-0 z-[60] flex justify-end overflow-hidden bg-slate-950/55"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setShowNominalInput(false)
              setNewNominal('')
            }
          }}
        >
          <section
            aria-labelledby="new-nominal-title"
            aria-modal="true"
            className="flex h-dvh w-full max-w-lg flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0b57d0] to-[#0842a0] px-6 pb-5 pt-6 text-white">
              <div className="absolute -right-10 -top-14 size-44 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight" id="new-nominal-title">
                    Setujui dengan Nominal Baru
                  </h3>
                  <p className="mt-1 truncate text-xs text-blue-100">{application.applicantName}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20">
                      {application.applicationId}
                    </span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/20">
                      {application.product === 'DEPARTURE_BRIDGING'
                        ? 'Dana Keberangkatan'
                        : 'Full Cover'}
                    </span>
                  </div>
                </div>
                <button
                  aria-label="Tutup pengaturan nominal baru"
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  disabled={pending}
                  onClick={() => {
                    setShowNominalInput(false)
                    setNewNominal('')
                  }}
                  type="button"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
              <p className="relative mt-4 max-w-md text-xs leading-5 text-blue-100">
                Sesuaikan penawaran sebelum siswa menyatakan setuju dan sebelum dokumen akad
                diterbitkan.
              </p>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-500">
                    {nominalCap !== null ? 'Batas dari pengajuan siswa' : 'Nominal pengajuan'}
                  </span>
                  <strong className="mt-1 block text-lg font-bold text-[#0b57d0]">
                    {nominalCap !== null ? formatRupiah(nominalCap) : 'Tidak ditentukan'}
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <span className="text-[11px] font-medium text-slate-500">
                    Total kewajiban saat ini
                  </span>
                  <strong className="mt-1 block text-lg font-bold text-slate-900">
                    {formatRupiah(application.financialPlan?.totalObligation ?? null)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <span className="text-xs font-medium text-slate-600">Status biaya</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                    PRICING_BADGE_STYLES[pricingStatus] ?? 'bg-slate-100 text-slate-700'
                  } ring-slate-200`}
                >
                  {pricingStatusLabel}
                </span>
              </div>

              <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[#0b57d0] shadow-xs">
                  <svg
                    aria-hidden="true"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5m0-8h.01" />
                  </svg>
                </span>
                <p>
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Principal baru menetapkan ulang invoice LPK, uang saku, Nafaqah, dan Ujrah secara otomatis. Jadwal angsuran disusun ulang dan status biaya menjadi Terverifikasi.'
                    : 'Rincian Nafaqah & Ujrah disesuaikan secara proporsional agar totalnya sama dengan nominal baru. Jadwal angsuran dihitung ulang dan status biaya menjadi Terverifikasi.'}
                </p>
              </div>

              <label className="block text-xs font-semibold text-slate-800">
                {application.product === 'DEPARTURE_BRIDGING'
                  ? 'Pilih nominal Dana Keberangkatan'
                  : 'Nominal baru Full Cover (Rp)'}
                {application.product === 'DEPARTURE_BRIDGING' ? (
                  <select
                    autoFocus
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-xs outline-none transition focus:border-[#0b57d0] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setNewNominal(event.target.value)}
                    value={newNominal}
                  >
                    <option value="">Pilih nominal penawaran</option>
                    {nominalOptions.map((option) => (
                      <option key={option.amount} value={String(option.amount)}>
                        {option.label}
                        {option.amount === nominalCap &&
                          FINANCING_OPTIONS.some((item) => item.amount === nominalCap) &&
                          ' · nominal diajukan'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoFocus
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 shadow-xs outline-none transition focus:border-[#0b57d0] focus:ring-4 focus:ring-blue-100"
                    inputMode="numeric"
                    min={1}
                    max={10_000_000_000}
                    onChange={(event) => setNewNominal(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault()
                    }}
                    placeholder="Contoh: 120000000"
                    step={1}
                    type="number"
                    value={newNominal}
                  />
                )}
              </label>
              {application.product === 'DEPARTURE_BRIDGING' ? (
                <p className="text-[11px] leading-5 text-slate-500">
                  Pilihan mengikuti nominal program dan tidak melebihi plafon yang diajukan siswa.
                </p>
              ) : (
                <p className="text-[11px] leading-5 text-slate-500">
                  Full Cover tidak memiliki opsi nominal baku. Masukkan total baru; maksimal
                  Rp10.000.000.000.
                </p>
              )}
              {newNominal !== '' && !newNominalValid && (
                <p
                  className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
                  role="alert"
                >
                  {application.product === 'DEPARTURE_BRIDGING'
                    ? 'Pilih nominal yang tersedia dan tidak melebihi nominal pengajuan siswa.'
                    : 'Nominal harus lebih dari Rp0 dan tidak melebihi Rp10.000.000.000.'}
                </p>
              )}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => {
                  setShowNominalInput(false)
                  setNewNominal('')
                }}
                type="button"
              >
                Batal
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b57d0] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0842a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending || !newNominalValid}
                onClick={() => {
                  if (!newNominalValid) return
                  onApprovePricing(application.id, parsedNewNominal)
                  setShowNominalInput(false)
                  setNewNominal('')
                }}
                type="button"
              >
                {pending ? 'Menyimpan…' : 'Setujui Nominal Baru'}
              </button>
            </footer>
          </section>
        </div>
      )}
      {approvalSaving && (
        <div
          className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-white/90 px-6 text-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="size-11 animate-spin rounded-full border-[3px] border-emerald-100 border-t-emerald-600" />
          <strong className="mt-4 text-sm font-bold text-slate-900">
            Menyimpan Persetujuan Biaya
          </strong>
          <span className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
            Mohon tunggu sebentar, rincian sedang diproses dengan aman.
          </span>
        </div>
      )}
    </form>
  )
}

type DashboardChartPoint = { label: string; value: number }

function DashboardBarChart({
  data,
  formatValue,
  color = 'fill-[var(--primary)]',
}: {
  data: DashboardChartPoint[]
  formatValue: (value: number) => string
  color?: string
}) {
  const maxValue = Math.max(1, ...data.map((point) => point.value))
  const slot = 560 / Math.max(data.length, 1)
  const barWidth = Math.min(30, slot * 0.58)

  return (
    <svg
      aria-label={data.map((point) => `${point.label}: ${formatValue(point.value)}`).join(', ')}
      className="h-44 w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 560 190"
    >
      <line className="stroke-slate-200" x1="0" x2="560" y1="150" y2="150" />
      {data.map((point, index) => {
        const height = (point.value / maxValue) * 112
        const x = index * slot + (slot - barWidth) / 2
        const y = 149 - height
        return (
          <g key={point.label}>
            <title>{`${point.label}: ${formatValue(point.value)}`}</title>
            <rect
              className={`${color} opacity-90`}
              height={Math.max(height, 2)}
              rx="4"
              width={barWidth}
              x={x}
              y={y}
            />
            <text
              className="fill-slate-600"
              fontSize="10"
              textAnchor="middle"
              x={x + barWidth / 2}
              y="170"
            >
              {point.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function DashboardMeter({
  label,
  value,
  total,
  color = 'bg-[var(--primary)]',
  detail,
}: {
  label: string
  value: number
  total: number
  color?: string
  detail?: string
}) {
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-slate-700">{label}</span>
        <span className="shrink-0 font-bold tabular-nums text-slate-900">
          {detail ?? value.toLocaleString('id-ID')}
        </span>
      </div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export function AdminDashboard({
  email,
  applications,
  payments = [],
  paymentProofs = [],
  todayIso,
}: {
  email: string
  applications: FinancingApplicationRecord[]
  payments?: AdminPaymentRecord[]
  paymentProofs?: AdminPaymentProofRecord[]
  todayIso: string
}) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const [applicationToDelete, setApplicationToDelete] = useState<FinancingApplicationRecord | null>(
    null,
  )
  const [deleteApplicationError, setDeleteApplicationError] = useState('')
  const [revertTarget, setRevertTarget] = useState<FinancingApplicationRecord | null>(null)
  const [revertError, setRevertError] = useState('')
  const [cancelAkadTarget, setCancelAkadTarget] = useState<FinancingApplicationRecord | null>(null)
  const [cancelAkadError, setCancelAkadError] = useState('')
  const [pending, startTransition] = useTransition()
  const [approvalSavingId, setApprovalSavingId] = useState<string | null>(null)

  const [activeMenu, setActiveMenu] = useState<MenuId>('dashboard')
  const [dashboardRange, setDashboardRange] = useState<6 | 12>(6)
  const [drawerAppId, setDrawerAppId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState<DetailTabId>('profile')

  const [searchQuery, setSearchQuery] = useState('')
  const [productFilter, setProductFilter] = useState<'ALL' | 'FULL_COVER' | 'DEPARTURE_BRIDGING'>(
    'ALL',
  )
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [destinationFilter, setDestinationFilter] = useState<string>('ALL')
  const [isDestinationDropdownOpen, setIsDestinationDropdownOpen] = useState(false)
  const destinationDropdownRef = useRef<HTMLDivElement>(null)

  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false)
  const productDropdownRef = useRef<HTMLDivElement>(null)

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (destinationDropdownRef.current && !destinationDropdownRef.current.contains(target)) {
        setIsDestinationDropdownOpen(false)
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(target)) {
        setIsProductDropdownOpen(false)
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setIsStatusDropdownOpen(false)
      }
    }
    if (isDestinationDropdownOpen || isProductDropdownOpen || isStatusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDestinationDropdownOpen, isProductDropdownOpen, isStatusDropdownOpen])
  const [activeInstallmentFilter, setActiveInstallmentFilter] = useState<
    'ALL' | 'OVERDUE' | 'DUE_SOON' | 'CURRENT'
  >('ALL')
  const [alumniFilter, setAlumniFilter] = useState<'ALL' | 'ON_TIME' | 'EARLY'>('ALL')
  const [studentDirectoryFilter, setStudentDirectoryFilter] =
    useState<(typeof STUDENT_DIRECTORY_FILTERS)[number]['id']>('ALL')

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    productFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    destinationFilter !== 'ALL'

  const resetAllFilters = () => {
    setSearchQuery('')
    setProductFilter('ALL')
    setStatusFilter('ALL')
    setDestinationFilter('ALL')
  }

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' })
    await signOut(getFirebaseClientAuth()).catch(() => {})
    router.replace('/')
  }

  const openApplicationDrawer = (appId: string, tab: DetailTabId = 'profile') => {
    setDrawerAppId(appId)
    setDrawerTab(tab)
  }

  const confirmApplicationDeletion = () => {
    if (!applicationToDelete) return
    const target = applicationToDelete
    setDeleteApplicationError('')
    startTransition(async () => {
      const result = await rejectAndDeleteApplication(target.id)
      if (!result.ok) {
        setDeleteApplicationError(result.message)
        return
      }
      setApplicationToDelete(null)
      setSavedNotice(
        `Pengajuan ${target.applicationId} ditolak dan dihapus. Pemohon dapat mengajukan kembali.`,
      )
      if (drawerAppId === target.id) setDrawerAppId(null)
      router.refresh()
    })
  }

  const handleConfirmRevert = (target: FinancingApplicationRecord) => {
    setRevertError('')
    startTransition(async () => {
      const result = await revertApplicationPricingToEstimated(target.id)
      if (!result.ok) {
        setRevertError(result.message)
      } else {
        setSavedNotice(
          `Pengajuan ${target.applicationId} telah dikembalikan ke menu Pengajuan untuk ditinjau ulang.`,
        )
        setRevertTarget(null)
        router.refresh()
      }
    })
  }

  const handleCancelAkadIssuance = (target: FinancingApplicationRecord) => {
    setCancelAkadError('')
    startTransition(async () => {
      const result = await cancelAkadDocumentIssuance(target.id)
      if (!result.ok) {
        setCancelAkadError(result.message)
        return
      }
      setCancelAkadTarget(null)
      setSavedNotice(
        `Penerbitan akad ${formatDisplayApplicationId(target.applicationId)} dibatalkan. Status siswa kembali ke Persiapan Akad.`,
      )
      router.refresh()
    })
  }

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return applications.filter((app) => {
      if (destinationFilter !== 'ALL' && app.destination !== destinationFilter) return false
      if (productFilter !== 'ALL' && app.product !== productFilter) return false
      if (statusFilter !== 'ALL' && app.status !== statusFilter) return false
      if (!query) return true
      const displayId = formatDisplayApplicationId(app.applicationId).toLowerCase()
      return (
        app.applicationId.toLowerCase().includes(query) ||
        displayId.includes(query) ||
        app.applicantName.toLowerCase().includes(query) ||
        app.phone.toLowerCase().includes(query) ||
        app.lpkName.toLowerCase().includes(query)
      )
    })
  }, [applications, destinationFilter, productFilter, statusFilter, searchQuery])

  const pendingApprovalApplications = useMemo(
    () =>
      filteredApplications.filter((app) => {
        const pricing = String(app.financialPlan?.pricingStatus ?? 'ESTIMATED')
        return pricing !== 'VERIFIED' && pricing !== 'AGREED'
      }),
    [filteredApplications],
  )

  const contractPrepApplications = useMemo(
    () =>
      filteredApplications.filter((app) => {
        if (isLegacyApplication(app)) return false
        if (app.status === 'ACTIVE' || app.status === 'COMPLETED') return false
        if (Boolean(app.financialPlan?.akadDocument)) return false
        const pricing = String(app.financialPlan?.pricingStatus ?? 'ESTIMATED')
        return pricing === 'VERIFIED' || pricing === 'AGREED'
      }),
    [filteredApplications],
  )

  const archivingApplications = useMemo(
    () =>
      filteredApplications.filter((app) => {
        if (isLegacyApplication(app)) return false
        const hasDocx = Boolean(app.financialPlan?.akadDocument)
        if (!hasDocx) return false

        const hasPdf = Boolean(app.agreementPdf)
        const hasPhotos = Array.isArray(app.akadPhotos) && app.akadPhotos.length > 0
        const hasDeparture = Boolean(app.departureDate)

        // Siswa hilang dari antrean pengarsipan jika seluruh dokumen arsip sudah lengkap diunggah
        const isComplete = hasDocx && hasPdf && hasPhotos && hasDeparture
        return !isComplete
      }),
    [filteredApplications],
  )

  const drawerApplication = useMemo(
    () => (drawerAppId ? (applications.find((app) => app.id === drawerAppId) ?? null) : null),
    [applications, drawerAppId],
  )

  // Summary metrics
  const metrics = useMemo(() => {
    let pendingReview = 0
    let activeCount = 0
    let agreedTotalVolume = 0
    let pendingApprovalCount = 0
    let contractPrepCount = 0

    for (const app of applications) {
      const pricing = String(app.financialPlan?.pricingStatus ?? 'ESTIMATED')
      if (pricing === 'VERIFIED' || pricing === 'AGREED') {
        contractPrepCount += 1
      } else {
        pendingApprovalCount += 1
      }

      if (
        ['SUBMITTED', 'ELIGIBILITY_REVIEW', 'DOCUMENT_REVIEW', 'COST_VERIFICATION'].includes(
          app.status,
        )
      ) {
        pendingReview += 1
      }
      if (app.status === 'ACTIVE' || app.status === 'COMPLETED') {
        activeCount += 1
      }
      const obligation = app.financialPlan?.totalObligation
      if (
        app.financialPlan?.pricingStatus === 'AGREED' &&
        typeof obligation === 'number' &&
        Number.isFinite(obligation)
      ) {
        agreedTotalVolume += obligation
      }
    }

    const totalPaidVolume = payments
      .filter((p) => p.status === 'PAID')
      .reduce((sum, p) => sum + p.amount, 0)

    return {
      total: applications.length,
      pendingApprovalCount,
      contractPrepCount,
      japanCount: applications.filter((a) => a.destination === 'JAPAN').length,
      turkeyCount: applications.filter((a) => a.destination === 'TURKEY').length,
      pendingReview,
      activeCount,
      agreedTotalVolume,
      totalPaidVolume,
    }
  }, [applications, payments])

  // Flat Audit Entries
  const auditEntries = useMemo(() => {
    const rows: {
      changedAt: string
      changedBy: string
      pricingStatus: string
      totalObligation: unknown
      finalAgreementReference?: string
      settlementNotes?: string
      app: FinancingApplicationRecord
    }[] = []
    for (const app of applications) {
      for (const entry of app.financialPlanHistory ?? []) {
        rows.push({
          changedAt: entry.changedAt,
          changedBy: entry.changedBy,
          pricingStatus: entry.pricingStatus,
          totalObligation: entry.financialPlan?.totalObligation,
          finalAgreementReference: entry.finalAgreementReference,
          settlementNotes: entry.settlementNotes,
          app,
        })
      }
    }
    return rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt))
  }, [applications])

  // LPK Partner Stats
  const lpkStats = useMemo(() => {
    const map = new Map<
      string,
      { lpkName: string; count: number; active: number; totalObligation: number }
    >()
    for (const app of filteredApplications) {
      const key = app.lpkName.trim() || 'Tanpa Nama LPK'
      const current = map.get(key) ?? { lpkName: key, count: 0, active: 0, totalObligation: 0 }
      current.count += 1
      if (app.status === 'ACTIVE' || app.status === 'COMPLETED') current.active += 1
      if (typeof app.financialPlan?.totalObligation === 'number') {
        current.totalObligation += app.financialPlan.totalObligation
      }
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [filteredApplications])

  // Ringkasan angsuran per pengajuan (dasar menu Siswa Aktif, Alumnus, dan riwayat drawer)
  const installmentSummaries = useMemo(
    () =>
      filteredApplications.map((app) => ({
        app,
        summary: summarizeInstallments(app, todayIso, payments),
      })),
    [filteredApplications, todayIso, payments],
  )

  const activeInstallmentSummaries = useMemo(
    () => installmentSummaries.filter(({ app, summary }) => hasActiveInstallment(app, summary)),
    [installmentSummaries],
  )

  const alumniSummaries = useMemo(
    () => installmentSummaries.filter(({ app, summary }) => isAlumnus(app, summary)),
    [installmentSummaries],
  )

  const studentDirectoryCounts = useMemo(() => {
    const counts = {
      ALL: installmentSummaries.length,
      IN_PROGRESS: 0,
      ACTIVE: 0,
      ALUMNI: 0,
      CLOSED: 0,
    }
    for (const { app, summary } of installmentSummaries) {
      counts[getStudentDirectoryCategory(app, summary)] += 1
    }
    return counts
  }, [installmentSummaries])

  const visibleStudentDirectoryRows = useMemo(
    () =>
      installmentSummaries
        .filter(
          ({ app, summary }) =>
            studentDirectoryFilter === 'ALL' ||
            getStudentDirectoryCategory(app, summary) === studentDirectoryFilter,
        )
        .sort((a, b) => a.app.applicantName.localeCompare(b.app.applicantName, 'id')),
    [installmentSummaries, studentDirectoryFilter],
  )

  const alumniRows = useMemo(
    () =>
      alumniSummaries.map(({ app, summary }) => {
        const paidPayments = payments.filter(
          (payment) =>
            payment.applicationDocId === app.id &&
            payment.status === 'PAID' &&
            payment.type === 'INSTALLMENT',
        )
        const latestPaidAt =
          paidPayments
            .map((payment) => payment.paidAt)
            .filter((date): date is string => Boolean(date))
            .sort()
            .at(-1) ?? null
        const hasPaymentEvidence = paidPayments.some((payment) => Boolean(payment.paidAt))
        const paidLate = paidPayments.some((payment) => {
          if (!payment.paidAt || payment.installmentNumber === null) return false
          const dueDate = summary.schedule.find(
            (row) => row.installment === payment.installmentNumber,
          )?.dueDate
          return Boolean(dueDate && payment.paidAt.slice(0, 10) > dueDate)
        })
        const lastDueDate = summary.schedule.at(-1)?.dueDate
        const accelerated = Boolean(
          latestPaidAt && lastDueDate && latestPaidAt.slice(0, 10) < lastDueDate,
        )
        return { app, summary, latestPaidAt, paidLate, accelerated, hasPaymentEvidence }
      }),
    [alumniSummaries, payments],
  )

  const visibleAlumni = useMemo(
    () =>
      alumniRows.filter(({ paidLate, accelerated, hasPaymentEvidence }) => {
        if (alumniFilter === 'ON_TIME') return hasPaymentEvidence && !paidLate
        if (alumniFilter === 'EARLY') return accelerated
        return true
      }),
    [alumniRows, alumniFilter],
  )

  const alumniMetrics = useMemo(() => {
    const totalRecovered = alumniRows.reduce((sum, row) => sum + row.summary.paidAmount, 0)
    const verifiablePayments = alumniRows.filter((row) => row.hasPaymentEvidence)
    const onTimeCount = verifiablePayments.filter((row) => !row.paidLate).length
    const completedMonths = alumniRows
      .map(({ app, latestPaidAt }) => {
        if (!latestPaidAt || !app.createdAt) return null
        const start = new Date(app.createdAt).getTime()
        const end = new Date(latestPaidAt).getTime()
        return Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.4375)))
          : null
      })
      .filter((months): months is number => months !== null)
    return {
      totalRecovered,
      punctuality: verifiablePayments.length
        ? Math.round((onTimeCount / verifiablePayments.length) * 100)
        : 0,
      averageMonths: completedMonths.length
        ? (
            completedMonths.reduce((sum, months) => sum + months, 0) / completedMonths.length
          ).toFixed(1)
        : '—',
    }
  }, [alumniRows])

  const activeInstallmentMetrics = useMemo(() => {
    let overdue = 0
    let dueSoon = 0
    let totalRemaining = 0
    for (const { summary } of activeInstallmentSummaries) {
      if (summary.overdueCount > 0) overdue += 1
      else if (summary.dueSoon) dueSoon += 1
      totalRemaining += summary.remaining
    }
    return {
      count: activeInstallmentSummaries.length,
      totalRemaining,
      overdue,
      dueSoon,
    }
  }, [activeInstallmentSummaries])

  const dashboardAnalytics = useMemo(() => {
    const [yearText, monthText] = todayIso.slice(0, 7).split('-')
    const currentMonth = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1))
    const months = Array.from({ length: dashboardRange }, (_, index) => {
      const date = new Date(currentMonth)
      date.setUTCMonth(date.getUTCMonth() - (dashboardRange - index - 1))
      return {
        key: date.toISOString().slice(0, 7),
        label: new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' })
          .format(date)
          .replace('.', ''),
      }
    })
    const monthKeys = new Set(months.map((month) => month.key))
    const applicationIds = new Set(
      filteredApplications.flatMap((app) => [app.id, app.applicationId]),
    )
    const scopedPayments = payments.filter(
      (payment) =>
        applicationIds.has(payment.applicationDocId) || applicationIds.has(payment.applicationId),
    )
    const paidPayments = scopedPayments.filter((payment) => payment.status === 'PAID')
    const pendingReviewStatuses = [
      'SUBMITTED',
      'ELIGIBILITY_REVIEW',
      'DOCUMENT_REVIEW',
      'REVISION_REQUIRED',
      'COST_VERIFICATION',
    ]
    const statusGroups = [
      {
        label: 'Verifikasi awal',
        count: filteredApplications.filter((app) => pendingReviewStatuses.includes(app.status))
          .length,
      },
      {
        label: 'Persiapan akad',
        count: filteredApplications.filter((app) =>
          ['APPROVED', 'CONTRACT_PREPARATION'].includes(app.status),
        ).length,
      },
      {
        label: 'Aktif',
        count: filteredApplications.filter((app) => app.status === 'ACTIVE').length,
      },
      {
        label: 'Selesai',
        count: filteredApplications.filter((app) => app.status === 'COMPLETED').length,
      },
      {
        label: 'Ditolak / dibatalkan',
        count: filteredApplications.filter((app) => ['REJECTED', 'CANCELLED'].includes(app.status))
          .length,
      },
    ]
    const groupMax = Math.max(1, ...statusGroups.map((group) => group.count))
    const submissionsByMonth = new Map(months.map((month) => [month.key, 0]))
    const paymentsByMonth = new Map(months.map((month) => [month.key, 0]))
    for (const app of filteredApplications) {
      const month = app.createdAt.slice(0, 7)
      if (monthKeys.has(month))
        submissionsByMonth.set(month, (submissionsByMonth.get(month) ?? 0) + 1)
    }
    for (const payment of paidPayments) {
      const month = payment.paidAt?.slice(0, 7)
      if (month && monthKeys.has(month)) {
        paymentsByMonth.set(month, (paymentsByMonth.get(month) ?? 0) + payment.amount)
      }
    }
    const departureCount = filteredApplications.filter(
      (app) => app.product === 'DEPARTURE_BRIDGING',
    ).length
    const fullCoverCount = filteredApplications.filter((app) => app.product === 'FULL_COVER').length
    const japanCount = filteredApplications.filter((app) => app.destination === 'JAPAN').length
    const turkeyCount = filteredApplications.filter((app) => app.destination === 'TURKEY').length
    const agreedObligation = filteredApplications.reduce((sum, app) => {
      const obligation = app.financialPlan?.totalObligation
      return app.financialPlan?.pricingStatus === 'AGREED' &&
        typeof obligation === 'number' &&
        Number.isFinite(obligation)
        ? sum + obligation
        : sum
    }, 0)

    return {
      applicationCount: filteredApplications.length,
      pendingReviewCount: filteredApplications.filter((app) =>
        pendingReviewStatuses.includes(app.status),
      ).length,
      paidVolume: paidPayments.reduce((sum, payment) => sum + payment.amount, 0),
      agreedObligation,
      alumniCount: alumniSummaries.length,
      statusGroups: statusGroups.map((group) => ({
        ...group,
        percent: (group.count / groupMax) * 100,
      })),
      submissions: months.map((month) => ({
        label: month.label,
        value: submissionsByMonth.get(month.key) ?? 0,
      })),
      collections: months.map((month) => ({
        label: month.label,
        value: paymentsByMonth.get(month.key) ?? 0,
      })),
      departureCount,
      fullCoverCount,
      japanCount,
      turkeyCount,
    }
  }, [alumniSummaries.length, dashboardRange, filteredApplications, payments, todayIso])

  const visibleActiveInstallments = useMemo(() => {
    const rows = activeInstallmentSummaries.filter(({ summary }) => {
      if (activeInstallmentFilter === 'OVERDUE') return summary.overdueCount > 0
      if (activeInstallmentFilter === 'DUE_SOON') {
        return summary.overdueCount === 0 && summary.dueSoon
      }
      if (activeInstallmentFilter === 'CURRENT') {
        return summary.overdueCount === 0 && !summary.dueSoon
      }
      return true
    })
    return rows.sort(compareInstallmentRows)
  }, [activeInstallmentSummaries, activeInstallmentFilter])

  const save = (application: FinancingApplicationRecord, formData: FormData) => {
    setError('')
    setSavedNotice('')
    startTransition(async () => {
      const result = await saveFinancialPlan(application.id, {
        nafaqahTotal: String(formData.get('nafaqahTotal') ?? ''),
        ujrahTotal: String(formData.get('ujrahTotal') ?? ''),
        totalObligation: String(formData.get('totalObligation') ?? ''),
        tenorMonths: String(formData.get('tenorMonths') ?? ''),
        monthlyInstallment: String(formData.get('monthlyInstallment') ?? ''),
        jualaTotal: String(formData.get('jualaTotal') ?? ''),
        nafaqahItems: String(formData.get('nafaqahItems') ?? '[]'),
        ujrahItems: String(formData.get('ujrahItems') ?? '[]'),
        qardhAmount: String(formData.get('qardhAmount') ?? '0'),
        qardhDisbursed: String(formData.get('qardhDisbursed') ?? 'false'),
        akadDate: String(formData.get('akadDate') ?? ''),
        installmentCount: String(formData.get('installmentCount') ?? ''),
        firstPaymentDate: String(
          formData.get('firstPaymentDate') ?? application.financialPlan?.firstPaymentDate ?? '',
        ),
        installmentPaymentDay: String(
          formData.get('installmentPaymentDay') ??
            application.financialPlan?.installmentPaymentDay ??
            28,
        ),
        refundTotal: String(
          formData.get('refundTotal') ?? application.financialPlan?.refundTotal ?? '0',
        ),
        refundEvidenceReference: String(
          formData.get('refundEvidenceReference') ??
            application.financialPlan?.refundEvidenceReference ??
            '',
        ),
        finalAgreementReference: String(
          formData.get('finalAgreementReference') ??
            application.financialPlan?.finalAgreementReference ??
            '',
        ),
        settlementNotes: String(
          formData.get('settlementNotes') ?? application.financialPlan?.settlementNotes ?? '',
        ),
        hppLpkInvoiceAmount: String(formData.get('hppLpkInvoiceAmount') ?? ''),
        hppPocketMoneyAmount: String(formData.get('hppPocketMoneyAmount') ?? ''),
        wakalahLanguageMonths: String(formData.get('wakalahLanguageMonths') ?? ''),
        wakalahSkillMonths: String(formData.get('wakalahSkillMonths') ?? ''),
        wakalahDocumentReturnBusinessDays: String(
          formData.get('wakalahDocumentReturnBusinessDays') ?? '',
        ),
        wakalahWrittenWarningCount: String(formData.get('wakalahWrittenWarningCount') ?? ''),
        wakalahGraceDays: String(formData.get('wakalahGraceDays') ?? ''),
        languageAllowanceMonthly: String(formData.get('languageAllowanceMonthly') ?? ''),
        skillAllowanceMonthly: String(formData.get('skillAllowanceMonthly') ?? ''),
        departureAllowanceAmount: String(formData.get('departureAllowanceAmount') ?? ''),
        commitmentCompensationAmount: String(formData.get('commitmentCompensationAmount') ?? ''),
        commitmentSettlementDays: String(formData.get('commitmentSettlementDays') ?? ''),
        fullCoverBudget: String(formData.get('fullCoverBudget') ?? ''),
        fullCoverRepaymentMonths: String(formData.get('fullCoverRepaymentMonths') ?? ''),
        wakalahOtherUjrahService: String(
          formData.get('wakalahOtherUjrahService') ??
            application.financialPlan?.wakalahOtherUjrahService ??
            '',
        ),
        wakalahMediator: String(
          formData.get('wakalahMediator') ?? application.financialPlan?.wakalahMediator ?? '',
        ),
        wakalahDisputeInstitution: String(
          formData.get('wakalahDisputeInstitution') ??
            application.financialPlan?.wakalahDisputeInstitution ??
            '',
        ),
        lpkWitnessName: String(formData.get('lpkWitnessName') ?? ''),
      })
      if (!result.ok) {
        setError(result.message)
      } else {
        setSavedNotice(`Rincian biaya ${application.applicationId} berhasil disimpan.`)
        router.refresh()
      }
    })
  }

  const saveWorkflow = (
    applicationId: string,
    status: string,
    internalNotes: string,
    departureDate?: string,
  ) => {
    setError('')
    setSavedNotice('')
    startTransition(async () => {
      const result = await updateApplicationWorkflow(
        applicationId,
        status,
        internalNotes,
        departureDate,
      )
      if (!result.ok) {
        setError(result.message)
      } else {
        setSavedNotice(`Catatan & tanggal penerbangan berhasil disimpan.`)
        router.refresh()
      }
    })
  }

  const approveDocument = (applicationId: string, documentIndex: number) => {
    setError('')
    setSavedNotice('')
    startTransition(async () => {
      const result = await approveApplicationDocument(applicationId, documentIndex)
      if (!result.ok) {
        setError(result.message)
      } else {
        setSavedNotice('Status dokumen ditandai Sesuai.')
        router.refresh()
      }
    })
  }

  const removeDocument = (applicationId: string, documentIndex: number) => {
    if (
      !window.confirm(
        'Hapus berkas dokumen ini dari Google Drive? Status dokumen menjadi "Tidak sesuai" dan pemohon perlu mengunggah ulang.',
      )
    ) {
      return
    }
    setError('')
    setSavedNotice('')
    startTransition(async () => {
      const result = await deleteApplicationDocument(applicationId, documentIndex)
      if (!result.ok) {
        setError(result.message)
      } else {
        setSavedNotice('Berkas dokumen dihapus dan status menjadi Tidak sesuai.')
        router.refresh()
      }
    })
  }

  const approvePricing = (applicationId: string, newNominal: number | null) => {
    setError('')
    setSavedNotice('')
    setApprovalSavingId(applicationId)
    startTransition(async () => {
      try {
        const result = await approveApplicationPricing(applicationId, newNominal)
        if (!result.ok) {
          setError(result.message)
        } else {
          setSavedNotice(
            newNominal !== null
              ? `Nominal disetujui dengan nominal baru ${formatRupiah(newNominal)}. Pengajuan dipindahkan ke menu Persiapan Akad.`
              : 'Nominal pengajuan berhasil disetujui. Pengajuan dipindahkan ke menu Persiapan Akad.',
          )
          router.refresh()
        }
      } catch {
        setError('Persetujuan biaya belum dapat disimpan. Coba lagi.')
      } finally {
        setApprovalSavingId(null)
      }
    })
  }

  const agreePricing = (applicationId: string) => {
    setError('')
    setSavedNotice('')
    startTransition(async () => {
      const result = await setApplicationPricingAgreed(applicationId)
      if (!result.ok) {
        setError(result.message)
      } else {
        setSavedNotice('Rincian biaya ditandai Disepakati.')
        router.refresh()
      }
    })
  }

  const uploadAgreement = async (applicationId: string, file: File) => {
    const response = await fetch(`/api/admin/applications/${applicationId}/agreement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'x-agreement-file-name': encodeURIComponent(file.name),
      },
      body: file,
    })
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      message?: string
    }
    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'PDF akad belum dapat diunggah.')
    }
    setSavedNotice(`PDF akad ${applicationId} berhasil diunggah.`)
    router.refresh()
  }

  const allMenus = SIDEBAR_GROUPS.flatMap((g) => g.items)
  const activeMenuInfo = allMenus.find((m) => m.id === activeMenu) ?? allMenus[0]

  const getMenuBadge = (id: MenuId): number | null => {
    switch (id) {
      case 'applications':
        return applications.filter(
          (a) =>
            a.financialPlan?.pricingStatus !== 'VERIFIED' &&
            a.financialPlan?.pricingStatus !== 'AGREED',
        ).length
      case 'students':
        return applications.length
      case 'paymentMonitor':
        return paymentProofs.filter((proof) => proof.status === 'PENDING_REVIEW').length
      case 'contracts':
        return contractPrepApplications.length
      case 'archiving':
        return archivingApplications.length
      case 'activeInstallments':
        return activeInstallmentMetrics.count
      case 'alumni':
        return alumniRows.length
      case 'audit':
        return auditEntries.length
      default:
        return null
    }
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-[#f8fafc] text-slate-900 lg:flex-row"
      suppressHydrationWarning
    >
      {/* FIXED 100dvh SIDEBAR */}
      <aside
        className="flex w-full flex-col justify-between border-b border-slate-200 bg-[#0b57d0] text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:self-start lg:border-b-0 lg:border-r lg:border-[#0842a0]"
        suppressHydrationWarning
      >
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5">
          <img
            alt="VentureGo"
            className="size-7 rounded-lg bg-white/10 p-1"
            height={28}
            src="/venturego-mark.svg"
            width={28}
          />
          <div className="min-w-0">
            <p className=" truncate text-xs font-bold tracking-tight text-white">VentureGo VSV</p>
            <p className="truncate text-[10px] font-medium text-blue-300">Admin Backoffice</p>
          </div>
        </div>

        {/* Compact Menu Groups (Fits inside 1 screen height) */}
        <nav
          aria-label="Navigasi utama backoffice"
          className="flex flex-1 flex-wrap gap-2 overflow-y-auto px-3 py-3 lg:flex-col lg:flex-nowrap lg:gap-4"
        >
          {SIDEBAR_GROUPS.map((group) => (
            <div className="w-full space-y-1" key={group.group}>
              <p className="hidden px-2.5 text-[10px] font-bold uppercase tracking-wider text-blue-300/60 lg:block">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-1 lg:flex-col">
                {group.items.map((item) => {
                  const active = activeMenu === item.id
                  const badge = getMenuBadge(item.id)
                  const workflowStep = SIDEBAR_WORKFLOW_STEPS[item.id]
                  return (
                    <button
                      aria-pressed={active}
                      className={`relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition lg:w-full ${
                        workflowStep && workflowStep < 5
                          ? "lg:after:pointer-events-none lg:after:absolute lg:after:left-[18px] lg:after:top-1/2 lg:after:-bottom-5 lg:after:z-0 lg:after:w-px lg:after:bg-white/30 lg:after:content-['']"
                          : ''
                      } ${
                        active
                          ? 'bg-[#0842a0] font-semibold text-white shadow-2xs ring-1 ring-white/20'
                          : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                      key={item.id}
                      onClick={() => setActiveMenu(item.id)}
                      suppressHydrationWarning
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2.5 truncate">
                        {workflowStep ? (
                          <span
                            className={`relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none ${active ? 'border-white bg-white text-[#0b57d0]' : 'border-white/40 bg-[#0b57d0] text-blue-100'}`}
                          >
                            {workflowStep}
                          </span>
                        ) : (
                          <MenuIcon id={item.id} />
                        )}
                        <span className="relative z-10 truncate">{item.label}</span>
                      </span>
                      {badge !== null && badge > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            active
                              ? 'bg-white text-[#0b57d0]'
                              : item.id === 'activeInstallments' &&
                                  activeInstallmentMetrics.overdue > 0
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-white/10 text-blue-200'
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Compact Staff Footer */}
        <div className="border-t border-white/10 bg-black/20 px-3.5 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">
              Staf
            </span>
            <span className="truncate text-[11px] font-medium text-white">{email}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="rounded-md border border-white/15 bg-white/5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10"
              onClick={() => router.refresh()}
              suppressHydrationWarning
              type="button"
            >
              Segarkan
            </button>
            <button
              className="rounded-md border border-rose-400/30 bg-rose-500/20 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/30"
              onClick={logout}
              suppressHydrationWarning
              type="button"
            >
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* INDEPENDENTLY SCROLLABLE MAIN CONTENT */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Minimalist & Aesthetic Header */}
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-6 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search with Icon & Clear Button — Full Width */}
            <div className="relative flex-1 min-w-[180px]">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <svg
                  aria-hidden="true"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <input
                aria-label="Cari pengajuan atau siswa"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8.5 pr-7 text-[11px] font-medium text-slate-900 placeholder:text-[11px] placeholder:font-medium placeholder:text-slate-400 transition hover:bg-white focus:border-[#0b57d0] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/15"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ID, nama, WA, LPK…"
                style={{ fontSize: '11px', fontWeight: 500 }}
                suppressHydrationWarning
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  aria-label="Hapus pencarian"
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 transition hover:text-slate-600"
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter Negara Tujuan (Custom Dropdown with Visual SVG Flags) */}
            <div className="relative shrink-0" ref={destinationDropdownRef}>
              <button
                aria-expanded={isDestinationDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Filter negara tujuan"
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border py-1.5 pl-3 pr-2.5 text-[11px] font-medium text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/15 ${
                  destinationFilter !== 'ALL'
                    ? 'border-[#0b57d0] bg-blue-50/60 !text-[#0b57d0] ring-1 ring-[#0b57d0]/20'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-white focus:border-[#0b57d0]'
                }`}
                onClick={() => setIsDestinationDropdownOpen((prev) => !prev)}
                suppressHydrationWarning
                style={{ fontSize: '11px', fontWeight: 500 }}
                type="button"
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {destinationFilter === 'ALL' && (
                    <>
                      <span className="text-[11px]">🌏</span>
                      <span className="whitespace-nowrap">Semua Negara</span>
                    </>
                  )}
                  {destinationFilter === 'JAPAN' && (
                    <>
                      <DestinationFlag destination="JAPAN" />
                      <span className="whitespace-nowrap">Jepang</span>
                    </>
                  )}
                  {destinationFilter === 'TURKEY' && (
                    <>
                      <DestinationFlag destination="TURKEY" />
                      <span className="whitespace-nowrap">Turki</span>
                    </>
                  )}
                </span>
                <svg
                  aria-hidden="true"
                  className={`size-3 text-slate-400 transition-transform duration-200 ${
                    isDestinationDropdownOpen ? 'rotate-180 text-[#0b57d0]' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isDestinationDropdownOpen && (
                <div className="absolute left-0 top-full z-30 mt-1.5 w-max min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95">
                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      destinationFilter === 'ALL'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setDestinationFilter('ALL')
                      setIsDestinationDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-[11px]">🌏</span>
                      <span className="whitespace-nowrap">Semua Negara</span>
                    </div>
                    {destinationFilter === 'ALL' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>

                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      destinationFilter === 'JAPAN'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setDestinationFilter('JAPAN')
                      setIsDestinationDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <DestinationFlag destination="JAPAN" />
                      <span className="whitespace-nowrap">Jepang</span>
                    </div>
                    {destinationFilter === 'JAPAN' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>

                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      destinationFilter === 'TURKEY'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setDestinationFilter('TURKEY')
                      setIsDestinationDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <DestinationFlag destination="TURKEY" />
                      <span className="whitespace-nowrap">Turki</span>
                    </div>
                    {destinationFilter === 'TURKEY' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Filter Produk (Custom Dropdown) */}
            <div className="relative shrink-0" ref={productDropdownRef}>
              <button
                aria-expanded={isProductDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Filter produk"
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border py-1.5 pl-3 pr-2.5 text-[11px] font-medium text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/15 ${
                  productFilter !== 'ALL'
                    ? 'border-[#0b57d0] bg-blue-50/60 !text-[#0b57d0] ring-1 ring-[#0b57d0]/20'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-white focus:border-[#0b57d0]'
                }`}
                onClick={() => setIsProductDropdownOpen((prev) => !prev)}
                suppressHydrationWarning
                style={{ fontSize: '11px', fontWeight: 500 }}
                type="button"
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {productFilter === 'ALL' && <span>Semua Produk</span>}
                  {productFilter === 'DEPARTURE_BRIDGING' && <span>Dana Keberangkatan</span>}
                  {productFilter === 'FULL_COVER' && <span>Full Cover</span>}
                </span>
                <svg
                  aria-hidden="true"
                  className={`size-3 text-slate-400 transition-transform duration-200 ${
                    isProductDropdownOpen ? 'rotate-180 text-[#0b57d0]' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isProductDropdownOpen && (
                <div className="absolute left-0 top-full z-30 mt-1.5 w-max min-w-[170px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95">
                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      productFilter === 'ALL'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setProductFilter('ALL')
                      setIsProductDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <span className="whitespace-nowrap">Semua Produk</span>
                    {productFilter === 'ALL' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>

                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      productFilter === 'DEPARTURE_BRIDGING'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setProductFilter('DEPARTURE_BRIDGING')
                      setIsProductDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <span className="whitespace-nowrap">Dana Keberangkatan</span>
                    {productFilter === 'DEPARTURE_BRIDGING' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>

                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      productFilter === 'FULL_COVER'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setProductFilter('FULL_COVER')
                      setIsProductDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <span className="whitespace-nowrap">Full Cover</span>
                    {productFilter === 'FULL_COVER' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Filter Status (Custom Dropdown) */}
            <div className="relative shrink-0" ref={statusDropdownRef}>
              <button
                aria-expanded={isStatusDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Filter status"
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border py-1.5 pl-3 pr-2.5 text-[11px] font-medium text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/15 ${
                  statusFilter !== 'ALL'
                    ? 'border-[#0b57d0] bg-blue-50/60 !text-[#0b57d0] ring-1 ring-[#0b57d0]/20'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-white focus:border-[#0b57d0]'
                }`}
                onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
                suppressHydrationWarning
                style={{ fontSize: '11px', fontWeight: 500 }}
                type="button"
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  {statusFilter === 'ALL'
                    ? 'Semua Status'
                    : (STATUS_LABELS[statusFilter as (typeof APPLICATION_STATUSES)[number]] ??
                      statusFilter)}
                </span>
                <svg
                  aria-hidden="true"
                  className={`size-3 text-slate-400 transition-transform duration-200 ${
                    isStatusDropdownOpen ? 'rotate-180 text-[#0b57d0]' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isStatusDropdownOpen && (
                <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-max min-w-[200px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95">
                  <button
                    className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                      statusFilter === 'ALL'
                        ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      setStatusFilter('ALL')
                      setIsStatusDropdownOpen(false)
                    }}
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    type="button"
                  >
                    <span className="whitespace-nowrap">Semua Status</span>
                    {statusFilter === 'ALL' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                    )}
                  </button>

                  {APPLICATION_STATUSES.map((status) => (
                    <button
                      className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                        statusFilter === status
                          ? 'bg-blue-50 font-semibold text-[#0b57d0]'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                      key={status}
                      onClick={() => {
                        setStatusFilter(status)
                        setIsStatusDropdownOpen(false)
                      }}
                      style={{ fontSize: '11px', fontWeight: 500 }}
                      type="button"
                    >
                      <span className="whitespace-nowrap">{STATUS_LABELS[status]}</span>
                      {statusFilter === status && (
                        <span className="size-1.5 shrink-0 rounded-full bg-[#0b57d0]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reset Filter Button — always visible */}
            <button
              aria-label="Reset semua filter"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition ${
                hasActiveFilter
                  ? 'border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95'
                  : 'border-slate-100 bg-slate-50/50 text-slate-300 cursor-default'
              }`}
              disabled={!hasActiveFilter}
              onClick={resetAllFilters}
              style={{ fontSize: '11px', fontWeight: 500 }}
              type="button"
            >
              <svg
                aria-hidden="true"
                className={`size-3 ${hasActiveFilter ? 'text-slate-500' : 'text-slate-300'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="flex-1 space-y-5 p-6">
          {error && (
            <div
              className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800"
              role="alert"
            >
              <span>{error}</span>
              <button className="underline" onClick={() => setError('')} type="button">
                Tutup
              </button>
            </div>
          )}
          {savedNotice && (
            <div
              className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900"
              role="status"
            >
              <span>✓ {savedNotice}</span>
              <button className="underline" onClick={() => setSavedNotice('')} type="button">
                Tutup
              </button>
            </div>
          )}

          {/* 1. MENU: DASHBOARD */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <span className="text-xs font-medium text-slate-500">
                    Pengajuan dalam cakupan
                  </span>
                  <strong className="mt-1 block text-2xl font-extrabold text-slate-900">
                    {dashboardAnalytics.applicationCount}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Mengikuti filter global aktif
                  </span>
                </div>
                <button
                  className="rounded-xl border border-blue-100 bg-white p-4 text-left shadow-2xs transition hover:border-blue-300 hover:bg-blue-50/40"
                  onClick={() => setActiveMenu('applications')}
                  type="button"
                >
                  <span className="text-xs font-medium text-slate-500">Perlu tinjauan</span>
                  <strong className="mt-1 block text-2xl font-extrabold text-[#0b57d0]">
                    {dashboardAnalytics.pendingReviewCount}
                  </strong>
                  <span className="mt-1 block text-[11px] text-[#0b57d0]">
                    Buka daftar pengajuan →
                  </span>
                </button>
                <button
                  className="rounded-xl border border-emerald-100 bg-white p-4 text-left shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50/40"
                  onClick={() => setActiveMenu('activeInstallments')}
                  type="button"
                >
                  <span className="text-xs font-medium text-slate-500">
                    Siswa dengan angsuran aktif
                  </span>
                  <strong className="mt-1 block text-2xl font-extrabold text-emerald-700">
                    {activeInstallmentMetrics.count}
                  </strong>
                  <span className="mt-1 block text-[11px] text-emerald-700">
                    Sisa kewajiban {formatRupiah(activeInstallmentMetrics.totalRemaining)}
                  </span>
                </button>
                <button
                  className="rounded-xl border border-red-100 bg-white p-4 text-left shadow-2xs transition hover:border-red-300 hover:bg-red-50/40"
                  onClick={() => {
                    setActiveInstallmentFilter('OVERDUE')
                    setActiveMenu('activeInstallments')
                  }}
                  type="button"
                >
                  <span className="text-xs font-medium text-slate-500">Siswa menunggak</span>
                  <strong className="mt-1 block text-2xl font-extrabold text-red-700">
                    {activeInstallmentMetrics.overdue}
                  </strong>
                  <span className="mt-1 block text-[11px] text-red-700">
                    Buka daftar keterlambatan →
                  </span>
                </button>
                <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <span className="text-xs font-medium text-slate-500">Nilai akad disepakati</span>
                  <strong className="mt-1 block text-xl font-extrabold text-slate-900">
                    {formatRupiah(dashboardAnalytics.agreedObligation)}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Bukan nilai pencairan atau saldo kas
                  </span>
                </div>
                <button
                  className="rounded-xl border border-amber-100 bg-white p-4 text-left shadow-2xs transition hover:border-amber-300 hover:bg-amber-50/40"
                  onClick={() => setActiveMenu('alumni')}
                  type="button"
                >
                  <span className="text-xs font-medium text-slate-500">
                    Pembayaran tercatat · Alumni
                  </span>
                  <strong className="mt-1 block text-lg font-extrabold text-slate-900">
                    {formatRupiah(dashboardAnalytics.paidVolume)}
                  </strong>
                  <span className="mt-1 block text-[11px] text-amber-700">
                    {dashboardAnalytics.alumniCount} alumni
                  </span>
                </button>
              </div>

              <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Tren bulanan
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Pengajuan baru dan realisasi transaksi PAID
                    </p>
                  </div>
                  <div
                    aria-label="Rentang grafik"
                    className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                    role="group"
                  >
                    {[6, 12].map((range) => (
                      <button
                        aria-pressed={dashboardRange === range}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${dashboardRange === range ? 'bg-white text-[#0b57d0] shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                        key={range}
                        onClick={() => setDashboardRange(range as 6 | 12)}
                        type="button"
                      >
                        {range} bulan
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">Pengajuan masuk</span>
                      <span className="size-2 rounded-full bg-[#0b57d0]" />
                    </div>
                    <DashboardBarChart
                      data={dashboardAnalytics.submissions}
                      formatValue={(value) => `${value} pengajuan`}
                    />
                  </div>
                  <div className="min-w-0 rounded-lg bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">
                        Pembayaran diterima
                      </span>
                      <span className="size-2 rounded-full bg-emerald-500" />
                    </div>
                    <DashboardBarChart
                      color="fill-emerald-500"
                      data={dashboardAnalytics.collections}
                      formatValue={formatRupiah}
                    />
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Peta status pengajuan
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Posisi terkini, bukan konversi historis
                      </p>
                    </div>
                    <button
                      className="text-[11px] font-semibold text-[#0b57d0] hover:underline"
                      onClick={() => setActiveMenu('applications')}
                      type="button"
                    >
                      Buka daftar →
                    </button>
                  </div>
                  <div className="space-y-4">
                    {dashboardAnalytics.statusGroups.map((group) => (
                      <DashboardMeter
                        color={
                          group.label === 'Ditolak / dibatalkan'
                            ? 'bg-rose-400'
                            : group.label === 'Selesai'
                              ? 'bg-emerald-500'
                              : 'bg-[var(--primary)]'
                        }
                        detail={`${group.count} pengajuan`}
                        key={group.label}
                        label={group.label}
                        total={Math.max(
                          ...dashboardAnalytics.statusGroups.map((item) => item.count),
                          1,
                        )}
                        value={group.count}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Komposisi portofolio
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Jumlah pengajuan berdasarkan produk dan tujuan
                    </p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Produk
                      </p>
                      <DashboardMeter
                        color="bg-blue-600"
                        detail={`${dashboardAnalytics.departureCount} siswa`}
                        label="Dana Keberangkatan"
                        total={dashboardAnalytics.applicationCount}
                        value={dashboardAnalytics.departureCount}
                      />
                      <DashboardMeter
                        color="bg-emerald-500"
                        detail={`${dashboardAnalytics.fullCoverCount} siswa`}
                        label="Full Cover"
                        total={dashboardAnalytics.applicationCount}
                        value={dashboardAnalytics.fullCoverCount}
                      />
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Negara tujuan
                      </p>
                      <DashboardMeter
                        color="bg-rose-500"
                        detail={`${dashboardAnalytics.japanCount} siswa`}
                        label="🇯🇵 Jepang"
                        total={dashboardAnalytics.applicationCount}
                        value={dashboardAnalytics.japanCount}
                      />
                      <DashboardMeter
                        color="bg-amber-500"
                        detail={`${dashboardAnalytics.turkeyCount} siswa`}
                        label="🇹🇷 Turki"
                        total={dashboardAnalytics.applicationCount}
                        value={dashboardAnalytics.turkeyCount}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        LPK dengan pengajuan terbanyak
                      </h3>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Lima mitra teratas dalam cakupan data
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400">{lpkStats.length} LPK</span>
                  </div>
                  <div className="space-y-4">
                    {lpkStats.slice(0, 5).map((row) => (
                      <DashboardMeter
                        detail={`${row.count} pengajuan`}
                        key={row.lpkName}
                        label={row.lpkName}
                        total={Math.max(...lpkStats.map((item) => item.count), 1)}
                        value={row.count}
                      />
                    ))}
                    {lpkStats.length === 0 && (
                      <p className="py-5 text-center text-xs text-slate-400">Belum ada data LPK.</p>
                    )}
                  </div>
                </section>
                <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                  <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Rekapitulasi per LPK Mitra
                    </h3>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Nama LPK</th>
                          <th className="px-3 py-2.5">Pengajuan</th>
                          <th className="px-3 py-2.5">Aktif / Selesai</th>
                          <th className="whitespace-nowrap px-3 py-2.5 text-right">
                            Kewajiban tercatat
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lpkStats.map((row) => (
                          <tr className="hover:bg-slate-50" key={row.lpkName}>
                            <td
                              className="max-w-40 truncate px-3 py-2.5 font-semibold text-slate-900"
                              title={row.lpkName}
                            >
                              {row.lpkName}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{row.count}</td>
                            <td className="px-3 py-2.5 text-emerald-700">{row.active}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-slate-900">
                              {formatRupiah(row.totalObligation)}
                            </td>
                          </tr>
                        ))}
                        {lpkStats.length === 0 && (
                          <tr>
                            <td className="px-3 py-6 text-center text-slate-400" colSpan={4}>
                              Belum ada data rekap LPK.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-amber-200/70 bg-gradient-to-r from-white to-amber-50/50 p-4 shadow-2xs sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Perlu perhatian
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Pintasan ke antrean operasional yang memerlukan tindak lanjut
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">Mengikuti filter global aktif</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    className="flex items-center justify-between rounded-lg border border-red-100 bg-white px-3 py-3 text-left hover:bg-red-50/50"
                    onClick={() => {
                      setActiveInstallmentFilter('OVERDUE')
                      setActiveMenu('activeInstallments')
                    }}
                    type="button"
                  >
                    <span className="text-xs font-medium text-slate-700">Terlambat</span>
                    <strong className="text-sm text-red-700">
                      {activeInstallmentMetrics.overdue}
                    </strong>
                  </button>
                  <button
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-3 py-3 text-left hover:bg-amber-50/50"
                    onClick={() => {
                      setActiveInstallmentFilter('DUE_SOON')
                      setActiveMenu('activeInstallments')
                    }}
                    type="button"
                  >
                    <span className="text-xs font-medium text-slate-700">Jatuh tempo ≤ 7 hari</span>
                    <strong className="text-sm text-amber-700">
                      {activeInstallmentMetrics.dueSoon}
                    </strong>
                  </button>
                </div>
              </section>

              {/* Quick Table: Recent Applications */}
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Pengajuan Terbaru ({filteredApplications.slice(0, 8).length})
                  </h2>
                  <button
                    className="text-xs font-semibold text-[#0b57d0] hover:underline"
                    onClick={() => setActiveMenu('applications')}
                    suppressHydrationWarning
                    type="button"
                  >
                    Lihat Semua Pengajuan →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                        <th className="whitespace-nowrap px-4 py-3">ID Pengajuan</th>
                        <th className="whitespace-nowrap px-4 py-3">Tanggal</th>
                        <th className="whitespace-nowrap px-4 py-3">Nama Siswa</th>
                        <th className="whitespace-nowrap px-4 py-3">LPK & Tujuan</th>
                        <th className="whitespace-nowrap px-4 py-3">Produk</th>
                        <th className="whitespace-nowrap px-4 py-3">Berkas</th>
                        <th className="whitespace-nowrap px-4 py-3">Status</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredApplications.slice(0, 8).map((app) => {
                        const uploaded = app.documents.filter((d) => Boolean(d.fileId)).length
                        return (
                          <tr className="hover:bg-slate-50/80" key={app.id}>
                            <td
                              className="whitespace-nowrap px-4 py-3 font-bold text-[#0b57d0]"
                              title={app.applicationId}
                            >
                              {formatDisplayApplicationId(app.applicationId)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                              {formatDateShort(app.createdAt)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                              {app.applicantName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {app.lpkName} · {app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {app.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {uploaded}/{app.documents.length}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                                  STATUS_BADGE_STYLES[app.status] ??
                                  'bg-slate-100 text-slate-700 ring-slate-200'
                                }`}
                              >
                                {STATUS_LABELS[app.status as keyof typeof STATUS_LABELS] ??
                                  app.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <DrawerAction
                                ariaLabel={`Kelola pengajuan ${app.applicationId}`}
                                label="Kelola"
                                onClick={() => openApplicationDrawer(app.id, 'profile')}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* 2. MENU: PENGAJUAN (Executive View) */}
          {activeMenu === 'applications' && (
            <div className="space-y-5">
              {/* Executive Hero Banner for Applications */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-blue-50/25 to-slate-50 p-6 shadow-xs">
                <div className="pointer-events-none absolute -right-12 -top-12 size-64 rounded-full bg-blue-100/40 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 right-1/4 size-32 rounded-full bg-indigo-50/50 blur-2xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0b57d0] to-[#4285f4] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-50">
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                          Pengajuan Pembiayaan
                        </h2>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Sync
                        </span>
                      </div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                        Sentral verifikasi berkas, persetujuan nominal wakalah mutlak staf admin,
                        dan monitoring status penerbitan dokumen akad resmi bagi siswa LPK.
                      </p>
                    </div>
                  </div>

                  {/* 3 Metric Cards Ringkas & Elegan */}
                  <div className="grid grid-cols-3 gap-3 shrink-0">
                    <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-slate-500">Total Masuk</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900">
                        {metrics.pendingApprovalCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Perlu persetujuan</p>
                    </div>
                    <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-[#0b57d0]">Perlu Tinjauan</p>
                      <p className="mt-1 text-lg font-extrabold text-[#0b57d0]">
                        {metrics.pendingReview}
                      </p>
                      <p className="mt-0.5 text-[10px] text-blue-600/80">Berkas & Biaya</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-emerald-800">Akad Berjalan</p>
                      <p className="mt-1 text-lg font-extrabold text-emerald-700">
                        {metrics.activeCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-emerald-600/80">Aktif & Selesai</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-column Table */}
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                        <th className="whitespace-nowrap px-4 py-3">ID Pengajuan</th>
                        <th className="whitespace-nowrap px-4 py-3">Tgl Masuk</th>
                        <th className="whitespace-nowrap px-4 py-3">Nama Siswa</th>
                        <th className="whitespace-nowrap px-4 py-3">LPK Mitra</th>
                        <th className="whitespace-nowrap px-4 py-3">Tujuan</th>
                        <th className="whitespace-nowrap px-4 py-3">Produk</th>
                        <th className="whitespace-nowrap px-4 py-3">Berkas</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingApprovalApplications.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                            Tidak ada data pengajuan yang belum disetujui.
                          </td>
                        </tr>
                      ) : (
                        pendingApprovalApplications.map((app) => {
                          const uploaded = app.documents.filter((d) => Boolean(d.fileId)).length
                          const isLegacyApplication = Boolean(app.legacy)
                          return (
                            <tr className="hover:bg-slate-50/80" key={app.id}>
                              <td
                                className="whitespace-nowrap px-4 py-3 font-bold text-[#0b57d0]"
                                title={app.applicationId}
                              >
                                {formatDisplayApplicationId(app.applicationId)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                                {formatDateShort(app.createdAt)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                                {app.applicantName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                {app.lpkName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {app.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {uploaded}/{app.documents.length}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    aria-label={`Tolak dan hapus pengajuan ${app.applicationId}`}
                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-xs transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={pending || isLegacyApplication}
                                    onClick={() => {
                                      setDeleteApplicationError('')
                                      setApplicationToDelete(app)
                                    }}
                                    title={
                                      isLegacyApplication
                                        ? 'Data kontrak legacy dilindungi'
                                        : `Tolak dan hapus ${app.applicationId}`
                                    }
                                    type="button"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="size-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
                                    </svg>
                                  </button>
                                  <DrawerAction
                                    ariaLabel={`Kelola pengajuan ${app.applicationId}`}
                                    label="Kelola"
                                    onClick={() => openApplicationDrawer(app.id, 'profile')}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* MENU: PENGARSIPAN (Akad Documents, Signed PDF Vault & Photo Documentation) */}
          {activeMenu === 'archiving' && (
            <div className="space-y-5">
              {/* Executive Hero Banner for Archiving */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-indigo-50/20 to-slate-50 p-6 shadow-xs">
                <div className="pointer-events-none absolute -right-12 -top-12 size-64 rounded-full bg-blue-100/30 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 right-1/4 size-32 rounded-full bg-indigo-100/40 blur-2xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0b57d0] to-[#6366f1] text-white shadow-md shadow-indigo-500/25 ring-4 ring-indigo-50">
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                          Pengarsipan Berkas & Dokumentasi Akad
                        </h2>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Sync
                        </span>
                      </div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                        Pusat monitoring dan pengarsipan naskah dokumen akad resmi (.docx), salinan
                        scan PDF bertandatangan basah, serta foto-foto dokumentasi penandatanganan
                        akad siswa LPK di Google Drive.
                      </p>
                    </div>
                  </div>

                  {/* 3 Metric Cards Ringkas & Elegan */}
                  <div className="grid grid-cols-3 gap-3 shrink-0">
                    <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-slate-500">Total Arsip</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900">
                        {archivingApplications.length}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Proses / selesai akad</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-emerald-800">PDF Basah</p>
                      <p className="mt-1 text-lg font-extrabold text-emerald-700">
                        {archivingApplications.filter((a) => Boolean(a.agreementPdf)).length}
                      </p>
                      <p className="mt-0.5 text-[10px] text-emerald-600/80">
                        Scan naskah bertanda tangan
                      </p>
                    </div>
                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-indigo-800">Foto Akad</p>
                      <p className="mt-1 text-lg font-extrabold text-indigo-700">
                        {
                          archivingApplications.filter(
                            (a) => Array.isArray(a.akadPhotos) && a.akadPhotos.length > 0,
                          ).length
                        }
                      </p>
                      <p className="mt-0.5 text-[10px] text-indigo-600/80">Dokumentasi tersimpan</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-column Table */}
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                        <th className="whitespace-nowrap px-4 py-3">Nama Siswa</th>
                        <th className="whitespace-nowrap px-4 py-3">Status</th>
                        <th className="whitespace-nowrap px-4 py-3">Naskah Akad (.docx)</th>
                        <th className="whitespace-nowrap px-4 py-3">Salinan PDF Basah</th>
                        <th className="whitespace-nowrap px-4 py-3">Foto Dokumentasi</th>
                        <th className="whitespace-nowrap px-4 py-3">Kelengkapan</th>
                        <th className="whitespace-nowrap px-4 py-3">Tanggal Penerbangan</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {archivingApplications.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                            Belum ada berkas pengarsipan yang perlu dilengkapi. Pengajuan yang
                            naskah akadnya telah terbit akan tampil di sini hingga seluruh berkas
                            arsip lengkap diunggah.
                          </td>
                        </tr>
                      ) : (
                        archivingApplications.map((app) => {
                          const akadMeta = (app.financialPlan?.akadDocument ?? null) as {
                            documentNumber?: string
                            studentNumber?: string
                            issuedAt?: string
                          } | null
                          const hasDocx = Boolean(akadMeta)
                          const hasPdf = Boolean(app.agreementPdf)
                          const photoCount = Array.isArray(app.akadPhotos)
                            ? app.akadPhotos.length
                            : 0
                          const hasPhotos = photoCount > 0
                          const hasDeparture = Boolean(app.departureDate)

                          const hasStartedInstallments =
                            (Array.isArray(app.paidInstallments) &&
                              app.paidInstallments.length > 0) ||
                            payments.some(
                              (p) =>
                                (p.applicationDocId === app.id ||
                                  (!p.applicationDocId && p.applicationId === app.applicationId)) &&
                                p.status === 'PAID',
                            )

                          let completenessLabel = 'Menunggu'
                          let completenessBadge = 'bg-slate-100 text-slate-600'
                          if (hasDocx && hasPdf && hasPhotos && hasDeparture) {
                            completenessLabel = 'Lengkap'
                            completenessBadge =
                              'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          } else if (hasDocx || hasPdf || hasPhotos || hasDeparture) {
                            completenessLabel = 'Sebagian'
                            completenessBadge = 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          }

                          return (
                            <tr className="hover:bg-slate-50/80" key={app.id}>
                              <td className="whitespace-nowrap px-4 py-3">
                                <p className="font-semibold text-slate-900">{app.applicantName}</p>
                                <p className="text-[11px] text-slate-400">{app.lpkName}</p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {hasStartedInstallments ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    Aktif
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#0b57d0] ring-1 ring-inset ring-blue-200">
                                    <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    Siap Mengangsur
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {hasDocx ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                      Terbit
                                    </span>
                                    <p
                                      className="font-mono text-[11px] text-slate-700"
                                      title={akadMeta?.documentNumber}
                                    >
                                      {akadMeta?.documentNumber}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                    Belum terbit
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {hasPdf ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    <svg
                                      className="size-3 text-emerald-600"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4.5 12.75l6 6 9-13.5"
                                      />
                                    </svg>
                                    PDF Terunggah
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                    Belum ada
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {hasPhotos ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                                    <svg
                                      className="size-3 text-indigo-600"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                                      />
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                                      />
                                    </svg>
                                    {photoCount} Foto
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                    Belum ada
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${completenessBadge}`}
                                >
                                  {completenessLabel}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {app.departureDate ? (
                                  <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                                    <svg
                                      aria-hidden="true"
                                      className="size-3.5 text-[#0b57d0] shrink-0"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                                    </svg>
                                    <span>{formatDateShort(app.departureDate)}</span>
                                  </div>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                                    Belum dijadwalkan
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <DrawerAction
                                    ariaLabel={`Kelola arsip ${app.applicationId}`}
                                    label="Kelola Arsip"
                                    onClick={() => openApplicationDrawer(app.id, 'contract')}
                                    variant="primary"
                                  />
                                  <button
                                    aria-label={
                                      hasStartedInstallments
                                        ? 'Tidak dapat dibatalkan karena siswa sudah mulai mengangsur'
                                        : `Batalkan penerbitan akad ${app.applicantName}`
                                    }
                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={hasStartedInstallments || !hasDocx}
                                    onClick={() => {
                                      setCancelAkadTarget(app)
                                      setCancelAkadError('')
                                    }}
                                    title={
                                      hasStartedInstallments
                                        ? 'Tidak dapat dibatalkan karena siswa sudah mulai mengangsur (status Aktif)'
                                        : 'Batalkan penerbitan akad dan kembalikan ke Persiapan Akad'
                                    }
                                    type="button"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="size-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
          {activeMenu === 'students' && (
            <div className="space-y-5">
              <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-emerald-50/30 p-5 shadow-xs sm:p-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-12 -top-12 size-56 rounded-full bg-blue-100/50 blur-3xl"
                />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0b57d0] to-emerald-500 text-white shadow-md shadow-blue-500/20 ring-4 ring-blue-50">
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm2 4a4 4 0 0 1 4 4v2h-4m-1-14a4 4 0 0 1 0 8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-lg font-extrabold text-slate-900">
                        Direktori Semua Siswa
                      </h1>
                      <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
                        Satu direktori untuk meninjau identitas, program, kesiapan keberangkatan,
                        berkas, dan status pembiayaan seluruh siswa.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:flex sm:gap-6">
                    {[
                      {
                        label: 'Total Siswa',
                        value: studentDirectoryCounts.ALL,
                        tone: 'text-[#0b57d0]',
                      },
                      {
                        label: 'Dalam Proses',
                        value: studentDirectoryCounts.IN_PROGRESS,
                        tone: 'text-violet-700',
                      },
                      {
                        label: 'Siswa Aktif',
                        value: studentDirectoryCounts.ACTIVE,
                        tone: 'text-emerald-700',
                      },
                      {
                        label: 'Alumni',
                        value: studentDirectoryCounts.ALUMNI,
                        tone: 'text-amber-700',
                      },
                    ].map((metric) => (
                      <div className="min-w-16 text-left sm:text-center" key={metric.label}>
                        <span className={`block text-xl font-extrabold ${metric.tone}`}>
                          {metric.value}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                          {metric.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Daftar Semua Siswa ({visibleStudentDirectoryRows.length}
                    {studentDirectoryFilter !== 'ALL' ? ` dari ${studentDirectoryCounts.ALL}` : ''})
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {STUDENT_DIRECTORY_FILTERS.map((filter) => (
                      <button
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] ${
                          studentDirectoryFilter === filter.id
                            ? 'bg-[#0b57d0] text-white shadow-2xs'
                            : 'border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                        key={filter.id}
                        onClick={() => setStudentDirectoryFilter(filter.id)}
                        style={{ fontSize: '10px' }}
                        type="button"
                      >
                        <span>{filter.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold leading-none ${
                            studentDirectoryFilter === filter.id
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {studentDirectoryCounts[filter.id]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {visibleStudentDirectoryRows.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-slate-500">
                    Tidak ada siswa yang cocok dengan filter ini.
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[1160px] table-fixed text-left text-xs">
                        <colgroup>
                          <col className="w-[17%]" />
                          <col className="w-[19%]" />
                          <col className="w-[12%]" />
                          <col className="w-[15%]" />
                          <col className="w-[11%]" />
                          <col className="w-[11%]" />
                          <col className="w-[15%]" />
                        </colgroup>
                        <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-500">
                          <tr className="border-b border-slate-200">
                            <th className="whitespace-nowrap px-4 py-2">Siswa</th>
                            <th className="whitespace-nowrap px-4 py-2">Program &amp; LPK</th>
                            <th className="whitespace-nowrap px-4 py-2">Negara &amp; Berangkat</th>
                            <th className="whitespace-nowrap px-4 py-2">Status Program</th>
                            <th className="whitespace-nowrap px-4 py-2">Berkas</th>
                            <th className="whitespace-nowrap px-4 py-2">Pembiayaan</th>
                            <th className="whitespace-nowrap px-4 py-2 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleStudentDirectoryRows.map(({ app, summary }) => {
                            const eligibility = app.eligibility ?? {}
                            const uploaded = app.documents.filter((document) =>
                              Boolean(document.fileId),
                            ).length
                            const verified = app.documents.filter(
                              (document) => document.status === 'VERIFIED',
                            ).length
                            const akadDocument = app.financialPlan?.akadDocument
                            const studentNumber =
                              akadDocument && typeof akadDocument === 'object'
                                ? String(
                                    (akadDocument as Record<string, unknown>).studentNumber ?? '',
                                  )
                                : ''
                            const category = getStudentDirectoryCategory(app, summary)
                            return (
                              <tr className="transition-colors hover:bg-emerald-50/30" key={app.id}>
                                <td className="px-4 py-2">
                                  <p className="font-semibold text-slate-900">
                                    {app.applicantName}
                                  </p>
                                  <p className="text-[10px] font-medium text-emerald-700">
                                    NIS {studentNumber || 'belum tersedia'}
                                  </p>
                                  <p
                                    className="text-[10px] text-slate-400"
                                    title={app.applicationId}
                                  >
                                    {formatDisplayApplicationId(app.applicationId)}
                                  </p>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                    {app.product === 'FULL_COVER'
                                      ? 'Full Cover'
                                      : 'Dana Keberangkatan'}
                                  </span>
                                  <p
                                    className="mt-1 max-w-52 truncate text-slate-700"
                                    title={app.lpkName}
                                  >
                                    {app.lpkName || 'LPK belum tersedia'}
                                  </p>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                                  <span
                                    aria-label={app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                                    className="inline-flex items-center gap-1.5"
                                    title={app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                                  >
                                    <DestinationFlag destination={app.destination} />
                                    <span>
                                      {formatDateShort(
                                        eligibility.estimatedDeparture ?? app.departureDate,
                                      ) || '—'}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${STATUS_BADGE_STYLES[app.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}
                                  >
                                    {STATUS_LABELS[app.status as keyof typeof STATUS_LABELS] ??
                                      app.status}
                                  </span>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    COE{' '}
                                    {DOC_PROGRESS_LABELS[String(eligibility.coeStatus ?? '')] ??
                                      '—'}
                                    {' · '}Visa{' '}
                                    {DOC_PROGRESS_LABELS[String(eligibility.visaStatus ?? '')] ??
                                      '—'}
                                  </p>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <p className="font-semibold text-slate-800">
                                    {uploaded}/{app.documents.length} berkas
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                                    {verified} sesuai
                                  </p>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  {category === 'ALUMNI' ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                      ✓ Lunas 100%
                                    </span>
                                  ) : category === 'ACTIVE' ? (
                                    <>
                                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                        Angsuran aktif
                                      </span>
                                      <p className="mt-1 text-[10px] text-slate-500">
                                        Sisa {formatRupiah(summary.remaining)}
                                      </p>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">
                                      {category === 'CLOSED'
                                        ? 'Tidak aktif'
                                        : 'Belum masuk angsuran'}
                                    </span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-4 py-2 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <DrawerAction
                                      ariaLabel={`Buka biodata ${app.applicationId}`}
                                      label="Biodata"
                                      onClick={() => openApplicationDrawer(app.id, 'profile')}
                                    />
                                    <DrawerAction
                                      ariaLabel={`Buka berkas ${app.applicationId}`}
                                      label="Berkas"
                                      onClick={() => openApplicationDrawer(app.id, 'documents')}
                                    />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-3 p-3 md:hidden">
                      {visibleStudentDirectoryRows.map(({ app, summary }) => {
                        const eligibility = app.eligibility ?? {}
                        const uploaded = app.documents.filter((document) =>
                          Boolean(document.fileId),
                        ).length
                        const verified = app.documents.filter(
                          (document) => document.status === 'VERIFIED',
                        ).length
                        const akadDocument = app.financialPlan?.akadDocument
                        const studentNumber =
                          akadDocument && typeof akadDocument === 'object'
                            ? String((akadDocument as Record<string, unknown>).studentNumber ?? '')
                            : ''
                        const category = getStudentDirectoryCategory(app, summary)
                        return (
                          <article
                            className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                            key={app.id}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-bold text-slate-900">
                                  {app.applicantName}
                                </h3>
                                <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                                  NIS {studentNumber || 'belum tersedia'}
                                </p>
                                <p
                                  className="truncate text-[10px] text-slate-400"
                                  title={app.applicationId}
                                >
                                  {formatDisplayApplicationId(app.applicationId)}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${category === 'ALUMNI' ? 'bg-emerald-50 text-emerald-700' : category === 'ACTIVE' ? 'bg-blue-50 text-blue-700' : category === 'CLOSED' ? 'bg-red-50 text-red-700' : 'bg-violet-50 text-violet-700'}`}
                              >
                                {category === 'ALUMNI'
                                  ? 'Lunas 100%'
                                  : category === 'ACTIVE'
                                    ? 'Aktif'
                                    : category === 'CLOSED'
                                      ? 'Ditutup'
                                      : 'Dalam proses'}
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                              <div>
                                <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                                  Program &amp; LPK
                                </span>
                                <p className="mt-0.5 truncate font-semibold text-slate-700">
                                  {app.product === 'FULL_COVER'
                                    ? 'Full Cover'
                                    : 'Dana Keberangkatan'}
                                </p>
                                <p className="truncate text-slate-500">
                                  {app.lpkName || 'LPK belum tersedia'}
                                </p>
                              </div>
                              <div>
                                <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                                  Negara &amp; Berangkat
                                </span>
                                <p className="mt-0.5 font-semibold text-slate-700">
                                  <span className="inline-flex items-center gap-1.5">
                                    <DestinationFlag destination={app.destination} />
                                    {app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                                  </span>
                                </p>
                                <p className="text-slate-500">
                                  {formatDateShort(
                                    eligibility.estimatedDeparture ?? app.departureDate,
                                  ) || 'Tanggal belum tersedia'}
                                </p>
                              </div>
                              <div>
                                <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                                  Status Program
                                </span>
                                <p className="mt-0.5 font-semibold text-slate-700">
                                  {STATUS_LABELS[app.status as keyof typeof STATUS_LABELS] ??
                                    app.status}
                                </p>
                                <p className="text-slate-500">
                                  COE{' '}
                                  {DOC_PROGRESS_LABELS[String(eligibility.coeStatus ?? '')] ?? '—'}{' '}
                                  · Visa{' '}
                                  {DOC_PROGRESS_LABELS[String(eligibility.visaStatus ?? '')] ?? '—'}
                                </p>
                              </div>
                              <div>
                                <span className="block text-[9px] uppercase tracking-wider text-slate-400">
                                  Berkas
                                </span>
                                <p className="mt-0.5 font-semibold text-slate-700">
                                  {uploaded}/{app.documents.length} terunggah · {verified} sesuai
                                </p>
                                {category === 'ACTIVE' && (
                                  <p className="text-slate-500">
                                    Sisa {formatRupiah(summary.remaining)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                              <DrawerAction
                                ariaLabel={`Buka biodata ${app.applicationId}`}
                                label="Biodata"
                                onClick={() => openApplicationDrawer(app.id, 'profile')}
                              />
                              <DrawerAction
                                ariaLabel={`Buka berkas ${app.applicationId}`}
                                label="Berkas"
                                onClick={() => openApplicationDrawer(app.id, 'documents')}
                              />
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {/* 4. MENU: PERSIAPAN AKAD (Financial Plan & Shariah Contract Table) */}
          {activeMenu === 'contracts' && (
            <div className="space-y-5">
              {/* Executive Hero Banner for Persiapan Akad */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-blue-50/25 to-slate-50 p-6 shadow-xs">
                <div className="pointer-events-none absolute -right-12 -top-12 size-64 rounded-full bg-blue-100/40 blur-3xl" />
                <div className="pointer-events-none absolute bottom-0 right-1/4 size-32 rounded-full bg-indigo-50/50 blur-2xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0b57d0] to-[#4285f4] text-white shadow-md shadow-blue-500/25 ring-4 ring-blue-50">
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                          Persiapan Akad
                        </h2>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Sync
                        </span>
                      </div>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                        Penyusunan rincian Nafaqah, Ujrah, simulasi pembiayaan syariah, verifikasi
                        nominal wakalah mutlak admin, dan penguncian akad resmi.
                      </p>
                    </div>
                  </div>

                  {/* 3 Metric Cards Ringkas & Elegan */}
                  <div className="grid grid-cols-3 gap-3 shrink-0">
                    <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-slate-500">Total Masuk</p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900">
                        {metrics.contractPrepCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Siap proses akad</p>
                    </div>
                    <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-[#0b57d0]">Perlu Tinjauan</p>
                      <p className="mt-1 text-lg font-extrabold text-[#0b57d0]">
                        {metrics.pendingReview}
                      </p>
                      <p className="mt-0.5 text-[10px] text-blue-600/80">Biaya & Dokumen</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 shadow-2xs backdrop-blur-xs">
                      <p className="text-[11px] font-medium text-emerald-800">Akad Berjalan</p>
                      <p className="mt-1 text-lg font-extrabold text-emerald-700">
                        {metrics.activeCount}
                      </p>
                      <p className="mt-0.5 text-[10px] text-emerald-600/80">Aktif & Selesai</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi-column Table */}
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                        <th className="whitespace-nowrap px-4 py-3">ID Pengajuan</th>
                        <th className="whitespace-nowrap px-4 py-3">Nama Siswa</th>
                        <th className="whitespace-nowrap px-4 py-3">Produk & Skema</th>
                        <th className="whitespace-nowrap px-4 py-3">Pengajuan Awal</th>
                        <th className="whitespace-nowrap px-4 py-3">Nafaqah + Ujrah</th>
                        <th className="whitespace-nowrap px-4 py-3">Total Akad</th>
                        <th className="whitespace-nowrap px-4 py-3">Status Biaya</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contractPrepApplications.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                            Belum ada pengajuan dengan nominal disetujui. Setujui nominal pengajuan
                            di menu Pengajuan agar masuk ke Persiapan Akad.
                          </td>
                        </tr>
                      ) : (
                        contractPrepApplications.map((app) => {
                          const plan = app.financialPlan ?? {}
                          const pricing = String(plan.pricingStatus ?? 'ESTIMATED')
                          const nafaqah = Number(plan.nafaqahTotal) || 0
                          const ujrah = Number(plan.ujrahTotal) || 0
                          const requested = app.departureDetails?.requestedFinancingAmount

                          return (
                            <tr className="hover:bg-slate-50/80" key={app.id}>
                              <td
                                className="whitespace-nowrap px-4 py-3 font-bold text-[#0b57d0]"
                                title={app.applicationId}
                              >
                                {formatDisplayApplicationId(app.applicationId)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                                {app.applicantName}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {app.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                {formatRupiah(requested)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                {nafaqah + ujrah > 0 ? formatRupiah(nafaqah + ujrah) : '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                                {formatRupiah(plan.totalObligation)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    PRICING_BADGE_STYLES[pricing] ?? 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {PRICING_STATUS_LABELS[
                                    pricing as keyof typeof PRICING_STATUS_LABELS
                                  ] ?? pricing}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    aria-label={`Kembalikan pengajuan ${app.applicationId} ke menu Pengajuan`}
                                    className="inline-flex size-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-xs transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={pending}
                                    onClick={() => {
                                      setRevertError('')
                                      setRevertTarget(app)
                                    }}
                                    title="Kembalikan ke Pengajuan (Batalkan Persetujuan Nominal)"
                                    type="button"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="size-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={1.8}
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
                                    </svg>
                                  </button>
                                  <DrawerAction
                                    ariaLabel={`Susun akad ${app.applicationId}`}
                                    label="Susun Akad"
                                    onClick={() => openApplicationDrawer(app.id, 'pricing')}
                                    variant="primary"
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {activeMenu === 'alumni' && (
            <div className="space-y-5">
              <section className="relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-white via-amber-50/20 to-emerald-50/20 p-6 shadow-xs">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-emerald-600 text-white shadow-md">
                      <svg
                        aria-hidden="true"
                        className="size-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path d="m2 10 10-5 10 5-10 5-10-5Z" strokeLinejoin="round" />
                        <path
                          d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-lg font-extrabold text-slate-900">
                        Direktori Alumni &amp; Pelunasan Tuntas
                      </h1>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Daftar pembiayaan siswa yang telah diselesaikan 100% secara amanah, tuntas,
                        dan tepat waktu.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-5 sm:gap-7">
                    <div>
                      <span className="block text-xl font-extrabold text-emerald-700">
                        {formatRupiah(alumniMetrics.totalRecovered)}
                      </span>
                      <span className="text-[11px] text-slate-500">Total dana terpulihkan</span>
                    </div>
                    <div>
                      <span className="block text-xl font-extrabold text-amber-700">
                        {alumniMetrics.averageMonths}
                        {typeof alumniMetrics.averageMonths === 'string' ? '' : ' bln'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Rata-rata waktu sampai lunas
                      </span>
                    </div>
                    <div>
                      <span className="block text-xl font-extrabold text-emerald-700">
                        {alumniMetrics.punctuality}%
                      </span>
                      <span className="text-[11px] text-slate-500">Tingkat tepat waktu</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
                  <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Daftar Alumni ({visibleAlumni.length})
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['ALL', 'Semua Alumni'],
                        ['ON_TIME', 'Lunas Tepat Waktu'],
                        ['EARLY', 'Pelunasan Dipercepat'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${alumniFilter === id ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:bg-slate-100'}`}
                        key={id}
                        onClick={() => setAlumniFilter(id)}
                        style={{ fontSize: '10px' }}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {visibleAlumni.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-slate-500">
                    Belum ada alumni yang cocok dengan filter ini.
                  </div>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-4 py-2">Alumni</th>
                            <th className="px-4 py-2">Program &amp; LPK</th>
                            <th className="px-4 py-2">Negara &amp; Keberangkatan</th>
                            <th className="px-4 py-2">Total Realisasi Lunas</th>
                            <th className="px-4 py-2">Penyelesaian Angsuran</th>
                            <th className="px-4 py-2">Rekam Jejak</th>
                            <th className="px-4 py-2 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleAlumni.map(
                            ({
                              app,
                              summary,
                              latestPaidAt,
                              paidLate,
                              accelerated,
                              hasPaymentEvidence,
                            }) => (
                              <tr className="hover:bg-emerald-50/30" key={app.id}>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-semibold text-slate-900">
                                    {app.applicantName}
                                  </span>
                                  <span className="block text-[11px] font-bold text-emerald-700">
                                    NIS{' '}
                                    {String(
                                      app.financialPlan?.akadDocument &&
                                        typeof app.financialPlan.akadDocument === 'object'
                                        ? ((
                                            app.financialPlan.akadDocument as Record<
                                              string,
                                              unknown
                                            >
                                          ).studentNumber ?? '')
                                        : '',
                                    ) || 'belum tersedia'}
                                  </span>
                                  <span className="block text-[10px] font-medium text-slate-500">
                                    {formatDisplayApplicationId(app.applicationId)}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2 text-left">
                                  <div className="flex flex-col items-start text-left">
                                    <span
                                      className={`flex w-fit rounded-full px-2 py-0.5 text-left text-[10px] font-semibold ${app.product === 'FULL_COVER' ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700'}`}
                                    >
                                      {app.product === 'FULL_COVER'
                                        ? 'Full Cover'
                                        : 'Dana Keberangkatan'}
                                    </span>
                                    <span className="mt-1 text-left text-[11px] text-slate-500">
                                      {app.lpkName}
                                    </span>
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span
                                    className="inline-flex items-center gap-2 text-slate-700"
                                    title={`${app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}, keberangkatan ${formatDateShort(app.departureDate)}`}
                                  >
                                    <DestinationFlag destination={app.destination} />
                                    <span className="sr-only">
                                      {app.destination === 'JAPAN' ? 'Jepang' : 'Turki'}
                                    </span>
                                    <span className="text-[11px]">
                                      {formatDateShort(app.departureDate)}
                                    </span>
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-semibold text-slate-900">
                                    {formatRupiah(summary.paidAmount)}
                                  </span>
                                  <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    ✓ Lunas 100%
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-medium text-slate-700">
                                    {summary.paidCount}/{summary.schedule.length} Angsuran
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    Terakhir: {formatDateShort(latestPaidAt)}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2 text-center">
                                  <div className="flex flex-col items-center">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${paidLate ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}
                                    >
                                      {!hasPaymentEvidence
                                        ? 'Riwayat belum tersedia'
                                        : paidLate
                                          ? 'Pernah terlambat'
                                          : 'Disiplin / Lancar'}
                                    </span>
                                    {accelerated && (
                                      <span className="mt-1 text-[10px] font-semibold text-blue-700">
                                        Pelunasan Awal
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-2 text-right">
                                  <button
                                    className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                                    onClick={() =>
                                      openApplicationDrawer(app.id, 'installment-history')
                                    }
                                    type="button"
                                  >
                                    Rincian Riwayat
                                  </button>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="divide-y divide-slate-100 md:hidden">
                      {visibleAlumni.map(({ app, summary, latestPaidAt }) => (
                        <article className="space-y-3 p-4" key={app.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-slate-900">{app.applicantName}</h3>
                              <p className="text-[11px] font-semibold text-emerald-700">
                                NIS{' '}
                                {String(
                                  app.financialPlan?.akadDocument &&
                                    typeof app.financialPlan.akadDocument === 'object'
                                    ? ((app.financialPlan.akadDocument as Record<string, unknown>)
                                        .studentNumber ?? '')
                                    : '',
                                ) || 'belum tersedia'}
                              </p>
                              <p className="text-[10px] font-medium text-slate-500">
                                {formatDisplayApplicationId(app.applicationId)}
                              </p>
                              <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                {app.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                              ✓ Lunas 100%
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="block text-[10px] text-slate-400">
                                Total terbayar
                              </span>
                              <strong>{formatRupiah(summary.paidAmount)}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-400">
                                Angsuran selesai
                              </span>
                              <strong>
                                {summary.paidCount}/{summary.schedule.length}
                              </strong>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-400">
                                Pembayaran terakhir
                              </span>
                              <strong>{formatDateShort(latestPaidAt)}</strong>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-400">
                                Negara · Keberangkatan
                              </span>
                              <strong>
                                {app.destination === 'JAPAN' ? 'Jepang' : 'Turki'} ·{' '}
                                {formatDateShort(app.departureDate)}
                              </strong>
                            </div>
                          </div>
                          <button
                            className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                            onClick={() => openApplicationDrawer(app.id, 'installment-history')}
                            type="button"
                          >
                            Rincian Riwayat
                          </button>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {activeMenu === 'paymentMonitor' && (
            <InstallmentMonitor applications={applications} proofs={paymentProofs} />
          )}

          {/* MENU: SISWA AKTIF (Outstanding & Active Students) */}
          {activeMenu === 'activeInstallments' && (
            <div className="space-y-5">
              {/* Executive Hero Banner — Siswa Aktif */}
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 p-6 shadow-xs">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-200/20 blur-2xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-teal-200/20 blur-2xl"
                />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
                      <svg
                        aria-hidden="true"
                        className="h-6 w-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-lg font-extrabold text-slate-900">
                        Pemantauan Siswa Aktif
                      </h1>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Pantau progress angsuran, jatuh tempo, dan status kewajiban seluruh siswa
                        yang sedang aktif menjalani program pembiayaan
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-4 sm:gap-6">
                    <div className="text-center">
                      <span className="block text-2xl font-extrabold text-[#0b57d0]">
                        {activeInstallmentMetrics.count}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        Siswa Aktif
                      </span>
                    </div>
                    <div className="text-center">
                      <span
                        className={`block text-2xl font-extrabold ${activeInstallmentMetrics.overdue > 0 ? 'text-red-600' : 'text-slate-400'}`}
                      >
                        {activeInstallmentMetrics.overdue}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        Terlambat
                      </span>
                    </div>
                    <div className="text-center">
                      <span
                        className={`block text-2xl font-extrabold ${activeInstallmentMetrics.dueSoon > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                      >
                        {activeInstallmentMetrics.dueSoon}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                        Jatuh Tempo
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-medium text-slate-500">Siswa Aktif</span>
                    <span className="rounded-lg bg-[#e8f0fe] p-1.5 text-[#0b57d0]">
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <strong className="mt-2 block text-2xl font-extrabold text-[#0b57d0]">
                    {activeInstallmentMetrics.count}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Aktif berjalan &amp; dalam masa angsuran
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-medium text-slate-500">Total Sisa Kewajiban</span>
                    <span className="rounded-lg bg-slate-100 p-1.5 text-slate-500">
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <strong className="mt-2 block text-2xl font-extrabold text-slate-900">
                    {formatRupiah(activeInstallmentMetrics.totalRemaining)}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Akumulasi seluruh tanggungan
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-medium text-slate-500">Terlambat Bayar</span>
                    <span
                      className={`rounded-lg p-1.5 ${activeInstallmentMetrics.overdue > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-400'}`}
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <strong
                    className={`mt-2 block text-2xl font-extrabold ${activeInstallmentMetrics.overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}
                  >
                    {activeInstallmentMetrics.overdue}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Lewat tanggal jatuh tempo
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-medium text-slate-500">Jatuh Tempo ≤ 7 Hari</span>
                    <span
                      className={`rounded-lg p-1.5 ${activeInstallmentMetrics.dueSoon > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <strong
                    className={`mt-2 block text-2xl font-extrabold ${activeInstallmentMetrics.dueSoon > 0 ? 'text-amber-600' : 'text-slate-900'}`}
                  >
                    {activeInstallmentMetrics.dueSoon}
                  </strong>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    Jatuh tempo dalam 7 hari ke depan
                  </span>
                </div>
              </div>

              {/* Table Section */}
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                {/* Table header + filter chips */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
                  <h2
                    className="text-[10px] font-semibold uppercase tracking-wider text-slate-600"
                    style={{ fontSize: '10px' }}
                  >
                    Daftar Siswa Aktif ({visibleActiveInstallments.length}
                    {activeInstallmentFilter !== 'ALL'
                      ? ` dari ${activeInstallmentMetrics.count}`
                      : ''}
                    )
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    {ACTIVE_INSTALLMENT_FILTERS.map((filter) => {
                      const count =
                        filter.id === 'ALL'
                          ? activeInstallmentSummaries.length
                          : filter.id === 'OVERDUE'
                            ? activeInstallmentMetrics.overdue
                            : filter.id === 'DUE_SOON'
                              ? activeInstallmentMetrics.dueSoon
                              : activeInstallmentSummaries.length -
                                activeInstallmentMetrics.overdue -
                                activeInstallmentMetrics.dueSoon
                      return (
                        <button
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] ${
                            activeInstallmentFilter === filter.id
                              ? 'bg-[#0b57d0] text-white shadow-2xs'
                              : 'border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                          key={filter.id}
                          onClick={() => setActiveInstallmentFilter(filter.id)}
                          style={{ fontSize: '10px' }}
                          type="button"
                        >
                          <span>{filter.label}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold leading-none ${
                              activeInstallmentFilter === filter.id
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {visibleActiveInstallments.length === 0 ? (
                  /* Empty state */
                  <div className="flex flex-col items-center px-5 py-12 text-center">
                    <svg
                      aria-hidden="true"
                      className="h-9 w-9 text-slate-300"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <p className="mt-2.5 text-xs font-semibold text-slate-700">Tidak ada siswa</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Tidak ada siswa aktif pada filter ini.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <ul className="divide-y divide-slate-100 lg:hidden">
                      {visibleActiveInstallments.map(({ app, summary }) => {
                        const overdueDays =
                          summary.nextDue && summary.overdueCount > 0
                            ? getDaysBetween(summary.nextDue.dueDate, todayIso)
                            : 0
                        const progressPercent = getNominalProgressPercent(summary)
                        const rowBg =
                          overdueDays > 0 ? 'bg-red-50/40' : summary.dueSoon ? 'bg-amber-50/40' : ''
                        return (
                          <li className={`p-3.5 ${rowBg}`} key={app.id}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">
                                  {app.applicantName}
                                </p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                  {app.applicationId} · {app.lpkName}
                                </p>
                                <div className="mt-1">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      app.product === 'FULL_COVER'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-teal-50 text-teal-700'
                                    }`}
                                  >
                                    {app.product === 'FULL_COVER'
                                      ? 'Full Cover'
                                      : 'Dana Keberangkatan'}
                                  </span>
                                </div>
                              </div>
                              {/* Status bayar badge */}
                              {overdueDays > 0 ? (
                                <span className="inline-flex shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  Terlambat {overdueDays} hr
                                </span>
                              ) : summary.dueSoon ? (
                                <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  ≤7 hari
                                </span>
                              ) : (
                                <span className="inline-flex shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Berjalan
                                </span>
                              )}
                            </div>
                            <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-100">
                                <dt className="text-[11px] text-slate-400">Sisa Kewajiban</dt>
                                <dd className="mt-0.5 font-bold text-slate-900">
                                  {formatRupiah(summary.remaining)}
                                </dd>
                              </div>
                              <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-100">
                                <dt className="text-[11px] text-slate-400">Terbayar</dt>
                                <dd className="mt-0.5 font-semibold text-emerald-700">
                                  {summary.paidAmount > 0 ? formatRupiah(summary.paidAmount) : '—'}
                                </dd>
                              </div>
                              <div className="col-span-2 rounded-lg bg-white/80 p-2 ring-1 ring-slate-100">
                                <dt className="mb-1 text-[11px] text-slate-400">
                                  Progres · {summary.paidCount}/{summary.schedule.length} lunas (
                                  {progressPercent}%)
                                </dt>
                                <dd>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                </dd>
                              </div>
                              <div className="col-span-2 rounded-lg bg-white/80 p-2 ring-1 ring-slate-100">
                                <dt className="text-[11px] text-slate-400">
                                  Jatuh Tempo Berikutnya
                                </dt>
                                <dd className="mt-0.5 font-bold text-slate-900">
                                  {summary.nextDue ? formatDateShort(summary.nextDue.dueDate) : '—'}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                              <DrawerAction
                                ariaLabel={`Lihat riwayat angsuran ${app.applicationId}`}
                                label="Rincian"
                                onClick={() => openApplicationDrawer(app.id, 'installment-history')}
                              />
                            </div>
                          </li>
                        )
                      })}
                    </ul>

                    {/* Desktop table — 7 kolom (tanpa kolom tanggal penerbangan, tinggi baris lebih ringkas) */}
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <th className="whitespace-nowrap px-4 py-2">Siswa</th>
                            <th className="whitespace-nowrap px-4 py-2">Program &amp; LPK</th>
                            <th className="whitespace-nowrap px-4 py-2">Kewajiban</th>
                            <th className="whitespace-nowrap px-4 py-2">Sisa &amp; Progres</th>
                            <th className="whitespace-nowrap px-4 py-2">Jatuh Tempo</th>
                            <th className="whitespace-nowrap px-4 py-2">Status Bayar</th>
                            <th className="whitespace-nowrap px-4 py-2 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleActiveInstallments.map(({ app, summary }) => {
                            const overdueDays =
                              summary.nextDue && summary.overdueCount > 0
                                ? getDaysBetween(summary.nextDue.dueDate, todayIso)
                                : 0
                            const progressPercent = getNominalProgressPercent(summary)
                            const rowBg =
                              overdueDays > 0
                                ? 'bg-red-50/40 hover:bg-red-50/60'
                                : summary.dueSoon
                                  ? 'bg-amber-50/40 hover:bg-amber-50/60'
                                  : 'hover:bg-slate-50/80'
                            return (
                              <tr className={rowBg} key={app.id}>
                                {/* Kolom 1: Siswa */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-semibold text-slate-900 leading-tight">
                                    {app.applicantName}
                                  </span>
                                  <span className="block text-[11px] font-bold text-[#0b57d0] leading-tight">
                                    {app.applicationId}
                                  </span>
                                </td>
                                {/* Kolom 2: Program & LPK */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      app.product === 'FULL_COVER'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'bg-teal-50 text-teal-700'
                                    }`}
                                  >
                                    {app.product === 'FULL_COVER'
                                      ? 'Full Cover'
                                      : 'Dana Keberangkatan'}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-slate-500 leading-tight">
                                    {app.lpkName}
                                  </span>
                                </td>
                                {/* Kolom 3: Kewajiban (total + terbayar) */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-medium text-slate-900 leading-tight">
                                    {formatRupiah(summary.obligation)}
                                  </span>
                                  <span className="block text-[11px] font-semibold text-emerald-700 leading-tight">
                                    {summary.paidAmount > 0
                                      ? `Terbayar ${formatRupiah(summary.paidAmount)}`
                                      : 'Belum ada pembayaran'}
                                  </span>
                                </td>
                                {/* Kolom 4: Sisa & Progres */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="block font-bold text-slate-900 leading-tight">
                                    {formatRupiah(summary.remaining)}
                                  </span>
                                  <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-[11px] text-slate-400 leading-tight">
                                      {summary.paidCount}/{summary.schedule.length} lunas
                                    </span>
                                    {summary.schedule.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                                          <div
                                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                                            style={{ width: `${progressPercent}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          {progressPercent}%
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {/* Kolom 5: Jatuh Tempo */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  <span className="font-medium text-slate-700">
                                    {summary.nextDue
                                      ? formatDateShort(summary.nextDue.dueDate)
                                      : '—'}
                                  </span>
                                </td>
                                {/* Kolom 6: Status Bayar */}
                                <td className="whitespace-nowrap px-4 py-2">
                                  {overdueDays > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                      Terlambat {overdueDays} hr
                                    </span>
                                  ) : summary.dueSoon ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                      Jatuh tempo ≤7 hr
                                    </span>
                                  ) : summary.remaining <= 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                      Lunas
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                      Berjalan
                                    </span>
                                  )}
                                </td>
                                {/* Kolom 7: Aksi */}
                                <td className="whitespace-nowrap px-4 py-2 text-right">
                                  <button
                                    aria-label={`Lihat riwayat angsuran ${app.applicationId}`}
                                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#0b57d0] shadow-2xs transition hover:border-[#0b57d0]/30 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
                                    onClick={() =>
                                      openApplicationDrawer(app.id, 'installment-history')
                                    }
                                    type="button"
                                  >
                                    Rincian
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {activeMenu === 'vip' && <AdminVipPanel searchQuery={searchQuery} todayIso={todayIso} />}

          {/* 10. MENU: LOG AUDIT (Financial Plan History Table) */}
          {activeMenu === 'audit' && (
            <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                      <th className="whitespace-nowrap px-4 py-3">Waktu Perubahan</th>
                      <th className="whitespace-nowrap px-4 py-3">ID Pengajuan & Siswa</th>
                      <th className="whitespace-nowrap px-4 py-3">Staf Pemeriksa</th>
                      <th className="whitespace-nowrap px-4 py-3">Status Biaya</th>
                      <th className="whitespace-nowrap px-4 py-3">Total Kewajiban</th>
                      <th className="whitespace-nowrap px-4 py-3">Referensi Akad & Catatan</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditEntries.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-slate-400" colSpan={7}>
                          Belum ada riwayat perubahan biaya yang tercatat.
                        </td>
                      </tr>
                    ) : (
                      auditEntries.map((item, idx) => (
                        <tr
                          className="hover:bg-slate-50/80"
                          key={`${item.app.id}-${item.changedAt}-${idx}`}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                            {formatDateTime(item.changedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="font-bold text-[#0b57d0]">
                              {item.app.applicationId}
                            </span>{' '}
                            ·{' '}
                            <span className="font-medium text-slate-900">
                              {item.app.applicantName}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {item.changedBy}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                PRICING_BADGE_STYLES[item.pricingStatus] ??
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {PRICING_STATUS_LABELS[
                                item.pricingStatus as keyof typeof PRICING_STATUS_LABELS
                              ] ?? item.pricingStatus}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                            {formatRupiah(item.totalObligation)}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-slate-500">
                            {item.finalAgreementReference || item.settlementNotes || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <DrawerAction
                              ariaLabel={`Lihat detail audit ${item.app.applicationId}`}
                              label="Detail"
                              onClick={() => openApplicationDrawer(item.app.id, 'pricing')}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {applicationToDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setApplicationToDelete(null)
              setDeleteApplicationError('')
            }
          }}
        >
          <section
            aria-labelledby="delete-application-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                <svg
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                >
                  <path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900" id="delete-application-title">
                  Tolak dan hapus pengajuan?
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {applicationToDelete.applicationId} · {applicationToDelete.applicantName}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50/70 p-3.5 text-xs leading-5 text-red-900">
              <p className="font-semibold">
                Data pengajuan di database akan dihapus permanen dan tidak dapat dipulihkan.
              </p>
              <p className="mt-1.5">
                Berkas Google Drive, riwayat pembayaran, serta profil dan NIS siswa tetap tersimpan.
                Pemohon dapat mengajukan permohonan baru.
              </p>
            </div>
            {deleteApplicationError && (
              <p
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                role="alert"
              >
                {deleteApplicationError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => {
                  setApplicationToDelete(null)
                  setDeleteApplicationError('')
                }}
                type="button"
              >
                Batal
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={confirmApplicationDeletion}
                type="button"
              >
                {pending ? 'Menghapus…' : 'Tolak & Hapus'}
              </button>
            </div>
          </section>
        </div>
      )}

      {revertTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setRevertTarget(null)
              setRevertError('')
            }
          }}
        >
          <section
            aria-labelledby="revert-application-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <svg
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900" id="revert-application-title">
                  Kembalikan ke Menu Pengajuan?
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-[#0b57d0]">
                    {formatDisplayApplicationId(revertTarget.applicationId)}
                  </span>{' '}
                  · {revertTarget.applicantName}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs leading-5 text-blue-900">
              <p className="font-semibold flex items-center gap-1.5">
                <svg
                  className="size-4 shrink-0 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                Data siswa tidak akan hilang
              </p>
              <p className="mt-1.5 text-blue-800">
                Data tidak akan dihapus dari sistem. Aksi ini hanya akan membatalkan status nominal
                yang telah disetujui dan mengembalikan pengajuan ke menu <strong>Pengajuan</strong>{' '}
                agar perlu persetujuan ulang oleh admin.
              </p>
            </div>
            {revertError && (
              <p
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                role="alert"
              >
                {revertError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => {
                  setRevertTarget(null)
                  setRevertError('')
                }}
                type="button"
              >
                Batal
              </button>
              <button
                className="rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => handleConfirmRevert(revertTarget)}
                type="button"
              >
                {pending ? 'Mengembalikan…' : 'Kembalikan ke Pengajuan'}
              </button>
            </div>
          </section>
        </div>
      )}

      {cancelAkadTarget && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setCancelAkadTarget(null)
              setCancelAkadError('')
            }
          }}
        >
          <section
            aria-labelledby="cancel-akad-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <svg
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  viewBox="0 0 24 24"
                >
                  <path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v6m6-6v6" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900" id="cancel-akad-title">
                  Batalkan Penerbitan Akad?
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-[#0b57d0]">
                    {formatDisplayApplicationId(cancelAkadTarget.applicationId)}
                  </span>{' '}
                  · {cancelAkadTarget.applicantName}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-5 text-amber-950">
              <p className="font-semibold">Status siswa akan kembali ke Persiapan Akad.</p>
              <p className="mt-1.5">
                File DOCX akad di Google Drive dan NIS pada profil siswa akan dihapus. Nomor urut
                NIS yang dicabut tidak digunakan ulang; penghapusan ini tidak dapat dipulihkan.
                Pembatalan tidak dapat dilakukan jika pembayaran angsuran sudah tercatat atau bukti
                pembayaran masih menunggu pemeriksaan.
              </p>
            </div>
            {cancelAkadError && (
              <p
                className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                role="alert"
              >
                {cancelAkadError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => {
                  setCancelAkadTarget(null)
                  setCancelAkadError('')
                }}
                type="button"
              >
                Batal
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                onClick={() => handleCancelAkadIssuance(cancelAkadTarget)}
                type="button"
              >
                {pending ? 'Membatalkan…' : 'Batalkan Penerbitan'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* SLIDE-OVER DRAWER FOR APPLICATION MANAGEMENT */}
      {drawerApplication && (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden bg-slate-900/40">
          <div className="flex h-dvh min-h-0 w-full max-w-6xl flex-col overflow-hidden shadow-2xl">
            <ApplicationDrawerForm
              activeTab={drawerTab}
              approvalSaving={approvalSavingId === drawerApplication.id}
              application={drawerApplication}
              error={error}
              key={drawerApplication.id}
              payments={payments}
              todayIso={todayIso}
              onAgreePricing={agreePricing}
              onApproveDocument={approveDocument}
              onApprovePricing={approvePricing}
              onClose={() => setDrawerAppId(null)}
              onDeleteDocument={removeDocument}
              onDismissError={() => setError('')}
              onDismissSaved={() => setSavedNotice('')}
              onSave={save}
              onUploadAgreement={uploadAgreement}
              onWorkflow={saveWorkflow}
              pending={pending}
              savedNotice={savedNotice}
              setActiveTab={setDrawerTab}
            />
          </div>
        </div>
      )}
    </div>
  )
}
