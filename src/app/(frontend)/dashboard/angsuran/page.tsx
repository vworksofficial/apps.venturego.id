'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import type { FinancingCostLine } from '@/lib/departure-financing'
import { resolveInstallmentSchedule } from '@/lib/installment-schedule'
import {
  calculateFullCoverBudget,
  calculateFullCoverCharges,
  normalizeFullCoverBudget,
} from '@/lib/full-cover-budget'
import { COMPANY_BANK_ACCOUNT } from '@/lib/company-accounts'
import {
  getOwnedFinancingApplications,
  type UserFinancingResult,
  type UserPaymentProof,
} from './actions'
import { DashboardScaffold, SkeletonBlock } from '../_components/dashboard-ui'

type UserApplication = Extract<UserFinancingResult, { ok: true }>['applications'][number]
type UserPayment = Extract<UserFinancingResult, { ok: true }>['payments'][number]
type PopupKind = 'details' | 'program' | 'payment' | null

const formatRupiah = (value: unknown) =>
  `Rp${(typeof value === 'number' && Number.isFinite(value) ? value : 0).toLocaleString('id-ID')}`

const formatDate = (value: unknown) => {
  const date = typeof value === 'string' ? value.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Tanggal fleksibel'
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const getJakartaDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '01'
  return `${part('year')}-${part('month')}-${part('day')}`
}

