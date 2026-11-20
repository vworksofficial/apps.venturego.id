'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { SkeletonBlock } from './_components/dashboard-ui'
import { VaNumber } from './_components/va-number'
import { WalletCarousel } from './_components/wallet-carousel'
import { getWalletSummary, type VipSummary } from './vip/actions'
import {
  getDashboardSummary,
  getProgramStats,
  type DashboardApplication,
  type DashboardSummaryResult,
} from './actions'

const dashboardSummaryCache = new Map<string, Extract<DashboardSummaryResult, { ok: true }>>()

type IconName =
  | 'bell'
  | 'calendar'
  | 'chevron'
  | 'clock'
  | 'document'
  | 'eye'
  | 'eyeOff'
  | 'help'
  | 'history'
  | 'home'
  | 'plus'
  | 'profile'
  | 'receipt'
  | 'shield'
  | 'vip'
  | 'wallet'

function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    calendar: (
      <>
        <path d="M8 2v4M16 2v4M3 10h18" />
        <rect x="3" y="4" width="18" height="18" rx="3" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    document: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5M9 13h6M9 17h6" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.2-.9" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    plus: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v19l-3-2-4 2-4-2-3 2z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    vip: (
      <>
        <path d="m12 3 2.5 5.1 5.6.8-4.1 4 .97 5.6L12 15.9l-5 2.6.97-5.6-4.1-4 5.6-.8L12 3Z" />
        <path d="M7 21h10" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 5h14a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V5a3 3 0 0 1 3-3h12" />
        <path d="M15 11h7v5h-7a2.5 2.5 0 0 1 0-5Z" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  )
}

const formatRupiah = (value: number) => `Rp${value.toLocaleString('id-ID')}`

const formatDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Belum ditentukan'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Terkirim',
  ELIGIBILITY_REVIEW: 'Tinjauan kelayakan',
  DOCUMENT_REVIEW: 'Tinjauan berkas',
  REVISION_REQUIRED: 'Perlu revisi',
  COST_VERIFICATION: 'Verifikasi biaya',
  APPROVED: 'Disetujui',
  CONTRACT_PREPARATION: 'Persiapan akad',
  ACTIVE: 'AKTIF',
  COMPLETED: 'Selesai',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
}

const STAGE_BY_STATUS: Record<string, number> = {
  SUBMITTED: 1,
  ELIGIBILITY_REVIEW: 2,
  DOCUMENT_REVIEW: 3,
  REVISION_REQUIRED: 3,
  COST_VERIFICATION: 4,
  APPROVED: 4,
  CONTRACT_PREPARATION: 4,
  ACTIVE: 6,
  COMPLETED: 7,
}

const PRODUCT_LABELS: Record<DashboardApplication['product'], string> = {
  FULL_COVER: 'Full Cover',
  DEPARTURE_BRIDGING: 'Dana Keberangkatan',
}

const progressSteps = [
  { step: 1, label: 'Pengajuan', sub: 'Mengisi form pengajuan Vworks Students Venture' },
  { step: 2, label: 'Verifikasi & kelayakan', sub: 'Oleh tim Venturego & pihak LPK mitra' },
  { step: 3, label: 'Pengumpulan berkas online', sub: 'Scan dokumen persyaratan lengkap' },
  { step: 4, label: 'Akad pembiayaan', sub: 'Penandatanganan kontrak syariah' },
  { step: 5, label: 'Pencairan dana', sub: 'Dana dikirim langsung ke LPK' },
  { step: 6, label: 'Program angsuran', sub: 'Cicilan berjalan sesuai jadwal' },
  { step: 7, label: 'Pelunasan', sub: 'Program pembiayaan selesai' },
]

const quickActions = [
  { label: 'Bayar angsuran', icon: 'receipt' as const, href: '/dashboard/angsuran' },
  { label: 'Simulasi', icon: 'wallet' as const, href: '/dashboard/simulasi' },
  { label: 'Ajukan baru', icon: 'plus' as const, href: '/?step=1' },
  { label: 'Bantuan', icon: 'help' as const, href: '/dashboard/bantuan' },
  { label: 'VIP', icon: 'vip' as const, href: '/dashboard/vip' },
]

