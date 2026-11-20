'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import {
  getDashboardSummary,
  getProgramStats,
  type DashboardApplication,
  type ProgramStatsResult,
} from '../actions'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import {
  DashboardCard,
  DashboardIcon,
  type DashboardIconName,
  DashboardScaffold,
} from '../_components/dashboard-ui'

type Product = DashboardApplication['product']
type ProgramInfo = {
  product: Product
  title: string
  detail: string
  description: string
  akad: string
  statsHeading: string
  icon: DashboardIconName
}

const programs: ProgramInfo[] = [
  {
    product: 'FULL_COVER',
    title: 'Program Full Cover',
    detail: 'Persiapan lengkap hingga kebutuhan keberangkatan',
    description:
      'Program pembiayaan persiapan kerja ke Jepang yang membantu memenuhi kebutuhan pendidikan bahasa, pelatihan keterampilan, dokumen keberangkatan, dan uang saku sesuai hasil verifikasi.',
    akad: "Akad Full Cover menggunakan Wakalah bil Ujrah dan Ju'alah. Rincian kebutuhan serta nilai biaya disusun dan diverifikasi tim VentureGo sebelum disampaikan untuk ditinjau dan disepakati dalam akad.",
    statsHeading: 'Perjalanan peserta Full Cover',
    icon: 'star',
  },
  {
    product: 'DEPARTURE_BRIDGING',
    title: 'Program Dana Keberangkatan',
    detail: 'Pembiayaan tahap akhir persiapan keberangkatan',
    description:
      'Program pembiayaan tahap akhir yang membantu memenuhi pembayaran LPK, pengurusan dokumen akhir, dan uang saku keberangkatan sesuai hasil verifikasi.',
    akad: 'Akad Dana Keberangkatan menggunakan Wakalah bil Ujrah. Biaya riil kebutuhan keberangkatan dibayarkan VentureGo atas persetujuan Anda lalu disalurkan sesuai kebutuhan yang diverifikasi.',
    statsHeading: 'Perjalanan peserta Dana Keberangkatan',
    icon: 'wallet',
  },
]

const services: {
  href: string
  icon: DashboardIconName
  title: string
  detail: string
}[] = [
  {
    href: '/dashboard/angsuran',
    icon: 'receipt',
    title: 'Bayar angsuran',
    detail: 'Selesaikan tagihan berikutnya',
  },
  {
    href: '/dashboard/simulasi',
    icon: 'calculator',
    title: 'Simulasi pembiayaan',
    detail: 'Hitung estimasi kewajiban',
  },
  {
    href: '/dashboard/dokumen',
    icon: 'document',
    title: 'Dokumen',
    detail: 'Lihat akad dan bukti bayar',
  },
  {
    href: '/dashboard/riwayat',
    icon: 'history',
    title: 'Riwayat transaksi',
    detail: 'Pantau seluruh aktivitas',
  },
  {
    href: '/dashboard/bantuan',
    icon: 'help',
    title: 'Pusat bantuan',
    detail: 'Hubungi layanan VSV',
  },
]

