'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { formatRupiah } from '@/lib/financing-plan'
import { getUserActivityFeed, type UserApplicationDetail, type UserPaymentItem } from '../actions'
import {
  DashboardCardSkeleton,
  DashboardIcon,
  DashboardScaffold,
} from '../_components/dashboard-ui'

type FilterCategory = 'Semua' | 'Program' | 'Pembayaran' | 'Dokumen'
type ActivityItem = {
  id: string
  category: Exclude<FilterCategory, 'Semua'>
  icon: 'receipt' | 'wallet' | 'document' | 'check' | 'info'
  tone: 'emerald' | 'indigo' | 'amber'
  title: string
  description: string
  status: string
  amount?: number
  timestamp: string
}
type ActivityGroup = { key: string; label: string; items: ActivityItem[] }

const formatDate = (iso: string | null) => {
  if (!iso) return 'Tanggal tidak tersedia'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      })
}

const formatTime = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      })
}

const getDayKey = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(date)
}

const PAYMENT_STATUS_LABELS: Record<UserPaymentItem['status'], string> = {
  PAID: 'Lunas',
  PENDING: 'Menunggu pembayaran',
  EXPIRED: 'Kedaluwarsa',
  FAILED: 'Gagal',
}

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Terkirim',
  ELIGIBILITY_REVIEW: 'Ditinjau',
  DOCUMENT_REVIEW: 'Pemeriksaan berkas',
  REVISION_REQUIRED: 'Perlu perbaikan',
  APPROVED: 'Disetujui',
  ACTIVE: 'Berjalan',
  COMPLETED: 'Selesai',
  REJECTED: 'Tidak disetujui',
  CANCELLED: 'Dibatalkan',
}

const DOC_STATUS_LABELS: Record<UserApplicationDetail['documents'][number]['status'], string> = {
  NOT_UPLOADED: 'Belum diunggah',
  UPLOADED: 'Sudah diunggah',
  VERIFIED: 'Terverifikasi',
  REVISION_REQUIRED: 'Perlu perbaikan',
}

const toneClass: Record<ActivityItem['tone'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  indigo: 'bg-blue-50 text-[var(--primary)] ring-blue-100',
}

const statusClass = (item: ActivityItem) =>
  item.tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : item.tone === 'amber'
      ? 'bg-amber-50 text-amber-800'
      : 'bg-slate-100 text-slate-600'

