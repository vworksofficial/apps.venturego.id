'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { getUserActivityFeed, type UserApplicationDetail } from '../../actions'
import {
  DashboardCard,
  DashboardIcon,
  DashboardScaffold,
  SkeletonBlock,
} from '../../_components/dashboard-ui'

const FLOW_STEPS = [
  {
    title: 'Kuasa diberikan',
    description: 'Anda memberi kuasa untuk mengurus kebutuhan yang disetujui dalam akad.',
  },
  {
    title: 'Rincian diverifikasi',
    description: 'Kebutuhan dan nilainya diperiksa sebelum rincian final disampaikan kepada Anda.',
  },
  {
    title: 'Dana disalurkan',
    description: 'Dana digunakan untuk kebutuhan dan penerima yang tercantum dalam akad.',
  },
  {
    title: 'Angsuran mengikuti akad',
    description: 'Jumlah dan jadwal pembayaran mengacu pada akad yang telah disepakati.',
  },
]

export default function AgreementInfoPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState<UserApplicationDetail[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')

  const application =
    applications.find((item) => item.id === selectedApplicationId) ?? applications[0] ?? null
  const isFullCover = application?.product === 'FULL_COVER'
  const isDeparture = application?.product === 'DEPARTURE_BRIDGING'

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setLoading(false)
          return
        }

        try {
          const feed = await getUserActivityFeed(await user.getIdToken())
          if (!active) return
          if (feed.ok) {
            setApplications(feed.applications)
            setSelectedApplicationId((current) =>
              feed.applications.some((item) => item.id === current)
                ? current
                : (feed.applications[0]?.id ?? ''),
            )
            setError('')
          } else {
            setError(feed.message)
          }
        } catch {
          if (active) setError('Informasi akad belum dapat dimuat. Silakan coba lagi.')
        } finally {
          if (active) setLoading(false)
        }
      })
    } catch {
      setError('Informasi akad belum dapat dimuat. Silakan coba lagi.')
      setLoading(false)
    }

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const programLabel = isFullCover
    ? 'Program Full Cover'
    : isDeparture
      ? 'Program Dana Keberangkatan'
      : 'Program pembiayaan Anda'

  const introduction = isFullCover
    ? 'Full Cover menggunakan Wakalah bil Ujrah dan Ju’alah. Rincian kebutuhan diverifikasi sebelum disampaikan untuk Anda tinjau dan sepakati. Ju’alah mengikuti syarat yang tercantum dalam akad, termasuk ketentuan penerbitan COE.'
    : isDeparture
      ? 'Dana Keberangkatan menggunakan Wakalah bil Ujrah. Rincian kebutuhan, termasuk uang saku bila disepakati, mengikuti hasil verifikasi dan ketentuan akad.'
      : 'Skema, komponen biaya, dan kewajiban mengikuti program yang Anda ajukan serta rincian dalam akad final.'

  const terms = [
    {
      name: 'Nafaqah',
      description:
        'Biaya kebutuhan yang disetujui, dengan rincian dan nilai yang dicantumkan dalam akad.',
    },
    {
      name: 'Ujrah Wakalah',
      description:
        'Imbalan jasa atas perwakilan VentureGo; nilai dan cara pembayarannya tertulis dalam akad.',
    },
    ...(isFullCover || !application
      ? [
          {
            name: 'Ju’alah',
            description:
              'Imbalan yang berlaku jika syarat pencapaian pada akad terpenuhi. Pada Full Cover, ketentuannya terkait penerbitan COE.',
          },
        ]
      : []),
    {
      name: 'Total kewajiban',
      description: isFullCover
        ? 'Nafaqah dan Ujrah Wakalah; Ju’alah ditambahkan ketika syaratnya terpenuhi. Nilai final mengacu pada akad.'
        : isDeparture
          ? 'Nafaqah—termasuk uang saku bila tercantum dalam rinciannya—dan Ujrah Wakalah, setelah penyesuaian yang tercantum dalam akad.'
          : 'Komponen dan nilai final bergantung pada program serta rincian yang disepakati dalam akad.',
    },
  ]

  return (
    <DashboardScaffold
      active="profil"
      backHref="/dashboard/profil"
      subtitle="Ringkasan skema pembiayaan Anda"
      title="Akad Wakalah bil Ujrah"
    >
      {!loading && applications.length > 1 && (
        <label className="block text-xs font-semibold text-slate-600">
          Pengajuan yang dipilih
          <select
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800"
            onChange={(event) => setSelectedApplicationId(event.target.value)}
            value={application?.id ?? ''}
          >
            {applications.map((item) => (
              <option key={item.id} value={item.id}>
                {item.applicationId} ·{' '}
                {item.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p
          className="border-l-2 border-red-400 bg-red-50 px-3 py-2.5 text-xs text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <DashboardCard className="p-4">
          <div aria-label="Memuat informasi akad" className="space-y-3" role="status">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-4/5" />
            <SkeletonBlock className="h-24 w-full" />
          </div>
        </DashboardCard>
      ) : (
        <>
          <DashboardCard className="brand-card p-4 text-white ring-0">
            <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">
              {programLabel}
            </span>
            <h2 className="mt-3 text-base font-bold leading-6">Cara kerja akad pembiayaan</h2>
            <p className="mt-1.5 text-xs leading-5 text-white/90">{introduction}</p>
          </DashboardCard>

          <DashboardCard className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Alur pembiayaan</h2>
            <ol className="mt-3 divide-y divide-slate-100">
              {FLOW_STEPS.map((step, index) => (
                <li
                  className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0"
                  key={step.title}
                >
                  <span className="grid size-7 place-items-center rounded-full bg-blue-50 text-xs font-bold text-[var(--primary)]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">{step.title}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </DashboardCard>

          <DashboardCard className="p-4">
            <h2 className="text-sm font-bold text-slate-900">Komponen dalam akad</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              {terms.map((term) => (
                <div className="py-3 first:pt-2 last:pb-2" key={term.name}>
                  <dt className="text-xs font-bold text-slate-800">{term.name}</dt>
                  <dd className="mt-0.5 text-xs leading-5 text-slate-500">{term.description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
              Angka simulasi bukan ketentuan final. Periksa nilai dan jadwal pada akad yang telah
              disepakati.
            </p>
          </DashboardCard>

          <nav aria-label="Akses terkait akad" className="space-y-2">
            <Link
              className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[var(--primary)] transition hover:bg-blue-100"
              href="/dashboard/profil/dokumen"
            >
              <span className="flex items-center gap-2.5">
                <DashboardIcon className="size-4" name="document" />
                {application?.agreementPdf ? 'Lihat PDF akad' : 'Dokumen akad'}
              </span>
              <DashboardIcon className="size-4" name="chevron" />
            </Link>
            <Link
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              href="/dashboard/simulasi"
            >
              <span>Simulasi pembiayaan</span>
              <DashboardIcon className="size-4" name="chevron" />
            </Link>
          </nav>
        </>
      )}
    </DashboardScaffold>
  )
}