export default function ServicesContent() {
  const router = useRouter()
  const [selected, setSelected] = useState<ProgramInfo | null>(null)
  const [applicationState, setApplicationState] = useState<'loading' | 'none' | 'exists' | 'error'>(
    'loading',
  )
  const [showApplicationNotice, setShowApplicationNotice] = useState(false)
  const [programStats, setProgramStats] = useState<{
    product: Product
    applicants: number
    active: number
    completed: number
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setApplicationState('none')
          return
        }
        try {
          const result = await getDashboardSummary(await user.getIdToken())
          if (active) {
            setApplicationState(result.ok ? (result.application ? 'exists' : 'none') : 'error')
          }
        } catch {
          if (active) setApplicationState('error')
        }
      })
    } catch {
      setApplicationState('error')
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const openProgram = async (program: ProgramInfo) => {
    setSelected(program)
    setShowApplicationNotice(false)
    setStatsError('')
    if (programStats?.product === program.product || statsLoading) return
    const user = getFirebaseClientAuth().currentUser
    if (!user) return
    setStatsLoading(true)
    try {
      const result: ProgramStatsResult = await getProgramStats(
        await user.getIdToken(),
        program.product,
      )
      if (result.ok) setProgramStats({ product: program.product, ...result })
      else setStatsError(result.message)
    } catch {
      setStatsError('Informasi jumlah peserta belum dapat dimuat.')
    } finally {
      setStatsLoading(false)
    }
  }

  const submitAction = () => {
    if (applicationState === 'exists') {
      setShowApplicationNotice(true)
      return
    }
    if (applicationState === 'none' && selected) {
      router.push(`/?step=1&product=${selected.product}`)
      return
    }
    setShowApplicationNotice(true)
  }

  const stats = selected && programStats?.product === selected.product ? programStats : null

  return (
    <DashboardScaffold active="home" subtitle="Akses semua fitur VSV" title="Semua layanan">
      <section aria-labelledby="main-student-services" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900" id="main-student-services">
            Layanan Utama Siswa
          </h2>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Pelajari program pembiayaan yang sesuai dengan tahap persiapan Anda.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {programs.map((program) => (
            <button
              aria-haspopup="dialog"
              className="group flex w-full items-center gap-3 rounded-3xl border border-blue-100/80 bg-gradient-to-br from-white via-white to-blue-50/70 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              key={program.product}
              onClick={() => void openProgram(program)}
              type="button"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--primary)]">
                <DashboardIcon name={program.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-bold text-slate-900">{program.title}</strong>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">
                  {program.detail}
                </span>
              </span>
              <DashboardIcon
                className="size-4 shrink-0 text-blue-600 transition group-hover:translate-x-0.5"
                name="chevron"
              />
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="investor-services" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900" id="investor-services">
          Layanan Investor
        </h2>
        <DashboardCard className="flex items-center gap-3 border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <DashboardIcon name="star" />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-bold text-slate-900">
              Venturego Investment Partners (VIP)
            </strong>
            <span className="mt-1 block text-[10px] leading-4 text-slate-500">
              Fitur ini masih dalam pengembangan.
            </span>
          </span>
        </DashboardCard>
      </section>

      <section aria-labelledby="other-services" className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900" id="other-services">
          Fitur Lainnya
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {services.map((service) => (
            <Link href={service.href} key={service.title}>
              <DashboardCard className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-[var(--primary)]">
                  <DashboardIcon name={service.icon} />
                </span>
                <h3 className="mt-4 text-sm font-bold text-slate-800">{service.title}</h3>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">{service.detail}</p>
              </DashboardCard>
            </Link>
          ))}
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null)
          }}
        >
          <section
            aria-labelledby="service-program-title"
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
                  id="service-program-title"
                >
                  {selected.title}
                </h2>
              </div>
              <button
                aria-label="Tutup informasi program"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                onClick={() => setSelected(null)}
                type="button"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{selected.description}</p>
            <div className="mt-4 rounded-2xl bg-emerald-50/80 p-4">
              <h3 className="text-xs font-bold text-slate-900">Bagaimana akadnya?</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">{selected.akad}</p>
            </div>
            <div className="mt-4">
              <h3 className="text-xs font-bold text-slate-900">{selected.statsHeading}</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { label: 'Sedang mengajukan', value: stats?.applicants },
                  { label: 'Sedang menjalani', value: stats?.active },
                  { label: 'Telah lulus', value: stats?.completed },
                ].map((stat) => (
                  <div className="rounded-2xl bg-slate-50 p-3 text-center" key={stat.label}>
                    <p className="text-lg font-bold text-slate-900">
                      {statsLoading ? '…' : (stat.value ?? '—')}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{stat.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-400">
                {statsError || 'Jumlah orang unik berdasarkan status program di sistem VentureGo.'}
              </p>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <button
                className="w-full rounded-2xl brand-fill px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                onClick={submitAction}
                type="button"
              >
                Ajukan
              </button>
              {showApplicationNotice && (
                <p
                  aria-live="polite"
                  className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 ring-1 ring-amber-200"
                  role="status"
                >
                  {applicationState === 'error'
                    ? 'Status pengajuan belum dapat diperiksa. Silakan muat ulang halaman lalu coba lagi.'
                    : applicationState === 'loading'
                      ? 'Status pengajuan sedang diperiksa. Silakan tekan Ajukan kembali sebentar lagi.'
                      : 'Anda belum dapat mengajukan karena masih memiliki pengajuan. Silakan hubungi admin bila ingin mengajukan ulang.'}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardScaffold>
  )
}