export default function ActivityPage() {
  const [filter, setFilter] = useState<FilterCategory>('Semua')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState<UserApplicationDetail[]>([])
  const [payments, setPayments] = useState<UserPaymentItem[]>([])
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    setLoading(true)
    setError('')

    const load = async (user: User) => {
      try {
        const token = await user.getIdToken()
        if (!active) return
        const result = await getUserActivityFeed(token)
        if (!active) return
        if (!result.ok) {
          setError(result.message)
          return
        }
        setApplications(result.applications)
        setPayments(result.payments)
      } catch {
        if (active) setError('Aktivitas belum dapat dimuat. Silakan coba lagi.')
      } finally {
        if (active) setLoading(false)
      }
    }

    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), (user) => {
        if (!active) return
        if (!user) {
          setApplications([])
          setPayments([])
          setError('Sesi telah berakhir. Silakan masuk kembali.')
          setLoading(false)
          return
        }
        void load(user)
      })
    } catch {
      setError('Aktivitas belum dapat dimuat. Silakan coba lagi.')
      setLoading(false)
    }

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [retryKey])

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []

    for (const app of applications) {
      items.push({
        id: `app-${app.id}`,
        category: 'Program',
        icon: 'wallet',
        tone: app.status === 'COMPLETED' ? 'emerald' : 'indigo',
        title: `Pengajuan Program ${app.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}`,
        description: `${app.applicationId} · ${app.lpkName}`,
        status: APPLICATION_STATUS_LABELS[app.status] ?? 'Dalam proses',
        timestamp: app.createdAt ?? '',
      })

      for (const [index, doc] of app.documents.entries()) {
        if (doc.status === 'NOT_UPLOADED') continue
        const isVerified = doc.status === 'VERIFIED'
        const needsRevision = doc.status === 'REVISION_REQUIRED'
        items.push({
          id: `doc-${app.id}-${index}`,
          category: 'Dokumen',
          icon: needsRevision ? 'info' : isVerified ? 'check' : 'document',
          tone: isVerified ? 'emerald' : needsRevision ? 'amber' : 'indigo',
          title: doc.documentType,
          description: `${app.applicationId} · ${doc.fileName ?? 'Berkas pengajuan'}`,
          status: DOC_STATUS_LABELS[doc.status],
          // Embedded document entries do not store individual timestamps yet.
          timestamp: app.updatedAt ?? app.createdAt ?? '',
        })
      }
    }

    for (const payment of payments) {
      items.push({
        id: `pay-${payment.id}`,
        category: 'Pembayaran',
        icon: 'receipt',
        tone:
          payment.status === 'PAID' ? 'emerald' : payment.status === 'PENDING' ? 'amber' : 'indigo',
        title:
          payment.description ||
          (payment.type === 'CUSTOM'
            ? 'Pembayaran sukarela'
            : `Pembayaran angsuran ke-${payment.installmentNumber ?? '—'}`),
        description: `${payment.applicationId}${payment.paidMethod ? ` · ${payment.paidMethod}` : ''}`,
        status: PAYMENT_STATUS_LABELS[payment.status],
        amount: payment.amount,
        timestamp: payment.paidAt ?? payment.createdAt ?? '',
      })
    }

    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [applications, payments])

  const filteredActivities = useMemo(
    () => (filter === 'Semua' ? activities : activities.filter((item) => item.category === filter)),
    [activities, filter],
  )

  const groups = useMemo<ActivityGroup[]>(() => {
    const today = getDayKey(new Date().toISOString())
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = getDayKey(yesterdayDate.toISOString())
    const grouped = new Map<string, ActivityGroup>()

    for (const item of filteredActivities) {
      const key = item.timestamp ? getDayKey(item.timestamp) : 'unknown'
      const label =
        key === today
          ? 'Hari ini'
          : key === yesterday
            ? 'Kemarin'
            : key === 'unknown'
              ? 'Tanggal tidak tersedia'
              : formatDate(item.timestamp)
      const group = grouped.get(key) ?? { key, label, items: [] }
      group.items.push(item)
      grouped.set(key, group)
    }

    return [...grouped.values()]
  }, [filteredActivities])

  return (
    <DashboardScaffold active="riwayat" showHeader={false} title="Aktivitas">
      <header className="space-y-1 pt-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-950">Aktivitas</h1>
        <p className="text-xs leading-5 text-slate-500">
          Catatan program, pembayaran, dan berkas akun Anda.
        </p>
      </header>

      <div
        aria-label="Filter aktivitas"
        className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1"
        role="group"
      >
        {(['Semua', 'Program', 'Pembayaran', 'Dokumen'] as const).map((item) => (
          <button
            aria-pressed={filter === item}
            className={`min-h-9 rounded-xl px-1.5 text-[11px] font-semibold transition ${
              filter === item
                ? 'bg-white text-[var(--primary)] shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            key={item}
            onClick={() => setFilter(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">
          {filter === 'Semua' ? 'Semua catatan' : filter}
        </h2>
        <span className="text-[11px] text-slate-400">
          {loading ? 'Memuat…' : `${filteredActivities.length} aktivitas`}
        </span>
      </div>

      {loading && <DashboardCardSkeleton rows={5} />}

      {!loading && error && (
        <section
          aria-live="polite"
          className="rounded-3xl border border-amber-100 bg-white p-5 text-center shadow-sm"
          role="alert"
        >
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <DashboardIcon name="info" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-800">Aktivitas belum tersedia</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{error}</p>
          <button
            className="mt-4 rounded-full bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90"
            onClick={() => setRetryKey((value) => value + 1)}
            type="button"
          >
            Coba lagi
          </button>
        </section>
      )}

      {!loading && !error && filteredActivities.length === 0 && (
        <section className="rounded-3xl border border-slate-100 bg-white px-5 py-8 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-[var(--primary)]">
            <DashboardIcon name={filter === 'Dokumen' ? 'document' : 'history'} />
          </span>
          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {activities.length === 0
              ? 'Belum ada aktivitas'
              : `Belum ada aktivitas ${filter.toLowerCase()}`}
          </h3>
          <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-slate-500">
            {activities.length === 0
              ? 'Catatan program, pembayaran, dan berkas akan muncul di sini.'
              : 'Aktivitas kategori ini akan muncul di sini saat sudah tercatat.'}
          </p>
          {activities.length === 0 && applications.length === 0 && (
            <Link
              className="mt-4 inline-flex rounded-full bg-[var(--primary)] px-4 py-2.5 text-xs font-bold text-white"
              href="/?step=1"
            >
              Mulai pengajuan
            </Link>
          )}
          {activities.length === 0 && applications.length > 0 && (
            <Link
              className="mt-4 inline-flex rounded-full bg-blue-50 px-4 py-2.5 text-xs font-bold text-[var(--primary)]"
              href="/dashboard/unggah-berkas"
            >
              Buka berkas
            </Link>
          )}
        </section>
      )}

      {!loading && !error && filteredActivities.length > 0 && (
        <div className="space-y-5">
          {groups.map((group) => (
            <section aria-label={group.label} className="space-y-2" key={group.key}>
              <h3 className="px-1 text-xs font-bold text-slate-500">{group.label}</h3>
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
                {group.items.map((item, index) => (
                  <article
                    className={`flex items-center gap-3 px-3.5 py-3.5 ${
                      index < group.items.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                    key={item.id}
                  >
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-2xl ring-1 ${toneClass[item.tone]}`}
                    >
                      <DashboardIcon name={item.icon} className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-[13px] font-bold text-slate-800">
                        {item.title}
                      </h4>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {item.description}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {item.timestamp ? formatTime(item.timestamp) : 'Waktu tidak tersedia'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(item)}`}
                      >
                        {item.status}
                      </span>
                      {item.category === 'Pembayaran' && (
                        <strong className="text-[11px] font-bold text-slate-800">
                          {formatRupiah(item.amount ?? 0)}
                        </strong>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DashboardScaffold>
  )
}