function SlideHeader({
  label,
  value,
  showBalance,
  onToggle,
  badge,
  badgeClassName,
  hiddenValue = 'Rp••••••••',
}: {
  label: string
  value: string
  hiddenValue?: string
  showBalance: boolean
  onToggle: () => void
  badge: string
  badgeClassName: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className="mt-2 flex items-center gap-2">
          <strong className="text-2xl font-bold tracking-[-0.03em] text-slate-950">
            {showBalance ? value : hiddenValue}
          </strong>
          <button
            aria-label={showBalance ? 'Sembunyikan nominal' : 'Tampilkan nominal'}
            className="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            onClick={onToggle}
            type="button"
          >
            <Icon name={showBalance ? 'eye' : 'eyeOff'} className="size-4" />
          </button>
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${badgeClassName}`}>
        {badge}
      </span>
    </div>
  )
}

function SlideSkeleton() {
  return (
    <div aria-label="Memuat saldo" className="space-y-5" role="status">
      <span className="sr-only">Memuat saldo…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-8 w-40" />
        </div>
        <SkeletonBlock className="h-7 w-24 rounded-full" />
      </div>
      <SkeletonBlock className="h-10 w-full" />
    </div>
  )
}

function VipSlide({
  vip,
  loading,
  showBalance,
  onToggle,
}: {
  vip: VipSummary | null
  loading: boolean
  showBalance: boolean
  onToggle: () => void
}) {
  if (loading) return <SlideSkeleton />
  const hide = (value: number) => (showBalance ? formatRupiah(value) : 'Rp•••••')
  return (
    <>
      <SlideHeader
        badge={vip ? 'VIP · Aktif' : 'Belum terdaftar'}
        badgeClassName={vip ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}
        label="Saldo Vworks Investment Partner"
        onToggle={onToggle}
        showBalance={showBalance}
        value={formatRupiah(vip?.principalBalance ?? 0)}
      />
      {vip ? (
        <div
          className="mt-5 grid gap-3 border-t border-slate-100 pt-4"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          <div>
            <span className="text-[11px] text-slate-400">Bagi hasil terakhir</span>
            <strong className="mt-1 block text-sm text-slate-800">
              {vip.lastProfitShare ? hide(vip.lastProfitShare.amount) : 'Belum ada'}
            </strong>
            {vip.lastProfitShare && (
              <span className="text-[10px] text-slate-400">
                {formatDate(vip.lastProfitShare.date)}
              </span>
            )}
          </div>
          <div className="border-l border-slate-100 pl-4">
            <span className="text-[11px] text-slate-400">Jadwal berikutnya</span>
            <strong className="mt-1 block text-sm text-slate-800">
              {formatDate(vip.nextProfitShareDate)}
            </strong>
            <Link className="text-[10px] font-semibold text-[var(--primary)]" href="/dashboard/vip">
              Lihat riwayat →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] leading-5 text-slate-500">
            Mitra VIP ikut mendanai program siswa VentureGo dan menerima bagi hasil sesuai akad
            setiap tanggal 15.
          </p>
          <Link
            className="mt-2 inline-block text-xs font-semibold text-[var(--primary)]"
            href="/dashboard/vip"
          >
            Pelajari VIP →
          </Link>
        </div>
      )}
    </>
  )
}

function PointsSlide({
  points,
  loading,
  showBalance,
  onToggle,
}: {
  points: number
  loading: boolean
  showBalance: boolean
  onToggle: () => void
}) {
  if (loading) return <SlideSkeleton />
  return (
    <>
      <SlideHeader
        badge="Terkumpul"
        badgeClassName="bg-blue-50 text-[var(--primary)]"
        hiddenValue="•••• poin"
        label="Poin VentureGo"
        onToggle={onToggle}
        showBalance={showBalance}
        value={`${points.toLocaleString('id-ID')} poin`}
      />
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-[11px] leading-5 text-slate-500">
          Poin terkumpul di akun Anda: {showBalance ? points.toLocaleString('id-ID') : '••••'} poin.
        </p>
        <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
          Penukaran hadiah segera hadir
        </span>
      </div>
    </>
  )
}

export default function DashboardPage() {
  const [showBalance, setShowBalance] = useState(true)
  const [showSubmissionNotice, setShowSubmissionNotice] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [application, setApplication] = useState<DashboardApplication | null>(null)
  const [canApply, setCanApply] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountPhotoUrl, setAccountPhotoUrl] = useState('')
  const [accountPhotoFailed, setAccountPhotoFailed] = useState(false)
  const [wallet, setWallet] = useState<{ vip: VipSummary | null; points: number } | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)
  const [showProgramInfo, setShowProgramInfo] = useState(false)
  const [programStats, setProgramStats] = useState<{
    product: DashboardApplication['product']
    applicants: number
    active: number
    completed: number
  } | null>(null)
  const [programStatsLoading, setProgramStatsLoading] = useState(false)
  const [programStatsError, setProgramStatsError] = useState('')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('applicationSubmitted') !== '1') return

    setShowSubmissionNotice(true)
    window.history.replaceState(window.history.state, '', '/dashboard')
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setApplication(null)
          setCanApply(false)
          setAccountName('')
          setAccountPhotoUrl('')
          setAccountPhotoFailed(false)
          setError('')
          setWallet(null)
          setLoading(false)
          setWalletLoading(false)
          return
        }
        setAccountName(user.displayName?.trim() ?? '')
        setAccountPhotoUrl(user.photoURL?.startsWith('https://') ? user.photoURL : '')
        setAccountPhotoFailed(false)
        const cachedSummary = dashboardSummaryCache.get(user.uid)
        if (cachedSummary) {
          setApplication(cachedSummary.application)
          setCanApply(cachedSummary.canApply)
          setError('')
          setLoading(false)
        }
        try {
          const idToken = await user.getIdToken()
          if (!active) return
          void getWalletSummary(idToken)
            .then((walletResult) => {
              if (active) setWallet(walletResult.ok ? walletResult : null)
            })
            .catch(() => undefined)
            .finally(() => {
              if (active) setWalletLoading(false)
            })
          const result = await getDashboardSummary(idToken)
          if (!active) return
          if (!result.ok) {
            setError(result.message)
            setApplication(null)
            setCanApply(false)
          } else {
            dashboardSummaryCache.set(user.uid, result)
            setError('')
            setApplication(result.application)
            setCanApply(result.canApply)
          }
        } catch {
          if (active) setError('Ringkasan tidak dapat dimuat. Silakan muat ulang halaman.')
        } finally {
          if (active) setLoading(false)
        }
      })
    } catch {
      setError('Ringkasan tidak dapat dimuat. Silakan muat ulang halaman.')
      setLoading(false)
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const schedule = application?.schedule ?? null
  const closed = ['REJECTED', 'CANCELLED'].includes(application?.status ?? '')
  const currentStep = application ? (STAGE_BY_STATUS[application.status] ?? 0) : 0
  const allDone = Boolean(application?.settled && !closed)
  const openProgramInfo = async () => {
    setShowProgramInfo(true)
    const product = application?.product
    if (!product || programStats?.product === product || programStatsLoading) return
    const user = getFirebaseClientAuth().currentUser
    if (!user) return
    setProgramStatsLoading(true)
    setProgramStatsError('')
    try {
      const result = await getProgramStats(await user.getIdToken(), product)
      if (result.ok) {
        setProgramStats({
          product,
          applicants: result.applicants,
          active: result.active,
          completed: result.completed,
        })
      } else {
        setProgramStatsError(result.message)
      }
    } catch {
      setProgramStatsError('Informasi jumlah peserta belum dapat dimuat.')
    } finally {
      setProgramStatsLoading(false)
    }
  }
  const programInfo =
    application?.product === 'DEPARTURE_BRIDGING'
      ? {
          title: 'VSV Dana Keberangkatan',
          description:
            'Program pembiayaan tahap akhir yang membantu memenuhi pembayaran LPK, pengurusan dokumen akhir, dan uang saku keberangkatan sesuai hasil verifikasi.',
          akadBody:
            'Akad Dana Keberangkatan menggunakan Wakalah bil Ujrah. Biaya riil kebutuhan keberangkatan dibayarkan VentureGo atas persetujuan Anda lalu disalurkan sesuai kebutuhan yang diverifikasi.',
          statsHeading: 'Perjalanan peserta Dana Keberangkatan',
        }
      : {
          title: 'VSV Full Cover',
          description:
            'Program pendampingan pembiayaan persiapan kerja ke Jepang yang membantu memenuhi kebutuhan pendidikan bahasa, pelatihan keterampilan, dokumen keberangkatan, dan uang saku sesuai hasil verifikasi.',
          akadBody:
            "Akad Full Cover menggunakan Wakalah bil Ujrah dan Ju'alah. Rincian kebutuhan serta nilai biaya disusun dan diverifikasi tim VentureGo sebelum disampaikan untuk ditinjau dan disepakati dalam akad.",
          statsHeading: 'Perjalanan peserta Full Cover',
        }
  const stats = programStats && programStats.product === application?.product ? programStats : null
  const isDepartureApplication = application?.product === 'DEPARTURE_BRIDGING'
  const isSubmittedDeparture = isDepartureApplication && application?.status === 'SUBMITTED'
  const primaryAmount = isSubmittedDeparture
    ? (application?.requestedFinancingAmount ?? application?.totalObligation ?? null)
    : (application?.totalObligation ??
      application?.requestedFinancingAmount ??
      application?.fullCoverInvoiceAmount ??
      null)
  const amountLabel =
    isSubmittedDeparture && application?.requestedFinancingAmount != null
      ? 'Paket yang diajukan'
      : application?.totalObligation !== null && application?.totalObligation !== undefined
        ? 'Total kewajiban akad'
        : application?.requestedFinancingAmount !== null &&
            application?.requestedFinancingAmount !== undefined
          ? 'Nominal diajukan'
          : application?.fullCoverInvoiceAmount !== null &&
              application?.fullCoverInvoiceAmount !== undefined
            ? 'Estimasi tagihan LPK'
            : 'Estimasi pembiayaan'
  const statusLabel = application
    ? application.settled && !closed
      ? 'Lunas'
      : (STATUS_LABELS[application.status] ?? application.status)
    : ''
  const greetingName = loading
    ? ''
    : application
      ? application.applicantName.split(' ')[0]
      : accountName || 'Pengguna'

  return (
    <main className="dashboard-app min-h-dvh bg-[var(--canvas)]">
      <section className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f8f9fd] shadow-[0_0_48px_rgba(15,23,42,0.08)]">
        <header className="rounded-b-[32px] brand-surface px-5 pb-24 pt-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 ring-1 ring-white/25">
                {accountPhotoUrl && !accountPhotoFailed ? (
                  <img
                    alt={`Foto profil ${greetingName}`}
                    className="size-full object-cover"
                    height={44}
                    onError={() => setAccountPhotoFailed(true)}
                    referrerPolicy="no-referrer"
                    src={accountPhotoUrl}
                    width={44}
                  />
                ) : (
                  <Icon name="profile" className="size-6" />
                )}
              </span>
              <div>
                <p className="text-xs text-blue-100">Selamat datang,</p>
                {loading ? (
                  <SkeletonBlock className="mt-2 h-4 w-32 bg-white/25" />
                ) : (
                  <h1 className="mt-0.5 text-base font-bold tracking-tight">{greetingName}</h1>
                )}
              </div>
            </div>
            <Link
              aria-label="Lihat notifikasi"
              className="relative grid size-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
              href="/dashboard/notifikasi"
            >
              <Icon name="bell" />
              {application && (
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-amber-300 ring-2 ring-[var(--primary)]" />
              )}
            </Link>
          </div>
        </header>

        <div className="-mt-16 flex flex-1 flex-col gap-6 px-5 pb-32">
          <WalletCarousel
            id="ringkasan"
            pages={[
              {
                key: 'angsuran',
                label: 'Ringkasan angsuran',
                content: (
                  <>
                    {showSubmissionNotice && (
                      <div
                        aria-live="polite"
                        className="mb-4 flex items-center gap-3 rounded-2xl bg-emerald-50 px-3.5 py-3 ring-1 ring-emerald-100"
                        role="status"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-emerald-700 shadow-sm">
                          ✓
                        </span>
                        <span className="flex-1 text-xs font-bold text-emerald-900">
                          Pengajuan berhasil diajukan
                        </span>
                        <button
                          aria-label="Tutup notifikasi pengajuan berhasil"
                          className="grid size-7 shrink-0 place-items-center rounded-full text-emerald-800 transition hover:bg-emerald-100"
                          onClick={() => setShowSubmissionNotice(false)}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {loading && (
                      <div
                        aria-label="Memuat ringkasan pengajuan"
                        className="space-y-5"
                        role="status"
                      >
                        <span className="sr-only">Memuat ringkasan pengajuan…</span>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <SkeletonBlock className="h-3 w-28" />
                            <SkeletonBlock className="h-8 w-40" />
                          </div>
                          <SkeletonBlock className="h-7 w-24 rounded-full" />
                        </div>
                        <SkeletonBlock className="h-2 w-full rounded-full" />
                        <div
                          className="mt-5 grid gap-3 border-t border-slate-100 pt-4"
                          style={{ gridTemplateColumns: application ? '1fr 3fr' : '2fr 3fr' }}
                        >
                          <SkeletonBlock className="h-10 w-full" />
                          <div className="border-l border-slate-100 pl-4">
                            <SkeletonBlock className="h-10 w-full" />
                          </div>
                        </div>
                      </div>
                    )}
                    {!loading && error && (
                      <p
                        className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                        role="alert"
                      >
                        {error}
                      </p>
                    )}
                    {!loading && !error && application && (
                      <>
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 via-white to-emerald-50/70 p-4 ring-1 ring-blue-100/80">
                          <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-blue-100/70 blur-2xl" />
                          <div className="relative z-10">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold tracking-[0.02em] text-slate-500">
                                  {amountLabel}
                                </p>
                                {primaryAmount !== null ? (
                                  <div className="mt-1.5 flex items-center gap-1">
                                    <strong className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-slate-950">
                                      {showBalance ? formatRupiah(primaryAmount) : 'Rp••••••••'}
                                    </strong>
                                    <button
                                      aria-label={
                                        showBalance ? 'Sembunyikan nominal' : 'Tampilkan nominal'
                                      }
                                      className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
                                      onClick={() => setShowBalance((current) => !current)}
                                      type="button"
                                    >
                                      <Icon
                                        name={showBalance ? 'eye' : 'eyeOff'}
                                        className="size-4"
                                      />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <strong className="mt-1.5 block text-xl font-extrabold leading-tight tracking-tight text-slate-900">
                                      Menunggu verifikasi
                                    </strong>
                                    <p className="mt-1.5 max-w-[240px] text-[11px] leading-4 text-slate-600">
                                      Nominal pembiayaan disusun setelah kebutuhan Anda
                                      diverifikasi.
                                    </p>
                                  </>
                                )}
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${
                                  application.status === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : application.status === 'COMPLETED'
                                      ? 'bg-slate-100 text-slate-700'
                                      : closed
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-[var(--primary)]'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-blue-100/80 pt-3 text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-700">
                                {PRODUCT_LABELS[application.product]}
                              </span>
                              <span className="truncate">{application.lpkName}</span>
                            </div>
                          </div>
                        </div>
                        {schedule && !isSubmittedDeparture ? (
                          <>
                            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-[var(--accent)]"
                                style={{
                                  width: `${Math.round((schedule.paidCount / schedule.total) * 100)}%`,
                                }}
                              />
                            </div>
                            <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                              <span>
                                {schedule.paidCount} dari {schedule.total} angsuran lunas
                              </span>
                              <span>
                                {application.totalObligation !== null
                                  ? `Terbayar ${formatRupiah(schedule.paidAmount)}`
                                  : `${PRODUCT_LABELS[application.product]}`}
                              </span>
                            </div>
                            <div
                              className="mt-5 grid gap-3 border-t border-slate-100 pt-4"
                              style={{ gridTemplateColumns: '1fr 3fr' }}
                            >
                              <div>
                                <span className="text-[11px] text-slate-400">Sisa angsuran</span>
                                <strong className="mt-1 block text-sm text-slate-800">
                                  {schedule.total - schedule.paidCount} kali
                                </strong>
                              </div>
                              <div className="border-l border-slate-100 pl-4">
                                <span className="text-[11px] text-slate-400">
                                  Jatuh tempo berikutnya
                                </span>
                                <div className="mt-1">
                                  <strong className="text-sm text-slate-800">
                                    {schedule.nextDueDate
                                      ? `${formatDate(schedule.nextDueDate)}${
                                          schedule.nextDueAmount !== null
                                            ? ` · ${formatRupiah(schedule.nextDueAmount)}`
                                            : ''
                                        }`
                                      : 'Seluruh angsuran telah lunas'}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="mt-5 border-t border-slate-100 pt-4">
                            <Link
                              className="group flex min-h-14 items-center justify-between gap-3 rounded-xl bg-blue-50 px-3.5 py-2.5 text-[var(--primary)] ring-1 ring-blue-100 transition hover:bg-blue-100"
                              href="/dashboard/unggah-berkas"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[var(--primary)] shadow-sm">
                                <Icon name="document" className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <strong className="block text-xs font-bold">
                                  {application.documentsRevision > 0
                                    ? 'Perbaiki berkas'
                                    : application.documentsUploaded < application.documentsTotal
                                      ? 'Unggah berkas'
                                      : 'Lihat status berkas'}
                                </strong>
                                <small className="mt-0.5 block text-[9px] leading-3 text-slate-500">
                                  Dokumen persyaratan pengajuan
                                </small>
                              </span>
                              <Icon
                                name="chevron"
                                className="size-4 shrink-0 transition group-hover:translate-x-0.5"
                              />
                            </Link>
                            {application.product === 'FULL_COVER' &&
                              application.fullCoverInvoiceAmount !== null &&
                              application.totalObligation === null && (
                                <p className="mt-2 text-[10px] leading-4 text-slate-500">
                                  Nilai di atas adalah estimasi tagihan LPK, bukan nominal
                                  pembiayaan final.
                                </p>
                              )}
                          </div>
                        )}
                        {application.documentsRevision > 0 && (
                          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                            {application.documentsRevision} dokumen memerlukan perbaikan. Silakan
                            periksa menu Unggah Berkas.
                          </p>
                        )}
                      </>
                    )}
                    {!loading && !error && !application && (
                      <>
                        <div className="mb-5 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 ring-1 ring-blue-100">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-bold tracking-[0.02em] text-slate-500">
                              Status pembiayaan
                            </p>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--primary)] ring-1 ring-blue-100">
                              Siap memulai
                            </span>
                          </div>
                          <h2 className="mt-2 text-lg font-extrabold tracking-tight text-slate-900">
                            Belum ada program berjalan
                          </h2>
                          <p className="mt-1 text-[11px] leading-4 text-slate-600">
                            Satu program dapat berjalan pada satu waktu. Setelah kewajiban lunas,
                            Anda bisa mengajukan program berikutnya.
                          </p>
                        </div>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-medium text-slate-500">
                              Total angsuran terbayar
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <strong className="text-2xl font-bold tracking-[-0.03em] text-slate-950">
                                {showBalance ? formatRupiah(0) : 'Rp••••••••'}
                              </strong>
                              <button
                                aria-label={
                                  showBalance ? 'Sembunyikan nominal' : 'Tampilkan nominal'
                                }
                                className="grid size-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                onClick={() => setShowBalance((current) => !current)}
                                type="button"
                              >
                                <Icon name={showBalance ? 'eye' : 'eyeOff'} className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full w-0 rounded-full bg-[var(--accent)]" />
                        </div>
                        <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                          <span>Belum ada pembayaran</span>
                          <span>Total kewajiban Rp0</span>
                        </div>
                        <div
                          className="mt-5 grid gap-3 border-t border-slate-100 pt-4"
                          style={{ gridTemplateColumns: '2fr 3fr' }}
                        >
                          <div>
                            <span className="text-[11px] text-slate-400">Tenor</span>
                            <strong className="mt-1 block text-sm text-slate-800">0 bulan</strong>
                          </div>
                          <div className="border-l border-slate-100 pl-4">
                            <VaNumber />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ),
              },
              {
                key: 'vip',
                label: 'Saldo Vworks Investment Partner',
                content: (
                  <VipSlide
                    loading={walletLoading}
                    onToggle={() => setShowBalance((current) => !current)}
                    showBalance={showBalance}
                    vip={wallet?.vip ?? null}
                  />
                ),
              },
              {
                key: 'poin',
                label: 'Poin VentureGo',
                content: (
                  <PointsSlide
                    loading={walletLoading}
                    onToggle={() => setShowBalance((current) => !current)}
                    points={wallet?.points ?? 0}
                    showBalance={showBalance}
                  />
                ),
              },
            ]}
          />

          {!loading && !error && application && !canApply && (
            <section className="relative overflow-hidden rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white via-white to-blue-50/70 p-5 text-center shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-blue-100/60 blur-2xl" />
              <div className="relative z-10">
                <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-[var(--primary)]">
                  <span className="size-1.5 rounded-full bg-blue-500" />
                  {closed
                    ? application.status === 'COMPLETED'
                      ? 'Program Selesai'
                      : 'Pengajuan Ditutup'
                    : application.status === 'ACTIVE'
                      ? 'Program Sedang Dijalani'
                      : 'Pengajuan Telah Terkirim'}
                </p>
                <div className="mt-3 flex justify-center">
                  <button
                    className="inline-flex items-center gap-1 rounded-xl border border-blue-100 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    onClick={openProgramInfo}
                    type="button"
                  >
                    Program {PRODUCT_LABELS[application.product]}
                    <Icon name="chevron" className="size-2.5 -rotate-90 text-blue-600" />
                  </button>
                </div>
                <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-slate-600">
                  {closed
                    ? application.status === 'COMPLETED'
                      ? 'Seluruh tahapan program pembiayaan Anda telah selesai.'
                      : 'Pengajuan ini telah ditutup. Hubungi tim VentureGo untuk informasi lebih lanjut.'
                    : application.status === 'SUBMITTED'
                      ? 'Rincian biaya sedang disusun dan diverifikasi tim VentureGo.'
                      : schedule
                        ? 'Pantau progres angsuran dan jatuh tempo pada kartu ringkasan di atas.'
                        : 'Pengajuan Anda sedang ditinjau oleh tim VentureGo.'}
                </p>
              </div>
            </section>
          )}
          {showProgramInfo && application && (
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5"
              onClick={(event) => {
                if (event.target === event.currentTarget) setShowProgramInfo(false)
              }}
            >
              <section
                aria-labelledby="program-info-title"
                aria-modal="true"
                className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
                role="dialog"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      Program pembiayaan
                    </p>
                    <h2
                      className="mt-1 text-lg font-bold tracking-tight text-slate-900"
                      id="program-info-title"
                    >
                      {programInfo.title}
                    </h2>
                  </div>
                  <button
                    aria-label="Tutup informasi program"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                    onClick={() => setShowProgramInfo(false)}
                    type="button"
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      ×
                    </span>
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{programInfo.description}</p>
                <div className="mt-4 rounded-2xl bg-emerald-50/80 p-4">
                  <h3 className="text-xs font-bold text-slate-900">Bagaimana akadnya?</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">{programInfo.akadBody}</p>
                </div>
                <div className="mt-4">
                  <h3 className="text-xs font-bold text-slate-900">{programInfo.statsHeading}</h3>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Sedang mengajukan', value: stats?.applicants },
                      { label: 'Sedang menjalani', value: stats?.active },
                      { label: 'Telah lulus', value: stats?.completed },
                    ].map((stat) => (
                      <div className="rounded-2xl bg-slate-50 p-3 text-center" key={stat.label}>
                        <p className="text-lg font-bold text-slate-900">
                          {programStatsLoading ? '…' : (stat.value ?? '—')}
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-slate-400">
                    {programStatsError ||
                      'Jumlah orang unik berdasarkan status program di sistem VentureGo.'}
                  </p>
                </div>
              </section>
            </div>
          )}
          {!loading && !error && canApply && (
            <section className="relative overflow-hidden rounded-3xl brand-card p-5 text-white shadow-sm">
              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-white">
                    {!application
                      ? 'Ajukan Pembiayaan Baru'
                      : closed
                        ? 'Mulai pengajuan baru'
                        : 'Program sebelumnya telah lunas'}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100">
                    {!application
                      ? 'Mulai pengajuan Full Cover atau Dana Keberangkatan dengan skema syariah.'
                      : closed
                        ? 'Pengajuan sebelumnya tidak memiliki kewajiban berjalan. Anda dapat memulai pengajuan kembali.'
                        : 'Kewajiban sebelumnya telah selesai. Anda dapat memulai pengajuan program berikutnya.'}
                  </p>
                </div>
                <Link
                  aria-label={application ? 'Ajukan pembiayaan baru' : 'Mulai pengajuan pembiayaan'}
                  className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 shadow-sm transition hover:bg-amber-300 active:scale-95"
                  href="/?step=1"
                  title={application ? 'Ajukan pembiayaan baru' : 'Mulai pengajuan pembiayaan'}
                >
                  <svg
                    aria-hidden="true"
                    className="size-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </Link>
              </div>
              <div className="pointer-events-none absolute -bottom-8 -right-8 size-32 rounded-full bg-white/10 blur-xl" />
            </section>
          )}

          <section aria-labelledby="quick-actions-title">
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-base font-bold tracking-tight text-slate-900"
                id="quick-actions-title"
              >
                Layanan cepat
              </h2>
              <Link className="text-xs font-medium text-[var(--primary)]" href="/dashboard/layanan">
                Semua layanan
              </Link>
            </div>
            <div className={`grid ${canApply ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
              {loading
                ? Array.from({ length: canApply ? 5 : 4 }, (_, index) => (
                    <div
                      aria-hidden="true"
                      className="flex min-w-0 flex-col items-center gap-2"
                      key={index}
                    >
                      <SkeletonBlock className="size-13 rounded-2xl" />
                      <SkeletonBlock className="h-2.5 w-12" />
                    </div>
                  ))
                : quickActions
                    .filter((action) => canApply || action.label !== 'Ajukan baru')
                    .map((action) => (
                      <Link
                        className="group flex min-w-0 flex-col items-center gap-2 text-center"
                        href={action.href}
                        key={action.label}
                      >
                        <span className="grid size-13 place-items-center rounded-2xl bg-white text-[var(--primary)] shadow-sm ring-1 ring-slate-100 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                          <Icon name={action.icon} className="size-5" />
                        </span>
                        <span className="text-[10px] font-semibold leading-4 text-slate-600">
                          {action.label}
                        </span>
                      </Link>
                    ))}
            </div>
          </section>

          <section aria-labelledby="progress-title" id="progress">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight text-slate-900" id="progress-title">
                Alur progress saat ini
              </h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                {loading ? (
                  <span
                    aria-hidden="true"
                    className="block h-3 w-16 animate-pulse rounded-full bg-blue-200"
                  />
                ) : application ? (
                  allDone ? (
                    'Selesai 7/7'
                  ) : currentStep > 0 ? (
                    `Tahap ${currentStep}/7`
                  ) : (
                    'Tidak aktif'
                  )
                ) : (
                  'Belum memulai'
                )}
              </span>
            </div>
            {closed && application && (
              <p className="mb-3 rounded-xl bg-red-50 p-3 text-[11px] leading-5 text-red-700">
                Pengajuan ini {application.status === 'REJECTED' ? 'ditolak' : 'dibatalkan'} dan
                tidak berlanjut ke tahap berikutnya.
              </p>
            )}
            <div className="overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              {loading ? (
                <div aria-label="Memuat alur pengajuan" className="space-y-5" role="status">
                  <span className="sr-only">Memuat alur pengajuan…</span>
                  <ol className="relative space-y-0">
                    {progressSteps.map((item, index) => (
                      <li className="flex gap-4" key={item.step}>
                        <div className="flex flex-col items-center">
                          <SkeletonBlock className="size-8 shrink-0 rounded-full" />
                          {index < progressSteps.length - 1 && (
                            <SkeletonBlock className="mt-1 min-h-7 w-0.5 flex-1 rounded-full" />
                          )}
                        </div>
                        <div
                          className={index < progressSteps.length - 1 ? 'flex-1 pb-5' : 'flex-1'}
                        >
                          <SkeletonBlock className="h-3 w-2/5" />
                          <SkeletonBlock className="mt-1.5 h-2.5 w-4/5" />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <ol className="relative space-y-0">
                  {progressSteps.map((item, idx, arr) => {
                    const done = Boolean(application) && (allDone || item.step < currentStep)
                    const active =
                      Boolean(application) && !allDone && item.step === currentStep && !closed
                    return (
                      <li key={item.step} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span
                            className={[
                              'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-2',
                              done
                                ? 'bg-[var(--primary)] text-white ring-[var(--primary)]'
                                : active
                                  ? 'bg-white text-[var(--primary)] ring-[var(--primary)]'
                                  : 'bg-slate-100 text-slate-400 ring-slate-200',
                            ].join(' ')}
                          >
                            {done ? (
                              <svg
                                className="size-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            ) : (
                              item.step
                            )}
                          </span>
                          {idx < arr.length - 1 && (
                            <span
                              className={[
                                'mt-1 w-0.5 flex-1 rounded-full',
                                done ? 'bg-[var(--primary)]' : 'bg-slate-200',
                              ].join(' ')}
                              style={{ minHeight: '28px' }}
                            />
                          )}
                        </div>
                        <div className={['pb-5', idx === arr.length - 1 ? 'pb-0' : ''].join(' ')}>
                          <p
                            className={[
                              'text-sm font-bold leading-tight',
                              active
                                ? 'text-[var(--primary)]'
                                : done
                                  ? 'text-slate-800'
                                  : 'text-slate-400',
                            ].join(' ')}
                          >
                            {item.label}
                            {active && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                                SEKARANG
                              </span>
                            )}
                          </p>
                          <p
                            className={[
                              'mt-0.5 text-[11px]',
                              done || active ? 'text-slate-400' : 'text-slate-300',
                            ].join(' ')}
                          >
                            {item.sub}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </section>

          <aside className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4" id="bantuan">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--primary)]">
              <Icon name="help" className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Butuh bantuan?</h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Tim VSV siap membantu pertanyaan pembiayaan dan angsuran Anda.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