const addMonth = (value: string, offset: number) => {
  const [year, month, day] = value.split('-').map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1 + offset, 1))
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return `${firstOfMonth.getUTCFullYear()}-${String(firstOfMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

const formatNumber = (value: number) => value.toLocaleString('id-ID')

const readLines = (value: unknown): FinancingCostLine[] =>
  Array.isArray(value)
    ? value.filter(
        (line): line is FinancingCostLine =>
          Boolean(line) &&
          typeof line.label === 'string' &&
          typeof line.recipient === 'string' &&
          typeof line.amount === 'number' &&
          typeof line.evidenceReference === 'string',
      )
    : []

const programLabel = (application: UserApplication) =>
  application.product === 'FULL_COVER' ? 'Program Full Cover' : 'Program Dana Keberangkatan'

function Icon({ name }: { name: 'program' | 'close' }) {
  const paths = {
    program: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 0 1 5.6 1.5c-.6 1.2-2.6 1.6-2.6 3.5m0 3h.01" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
  }
  return (
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
      {paths[name]}
    </svg>
  )
}

function WhatsAppMark({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.1-.472-.15-.67.15-.198.297-.768.967-.94 1.165-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.496.1-.198.05-.372-.025-.52-.074-.149-.669-1.612-.916-2.206-.242-.579-.487-.5-.67-.51-.173-.009-.372-.011-.57-.011-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.307 1.263.49 1.695.627.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 0 1-1.511-5.26c.001-5.45 4.437-9.884 9.893-9.884 2.645.001 5.131 1.031 6.999 2.901a9.825 9.825 0 0 1 2.9 6.997c-.003 5.45-4.44 9.885-9.908 9.885M20.52 3.48A11.815 11.815 0 0 0 12.087 0C5.52 0 .174 5.345.171 11.912c0 2.096.547 4.142 1.588 5.946L0 24l6.335-1.662a11.93 11.93 0 0 0 5.741 1.462h.005c6.566 0 11.913-5.345 11.916-11.913a11.86 11.86 0 0 0-3.477-8.407z" />
    </svg>
  )
}

function ApplicationTerms({
  application,
  payments,
  initialProofs,
  onRefresh,
  refreshing,
}: {
  application: UserApplication
  payments: UserPayment[]
  initialProofs: UserPaymentProof[]
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const [popup, setPopup] = useState<PopupKind>(null)
  const [paymentProofs, setPaymentProofs] = useState(initialProofs)

  useEffect(() => {
    setPaymentProofs(initialProofs)
  }, [initialProofs])
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentFile, setPaymentFile] = useState<File | null>(null)
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentSubmitted, setPaymentSubmitted] = useState<{
    installmentNumber: number
    amount: number
  } | null>(null)
  const [copiedItem, setCopiedItem] = useState('')
  const programButtonRef = useRef<HTMLButtonElement | null>(null)
  const plan = application.financialPlan
  const isFullCover = application.product === 'FULL_COVER'
  const closed = ['CANCELLED', 'REJECTED'].includes(application.status)
  const nafaqahItems = readLines(plan.nafaqahItems)
  const ujrahItems = readLines(plan.ujrahItems)
  const schedule = resolveInstallmentSchedule(application.product, plan)
  const applicationPayments = payments.filter(
    (payment) => payment.applicationDocId === application.id,
  )
  const paidInstallments = new Set(application.paidInstallments ?? [])
  const paidAmountsByInstallment = new Map<number, number>()
  for (const payment of applicationPayments) {
    if (payment.status !== 'PAID' || payment.installmentNumber === null) continue
    paidAmountsByInstallment.set(
      payment.installmentNumber,
      (paidAmountsByInstallment.get(payment.installmentNumber) ?? 0) + payment.amount,
    )
  }
  for (const entry of schedule) {
    if ((paidAmountsByInstallment.get(entry.installment) ?? 0) >= entry.amount) {
      paidInstallments.add(entry.installment)
    }
  }
  const fullCoverBudget = isFullCover ? normalizeFullCoverBudget(plan.fullCoverBudget) : null
  const fullCoverTotals = fullCoverBudget ? calculateFullCoverBudget(fullCoverBudget) : null
  const fullCoverCharges = fullCoverTotals
    ? calculateFullCoverCharges(fullCoverTotals.nafaqahTotal)
    : null
  const fullCoverUjrah = Number(plan.ujrahTotal) || fullCoverCharges?.ujrahTotal || 0
  const fullCoverJuala = Number(plan.jualaTotal) || fullCoverCharges?.jualaTotal || 0
  const fullCoverObligation =
    Number(plan.totalObligation) ||
    (fullCoverTotals ? fullCoverTotals.nafaqahTotal + fullCoverUjrah : 0)
  const fullCoverObligationWithCoe =
    Number(plan.totalObligationIfCoe) || fullCoverObligation + fullCoverJuala
  const fullCoverTenor = Number(plan.tenorMonths) || 0
  const fullCoverMonthlyInstallment =
    Number(plan.monthlyInstallmentAfterCoe) ||
    (fullCoverTenor > 0 ? Math.floor(fullCoverObligationWithCoe / fullCoverTenor) : 0)
  const plannedCount = schedule.length
  const departureTotal = Number(plan.totalObligation) || 0
  const departureInstallmentCount = Number(plan.installmentCount) || 0
  const departureMonthlyInstallment =
    Number(plan.monthlyInstallmentAmount) ||
    (departureInstallmentCount > 0 ? Math.floor(departureTotal / departureInstallmentCount) : 0)
  const programName = programLabel(application)
  const departureDate =
    application.departureDate ||
    (typeof application.eligibility.estimatedDeparture === 'string'
      ? application.eligibility.estimatedDeparture
      : '')
  const departureDateLabel = /^\d{4}-\d{2}-\d{2}$/.test(departureDate)
    ? formatDate(departureDate)
    : 'Belum ditentukan'
  const whatsappReportUrl = paymentSubmitted
    ? `https://wa.me/6281292271274?text=${encodeURIComponent(
        [
          'Assalamu’alaikum Admin VentureGo,',
          `saya ingin melaporkan pembayaran *Angsuran ke-${paymentSubmitted.installmentNumber}*.`,
          '',
          `Nama: ${application.applicantName}`,
          programName,
          `Negara tujuan: ${application.destination === 'TURKEY' ? '🇹🇷 Turki' : '🇯🇵 Jepang'}`,
          `Nominal transfer: *${formatRupiah(paymentSubmitted.amount)}*`,
          '',
          'Bukti transaksi sudah saya unggah melalui aplikasi dan menunggu verifikasi.',
          'Mohon bantu periksa yaa.',
          'Terimakasih',
        ].join('\n'),
      )}`
    : ''

  const totalObligation = isFullCover ? fullCoverObligation : departureTotal
  const paidAmountFromSchedule = schedule
    .filter((row) => paidInstallments.has(row.installment))
    .reduce((sum, row) => sum + row.amount, 0)
  const paidAmountFromPayments = applicationPayments
    .filter((payment) => payment.status === 'PAID' && payment.installmentNumber !== null)
    .reduce((sum, payment) => sum + payment.amount, 0)
  const totalPaidAmount = Math.min(
    totalObligation,
    Math.max(paidAmountFromSchedule, paidAmountFromPayments),
  )
  const isSettled =
    application.status === 'COMPLETED' ||
    (totalObligation > 0 && totalPaidAmount >= totalObligation)
  if (isSettled) {
    for (const entry of schedule) {
      paidInstallments.add(entry.installment)
    }
  }
  const paidCount = schedule.filter((entry) => paidInstallments.has(entry.installment)).length
  const progress = totalObligation > 0 ? (isSettled ? 1 : totalPaidAmount / totalObligation) : 0
  const flexibleSchedule = schedule.map((entry) => ({
    ...entry,
    paid: isSettled || paidInstallments.has(entry.installment),
  }))
  const firstUnpaidEntry = flexibleSchedule.find((entry) => !entry.paid)
  const firstUnpaidInstallment = firstUnpaidEntry?.installment ?? null
  const savedFirstDay = Number(firstUnpaidEntry?.dueDate.slice(8, 10))
  const todayJakarta = getJakartaDate()
  const flexibleFirstDueDate = `${todayJakarta.slice(0, 7)}-${String(
    Number.isInteger(savedFirstDay) && savedFirstDay >= 1 && savedFirstDay <= 31
      ? Math.min(savedFirstDay, 28)
      : 28,
  ).padStart(2, '0')}`
  const displayedSchedule = flexibleSchedule.map((entry) => ({
    ...entry,
    amount: entry.paid
      ? entry.amount
      : Math.max(
          0,
          entry.amount -
            applicationPayments
              .filter(
                (payment) =>
                  payment.status === 'PAID' && payment.installmentNumber === entry.installment,
              )
              .reduce((sum, payment) => sum + payment.amount, 0),
        ),
    dueDate:
      firstUnpaidInstallment !== null && entry.installment >= firstUnpaidInstallment && !entry.paid
        ? addMonth(flexibleFirstDueDate, entry.installment - firstUnpaidInstallment)
        : entry.dueDate,
  }))

  const pendingProofFor = (installmentNumber: number) =>
    paymentProofs.find(
      (proof) =>
        proof.applicationDocId === application.id &&
        proof.installmentNumber === installmentNumber &&
        proof.status === 'PENDING_REVIEW',
    )

  const openPayment = (installmentNumber: number, amount: number) => {
    setSelectedInstallment(installmentNumber)
    setPaymentAmount(String(amount))
    setPaymentFile(null)
    setPaymentError('')
    setPaymentSubmitted(null)
    setPopup('payment')
  }

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedItem(key)
      window.setTimeout(() => setCopiedItem(''), 1800)
    } catch {
      setPaymentError('Gagal menyalin. Silakan salin teks secara manual.')
    }
  }

  const submitPaymentProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPaymentError('')
    if (!paymentFile || selectedInstallment === null) {
      setPaymentError('Pilih bukti transfer terlebih dahulu.')
      return
    }
    const installmentNumber = selectedInstallment
    const amount = Number(paymentAmount)
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setPaymentError('Masukkan nominal transfer yang valid.')
      return
    }
    const user = getFirebaseClientAuth().currentUser
    if (!user) {
      setPaymentError('Sesi akun tidak ditemukan. Silakan masuk kembali.')
      return
    }
    setPaymentSubmitting(true)
    try {
      const form = new FormData()
      form.set('applicationDocId', application.id)
      form.set('installmentNumber', String(selectedInstallment))
      form.set('amount', String(amount))
      form.set('file', paymentFile)
      const response = await fetch('/api/applicant/payment-proofs', {
        method: 'POST',
        headers: { 'x-upload-token': await user.getIdToken() },
        body: form,
      })
      const result = (await response.json()) as {
        ok?: boolean
        message?: string
        submittedAt?: string
      }
      if (!response.ok || !result.ok) {
        setPaymentError(result.message || 'Bukti pembayaran belum dapat dikirim.')
        return
      }
      const submittedAt = result.submittedAt ?? new Date().toISOString()
      setPaymentProofs((previous) => [
        ...previous,
        {
          id: `local-${Date.now()}`,
          applicationDocId: application.id,
          installmentNumber,
          amount,
          status: 'PENDING_REVIEW',
          submittedAt,
        },
      ])
      setPaymentSubmitted({ installmentNumber, amount })
      setPaymentFile(null)
    } catch {
      setPaymentError('Bukti pembayaran belum dapat dikirim. Periksa koneksi lalu coba lagi.')
    } finally {
      setPaymentSubmitting(false)
    }
  }

  useEffect(() => {
    if (!popup) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopup(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [popup])

  useEffect(() => {
    if (popup !== 'payment' || !paymentFile) {
      setPaymentPreviewUrl('')
      return
    }
    const previewUrl = URL.createObjectURL(paymentFile)
    setPaymentPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [paymentFile, popup])

  return (
    <>
      <section className="relative -mx-5 -mt-5 overflow-hidden bg-gradient-to-br from-[#0b57d0] via-[#1768de] to-[#3985ed] px-5 pt-5 pb-14 text-white sm:px-6 sm:pb-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-2 -top-10 size-44 rounded-full border border-white/10"
        />
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-extrabold sm:text-xl">
              {application.applicantName}
            </h2>
            <p className="mt-0.5 text-[11px] text-blue-100">{application.applicationId}</p>
            <button
              aria-label={`Lihat informasi ${programName}`}
              className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[#0b57d0] shadow-sm transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
              onClick={() => setPopup('program')}
              ref={programButtonRef}
              type="button"
            >
              <Icon name="program" />
              <span className="truncate">{programName}</span>
              <svg aria-hidden="true" className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                <path
                  d="m9 18 6-6-6-6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
            <p className="mt-2 text-[11px] text-blue-100">
              {application.status === 'ACTIVE' && !isSettled
                ? 'Pembiayaan aktif. Pembayaran dimulai sesuai ketentuan akad.'
                : isSettled
                  ? 'Seluruh kewajiban program ini telah selesai.'
                  : 'Rincian progres dan angsuran program Anda.'}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative grid size-52 shrink-0 place-items-center sm:size-60">
              <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="35" fill="currentColor" className="text-white/[0.06]" />
                <path
                  d="M43.93 109.46 A52 52 0 1 1 76.07 109.46"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="butt"
                  strokeWidth="7"
                  className="text-white/25"
                />
                {progress > 0 && (
                  <path
                    d="M43.93 109.46 A52 52 0 1 1 76.07 109.46"
                    fill="none"
                    pathLength={2 * Math.PI * 52 * 0.9}
                    stroke="currentColor"
                    strokeDasharray={`${2 * Math.PI * 52 * 0.9 * progress} ${2 * Math.PI * 52}`}
                    strokeLinecap="round"
                    strokeWidth="7.5"
                    className="text-emerald-200 transition-[stroke-dasharray] duration-700"
                  />
                )}
              </svg>
              <div className="-translate-y-1 text-center">
                <strong className="block text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                  {totalObligation > 0 ? `${Math.round(progress * 100)}%` : '—'}
                </strong>
                <span className="mt-2 block text-[10px] font-semibold text-blue-50">
                  {paidCount}/{plannedCount || '—'}
                </span>
                <span className="mt-0.5 block text-[9px] text-blue-100">angsuran</span>
              </div>
            </div>
            <p className="-mt-1 text-center text-[11px] font-semibold text-emerald-100">
              {formatRupiah(totalPaidAmount)} / {formatRupiah(totalObligation)}
            </p>
            <button
              className="rounded-full px-3 py-1 !text-[11px] font-semibold text-white/90 underline decoration-white/50 underline-offset-4 transition hover:text-white"
              onClick={() => setPopup('details')}
              type="button"
            >
              Rincian Pembiayaan
            </button>
          </div>
        </div>
      </section>

      <section
        aria-label={`Jadwal angsuran ${programName}`}
        className="relative z-10 -mx-5 -mt-10 rounded-t-[1.5rem] bg-[#f8f9fd] px-5 pt-5 pb-8 shadow-sm ring-1 ring-slate-200/70"
      >
        <div className="flex items-end justify-between gap-3 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Jadwal angsuran</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Angsuran pertama dibayarkan setelah siswa menerima gaji pertama bekerja di negara
              tujuan.
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-600">
              Tanggal keberangkatan: {departureDateLabel}
            </p>
          </div>
          {plannedCount > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-slate-500">
              {paidCount}/{plannedCount} lunas
            </span>
          )}
        </div>
        {!['ACTIVE', 'COMPLETED'].includes(application.status) && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 text-xs text-blue-900">
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
            <div>
              <p className="font-semibold text-slate-900">Pembayaran Angsuran Belum Dibuka</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                Jadwal di bawah merupakan simulasi rencana pembiayaan. Pembayaran angsuran baru
                dapat dilakukan setelah naskah akad resmi diterbitkan oleh admin dan masa kerja Anda
                dimulai.
              </p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {closed ? (
            <p className="border-y border-slate-200 py-4 text-xs text-slate-500">
              Jadwal angsuran tidak berlaku untuk pengajuan yang ditutup.
            </p>
          ) : displayedSchedule.length > 0 ? (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {displayedSchedule.map((entry) => {
                const proof = pendingProofFor(entry.installment)
                const isNext = entry.installment === firstUnpaidInstallment
                const canPay = application.status === 'ACTIVE' && isNext && !entry.paid && !proof
                return (
                  <div
                    className="flex items-center justify-between gap-3 py-3"
                    key={entry.installment}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">
                        Angsuran {entry.installment}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">{formatDate(entry.dueDate)}</p>
                      {proof && (
                        <p className="mt-1 text-[10px] font-medium text-amber-700">
                          Bukti terkirim · menunggu verifikasi
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <strong className="text-xs text-slate-800">
                        {formatRupiah(entry.amount)}
                      </strong>
                      {entry.paid ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">
                          Lunas
                        </span>
                      ) : (
                        <button
                          className="rounded-full bg-[#0b57d0] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#0847ae] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                          disabled={!canPay}
                          onClick={() => openPayment(entry.installment, entry.amount)}
                          type="button"
                        >
                          {proof ? 'Diproses' : 'Bayar'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="border-y border-slate-200 py-4 text-xs text-slate-500">
              Jadwal angsuran belum dicantumkan dalam rincian akad.
            </p>
          )}

          <div
            aria-label={`Riwayat pembayaran ${programName}`}
            className="space-y-2 border-t border-slate-200 pt-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800">Riwayat pembayaran</h4>
              {onRefresh && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#0b57d0] transition hover:bg-blue-50 disabled:opacity-50"
                  disabled={refreshing}
                  onClick={onRefresh}
                  title="Segarkan data angsuran dan status bukti transfer"
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className={`size-3 ${refreshing ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  <span>{refreshing ? 'Memperbarui…' : 'Segarkan Status'}</span>
                </button>
              )}
            </div>
            {applicationPayments.length === 0 && paymentProofs.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">
                Belum ada pembayaran atau bukti transfer yang tercatat.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {applicationPayments.map((payment) => (
                  <div className="flex items-center justify-between gap-3 py-3" key={payment.id}>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {payment.installmentNumber
                          ? `Angsuran ${payment.installmentNumber}`
                          : payment.description || 'Pembayaran'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {formatDate(payment.paidAt ?? payment.createdAt?.slice(0, 10))}
                        {payment.paidMethod ? ` · ${payment.paidMethod}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-slate-800">
                        {formatRupiah(payment.amount)}
                      </p>
                      <span className="text-[10px] font-medium text-slate-500">
                        {payment.status === 'PAID'
                          ? 'Berhasil'
                          : payment.status === 'PENDING'
                            ? 'Menunggu pembayaran'
                            : payment.status === 'EXPIRED'
                              ? 'Kedaluwarsa'
                              : 'Gagal'}
                      </span>
                    </div>
                  </div>
                ))}
                {paymentProofs.map((proof) => (
                  <div className="flex items-center justify-between gap-3 py-3" key={proof.id}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">
                        Bukti transfer · Angsuran {proof.installmentNumber}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {formatDate(proof.submittedAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-slate-800">
                        {formatRupiah(proof.amount)}
                      </p>
                      <span
                        className={`text-[10px] font-medium ${proof.status === 'VERIFIED' ? 'text-emerald-700' : proof.status === 'REJECTED' ? 'text-rose-700' : 'text-amber-700'}`}
                      >
                        {proof.status === 'VERIFIED'
                          ? 'Terverifikasi'
                          : proof.status === 'REJECTED'
                            ? 'Perlu perbaikan'
                            : 'Menunggu verifikasi'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {popup && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !paymentSubmitted) setPopup(null)
          }}
        >
          <section
            aria-labelledby="installment-popup-title"
            aria-modal="true"
            className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0b57d0]">
                  {programName}
                </p>
                <h3
                  className="mt-1 text-base font-bold text-slate-900"
                  id="installment-popup-title"
                >
                  {popup === 'details'
                    ? 'Rincian pembiayaan'
                    : popup === 'program'
                      ? 'Tentang program ini'
                      : paymentSubmitted
                        ? 'Bukti angsuran berhasil dikirim'
                        : `Pembayaran angsuran ${selectedInstallment ?? ''}`}
                </h3>
              </div>
              <button
                aria-label="Tutup popup"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                onClick={() => setPopup(null)}
                type="button"
              >
                <Icon name="close" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              {popup === 'details' && (
                <>
                  {plan.pricingStatus !== 'VERIFIED' && plan.pricingStatus !== 'AGREED' ? (
                    <p className="rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                      Admin sedang menyusun dan memverifikasi rincian pembiayaan program ini.
                    </p>
                  ) : isFullCover ? (
                    <>
                      {fullCoverTotals ? (
                        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 px-4">
                          {fullCoverTotals.lines.map((line) => (
                            <div
                              className="flex justify-between gap-4 py-3 text-xs"
                              key={line.label}
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800">{line.label}</p>
                                {line.recipient && (
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    Penerima: {line.recipient}
                                  </p>
                                )}
                                {line.note && (
                                  <p className="mt-1 text-[10px] text-slate-500">{line.note}</p>
                                )}
                              </div>
                              <strong className="shrink-0 text-slate-800">
                                {formatRupiah(line.amount)}
                              </strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
                          Rincian Budgeting belum tersedia.
                        </p>
                      )}
                      <div className="space-y-3 rounded-2xl bg-blue-50 p-4 text-xs">
                        <MoneyRow label="Total Nafaqah" value={fullCoverTotals?.nafaqahTotal} />
                        <MoneyRow label="Ujrah Wakalah" value={fullCoverUjrah} />
                        <MoneyRow label="Total kewajiban akad" value={fullCoverObligation} />
                        <MoneyRow label="Ju’alah jika COE terbit" value={fullCoverJuala} />
                        <MoneyRow
                          label="Total kewajiban jika COE terbit"
                          value={fullCoverObligationWithCoe}
                          strong
                        />
                        <MoneyRow
                          label="Tenor angsuran"
                          value={fullCoverTenor ? `${fullCoverTenor} bulan` : 'Belum ditentukan'}
                        />
                        <MoneyRow
                          label="Angsuran per bulan jika COE terbit"
                          value={
                            fullCoverMonthlyInstallment
                              ? formatRupiah(fullCoverMonthlyInstallment)
                              : 'Belum dihitung'
                          }
                          strong
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2 rounded-2xl border border-slate-100 p-4">
                        {[
                          ['Nafaqah', plan.nafaqahTotal],
                          ['Ujrah', plan.ujrahTotal],
                          ['Uang saku (bila ada)', plan.qardhAmount],
                        ]
                          .filter(([, amount]) => Number(amount) > 0)
                          .map(([label, amount]) => (
                            <MoneyRow key={String(label)} label={String(label)} value={amount} />
                          ))}
                        {Number(plan.refundTotal) > 0 && (
                          <MoneyRow
                            label="Refund/potongan"
                            value={`−${formatRupiah(plan.refundTotal)}`}
                          />
                        )}
                        <MoneyRow label="Total kewajiban" value={departureTotal} strong />
                        <MoneyRow
                          label="Tenor angsuran"
                          value={
                            departureInstallmentCount
                              ? `${departureInstallmentCount} kali`
                              : 'Belum ditentukan'
                          }
                        />
                        {departureMonthlyInstallment > 0 && (
                          <MoneyRow
                            label="Angsuran per bulan"
                            value={formatRupiah(departureMonthlyInstallment)}
                            strong
                          />
                        )}
                      </div>
                      {nafaqahItems.length + ujrahItems.length > 0 && (
                        <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
                          {[
                            ['Nafaqah · biaya riil', nafaqahItems],
                            ['Ujrah · jasa', ujrahItems],
                          ].map(([title, items]) => (
                            <div key={title as string}>
                              <h4 className="text-xs font-bold text-slate-700">
                                {title as string}
                              </h4>
                              {(items as FinancingCostLine[]).map((line, index) => (
                                <div
                                  className="mt-2 flex justify-between gap-3 text-[11px]"
                                  key={`${line.label}-${index}`}
                                >
                                  <span className="text-slate-600">
                                    {line.label}
                                    {line.recipient ? ` · ${line.recipient}` : ''}
                                  </span>
                                  <strong className="shrink-0 text-slate-800">
                                    {formatRupiah(line.amount)}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {popup === 'payment' && paymentSubmitted && (
                <div className="flex min-h-64 flex-col items-center justify-center px-2 py-8 text-center">
                  <div className="mb-5 grid size-20 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                    <WhatsAppMark className="size-11" />
                  </div>
                  <h4 className="text-lg font-bold tracking-tight text-slate-900">
                    Selamat, bukti angsuran berhasil dikirim!
                  </h4>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                    Silahkan lapor ke admin melalui WhatsApp dan tunggu verifikasi, ya.
                  </p>
                  <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">
                      Angsuran {paymentSubmitted.installmentNumber}
                    </p>
                    <p className="mt-1">{formatRupiah(paymentSubmitted.amount)}</p>
                  </div>
                </div>
              )}

              {popup === 'payment' && !paymentSubmitted && (
                <form className="space-y-4" id="payment-proof-form" onSubmit={submitPaymentProof}>
                  <section className="space-y-3 rounded-2xl bg-blue-50 p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                        Transfer ke rekening
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {COMPANY_BANK_ACCOUNT.bankName}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-blue-100 pt-3">
                      <div>
                        <p className="text-[10px] text-slate-500">Nomor rekening</p>
                        <p className="font-mono text-sm font-bold tracking-wide text-slate-900">
                          {COMPANY_BANK_ACCOUNT.accountNumber}
                        </p>
                      </div>
                      <button
                        className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-bold text-[#0b57d0]"
                        onClick={() =>
                          void copyValue(COMPANY_BANK_ACCOUNT.accountNumber, 'account')
                        }
                        type="button"
                      >
                        {copiedItem === 'account' ? 'Tersalin' : 'Salin rekening'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-blue-100 pt-3">
                      <div>
                        <p className="text-[10px] text-slate-500">Atas nama</p>
                        <p className="text-xs font-semibold text-slate-900">
                          {COMPANY_BANK_ACCOUNT.accountHolder}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="space-y-2">
                    <label
                      className="block text-xs font-semibold text-slate-700"
                      htmlFor="payment-amount"
                    >
                      Nominal rupiah yang ditransfer
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#0b57d0] focus-within:ring-2 focus-within:ring-blue-100">
                      <span className="text-sm font-semibold text-slate-500">Rp</span>
                      <input
                        autoComplete="off"
                        className="payment-amount-input min-w-0 flex-1 border-0 bg-transparent py-3 text-sm font-bold text-slate-900 outline-none focus:ring-0"
                        id="payment-amount"
                        inputMode="numeric"
                        onChange={(event) =>
                          setPaymentAmount(event.target.value.replace(/\D/g, ''))
                        }
                        value={paymentAmount ? formatNumber(Number(paymentAmount)) : ''}
                      />
                      <button
                        className="shrink-0 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-bold text-[#0b57d0] transition hover:bg-blue-50"
                        onClick={() =>
                          void copyValue(formatRupiah(Number(paymentAmount)), 'amount')
                        }
                        type="button"
                      >
                        {copiedItem === 'amount' ? 'Tersalin' : 'Salin nominal'}
                      </button>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-500">
                      Transfer akan dialokasikan berurutan mulai dari angsuran {selectedInstallment}
                      ; kelebihannya mengurangi angsuran berikutnya.
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Sisa angsuran {selectedInstallment}:{' '}
                      {formatRupiah(
                        displayedSchedule.find((entry) => entry.installment === selectedInstallment)
                          ?.amount,
                      )}
                    </p>
                  </div>

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-700">Bukti transfer</h4>
                    <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
                      <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-3 py-4 text-center transition hover:border-blue-400 hover:bg-blue-50">
                        <span className="grid size-9 place-items-center rounded-xl bg-white text-[#0b57d0] shadow-sm">
                          <svg
                            aria-hidden="true"
                            className="size-5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4" />
                          </svg>
                        </span>
                        <span className="text-[11px] font-bold text-slate-800">
                          {paymentFile ? 'Ganti bukti' : 'Pilih bukti transfer'}
                        </span>
                        <span className="max-w-full truncate text-[9px] text-slate-500">
                          {paymentFile?.name ?? 'PDF, JPG, atau PNG · maks. 10 MB'}
                        </span>
                        <input
                          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          onChange={(event) => setPaymentFile(event.target.files?.[0] ?? null)}
                          required
                          type="file"
                        />
                      </label>

                      <div className="flex min-h-32 min-w-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {paymentPreviewUrl && paymentFile?.type.startsWith('image/') ? (
                          <img
                            alt="Pratinjau bukti transfer"
                            className="h-32 w-full object-contain"
                            src={paymentPreviewUrl}
                          />
                        ) : paymentPreviewUrl && paymentFile?.type === 'application/pdf' ? (
                          <iframe
                            className="h-32 w-full"
                            src={paymentPreviewUrl}
                            title="Pratinjau PDF bukti transfer"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 px-2 text-center text-slate-400">
                            <svg
                              aria-hidden="true"
                              className="size-6"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              viewBox="0 0 24 24"
                            >
                              <path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h4" />
                            </svg>
                            <span className="text-[9px] leading-4">
                              Pratinjau muncul setelah berkas dipilih
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                  {paymentError && (
                    <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700" role="alert">
                      {paymentError}
                    </p>
                  )}
                  <p className="text-[10px] leading-4 text-slate-500">
                    Bukti transfer disimpan secara privat dan menunggu verifikasi tim VentureGo.
                  </p>
                </form>
              )}

              {popup === 'program' && (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">
                    {isFullCover
                      ? 'Full Cover mendanai komponen persiapan, pelatihan, dan keberangkatan yang dirinci dalam Budgeting dan diverifikasi oleh admin.'
                      : 'Dana Keberangkatan membantu memenuhi kebutuhan pembiayaan LPK dan keberangkatan sesuai rincian akad yang disepakati.'}
                  </p>
                  <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-xs">
                    <MoneyRow
                      label="Program"
                      value={isFullCover ? 'Full Cover' : 'Dana Keberangkatan'}
                    />
                    <MoneyRow
                      label="Akad"
                      value={isFullCover ? 'Wakalah bil Ujrah dan Ju’alah' : 'Wakalah bil Ujrah'}
                    />
                    {isFullCover && (
                      <MoneyRow label="LPK mitra" value={application.lpkName || '—'} />
                    )}
                    <MoneyRow
                      label="Tujuan"
                      value={application.destination === 'TURKEY' ? 'Turki' : 'Jepang'}
                    />
                  </div>
                  <p className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] leading-5 text-blue-900">
                    Angsuran mulai dibayar setelah siswa bekerja dan menerima penghasilan di negara
                    tujuan. Jadwal tanggal menyesuaikan ketentuan akad.
                  </p>
                </div>
              )}
            </div>

            <footer className="border-t border-slate-100 px-5 py-3 text-right sm:px-6">
              {popup === 'payment' && paymentSubmitted ? (
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  href={whatsappReportUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <WhatsAppMark className="size-4" />
                  Lapor ke Admin
                </a>
              ) : popup === 'payment' ? (
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-full px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    onClick={() => setPopup(null)}
                    type="button"
                  >
                    Batal
                  </button>
                  <button
                    className="rounded-full bg-[#0b57d0] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#0847ae] disabled:cursor-wait disabled:opacity-60"
                    disabled={paymentSubmitting}
                    form="payment-proof-form"
                    type="submit"
                  >
                    {paymentSubmitting ? 'Mengirim bukti…' : 'Kirim bukti pembayaran'}
                  </button>
                </div>
              ) : (
                <button
                  className="rounded-full bg-[#0b57d0] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#0847ae]"
                  onClick={() => setPopup(null)}
                  type="button"
                >
                  Tutup
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  )
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: unknown
  strong?: boolean
}) {
  const display = typeof value === 'number' ? formatRupiah(value) : String(value ?? '—')
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? 'border-t border-blue-100 pt-2 text-slate-900' : 'text-slate-600'}`}
    >
      <span>{label}</span>
      <strong className="shrink-0 text-right">{display}</strong>
    </div>
  )
}

export default function InstallmentsPage() {
  const [applications, setApplications] = useState<UserApplication[]>([])
  const [payments, setPayments] = useState<UserPayment[]>([])
  const [paymentProofs, setPaymentProofs] = useState<UserPaymentProof[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadApplications = useCallback(async (idToken: string) => {
    const result = await getOwnedFinancingApplications(idToken)
    if (!result.ok) {
      setError(result.message)
      setApplications([])
      setPayments([])
      setPaymentProofs([])
      return
    }
    setError('')
    setApplications(result.applications)
    setPayments(result.payments)
    setPaymentProofs(result.paymentProofs)
  }, [])

  const handleRefresh = useCallback(async () => {
    const user = getFirebaseClientAuth().currentUser
    if (!user) return
    setRefreshing(true)
    try {
      const idToken = await user.getIdToken()
      await loadApplications(idToken)
    } finally {
      setRefreshing(false)
    }
  }, [loadApplications])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setApplications([])
          setPayments([])
          setPaymentProofs([])
          setError('Sesi akun tidak ditemukan. Silakan masuk kembali.')
          setLoading(false)
          return
        }
        try {
          const idToken = await user.getIdToken()
          if (active) await loadApplications(idToken)
        } catch {
          if (active) setError('Sesi tidak dapat diverifikasi. Silakan muat ulang halaman.')
        } finally {
          if (active) setLoading(false)
        }
      })
    } catch {
      setError('Rincian angsuran belum dapat dimuat. Silakan coba lagi.')
      setLoading(false)
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [loadApplications])

  const activeApplications = applications.filter((app) => app.status === 'ACTIVE')
  const visibleApplications = activeApplications.length > 0 ? activeApplications : applications

  return (
    <DashboardScaffold
      active="angsuran"
      showHeader={false}
      subtitle="Progres dan rincian program"
      title="Angsuran saya"
    >
      {loading && (
        <div aria-label="Memuat jadwal angsuran" className="-mx-5 -mt-5" role="status">
          <span className="sr-only">Memuat jadwal angsuran…</span>
          <section className="relative overflow-hidden bg-gradient-to-br from-[#0b57d0] via-[#1768de] to-[#3985ed] px-5 pt-5 pb-14 text-white sm:px-6 sm:pb-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full border border-white/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-2 -top-10 size-44 rounded-full border border-white/10"
            />
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex flex-col items-center gap-2">
                <SkeletonBlock className="h-6 w-44 bg-white/25 sm:h-7 sm:w-52" />
                <SkeletonBlock className="h-3.5 w-32 bg-white/20" />
                <div className="mt-2 flex h-9 w-52 items-center justify-center rounded-full bg-white/30 shadow-xs backdrop-blur-xs">
                  <div className="h-4 w-32 animate-pulse rounded bg-white/40" />
                </div>
                <SkeletonBlock className="mt-1 h-3 w-64 max-w-xs bg-white/20" />
              </div>

              <div className="flex flex-col items-center">
                <div className="relative grid size-52 shrink-0 place-items-center sm:size-60">
                  <svg
                    aria-hidden="true"
                    className="absolute inset-0 size-full animate-pulse"
                    viewBox="0 0 120 120"
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="35"
                      fill="currentColor"
                      className="text-white/[0.06]"
                    />
                    <path
                      d="M43.93 109.46 A52 52 0 1 1 76.07 109.46"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="butt"
                      strokeWidth="7"
                      className="text-white/25"
                    />
                  </svg>
                  <div className="-translate-y-1 flex flex-col items-center gap-2 text-center">
                    <div className="h-10 w-24 animate-pulse rounded-lg bg-white/25 sm:h-12 sm:w-28" />
                    <div className="h-3 w-16 animate-pulse rounded bg-white/20" />
                    <div className="h-2.5 w-12 animate-pulse rounded bg-white/20" />
                  </div>
                </div>
                <SkeletonBlock className="-mt-1 h-3.5 w-44 bg-white/25" />
                <SkeletonBlock className="mt-2 h-4 w-28 rounded-full bg-white/20" />
              </div>
            </div>
          </section>

          <section className="relative z-10 -mt-10 rounded-t-[1.5rem] bg-[#f8f9fd] px-5 pt-5 pb-8 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-end justify-between gap-3 pb-3">
              <div className="flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-3 w-4/5 max-w-sm" />
                <SkeletonBlock className="h-3 w-2/5 max-w-[200px]" />
              </div>
              <SkeletonBlock className="h-3 w-14 shrink-0" />
            </div>

            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="flex items-center justify-between gap-3 py-3" key={index}>
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3.5 w-24" />
                    <SkeletonBlock className="h-2.5 w-20" />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SkeletonBlock className="h-3.5 w-24" />
                    <SkeletonBlock className="h-7 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <SkeletonBlock className="h-3.5 w-36" />
                <SkeletonBlock className="h-6 w-24 rounded-full" />
              </div>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                <div className="flex items-center justify-between py-3">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="h-2.5 w-28" />
                  </div>
                  <SkeletonBlock className="h-3.5 w-20" />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && visibleApplications.length === 0 && (
        <p className="rounded-xl bg-white p-5 text-sm leading-6 text-slate-600">
          Belum ada rincian angsuran untuk pengajuan pada sesi ini.
        </p>
      )}
      {visibleApplications.map((application) => (
        <ApplicationTerms
          application={application}
          initialProofs={paymentProofs.filter((proof) => proof.applicationDocId === application.id)}
          key={application.id}
          onRefresh={handleRefresh}
          payments={payments}
          refreshing={refreshing}
        />
      ))}
    </DashboardScaffold>
  )
}
