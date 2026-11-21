'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { formatRupiah } from '@/lib/financing-plan'
import {
  getUserActivityFeed,
  type UserApplicationDetail,
  type UserPaymentItem,
  type UserPaymentProofItem,
} from '../actions'
import {
  DashboardCard,
  DashboardCardSkeleton,
  DashboardIcon,
  DashboardScaffold,
} from '../_components/dashboard-ui'

type NotificationEntry = {
  id: string
  icon: 'calendar' | 'document' | 'check' | 'info' | 'clock' | 'alert'
  title: string
  detail: string
  time: string
  rawTime: string
  href: string
  important: boolean
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Pengajuan terkirim',
  ELIGIBILITY_REVIEW: 'Tinjauan kelayakan berjalan',
  DOCUMENT_REVIEW: 'Berkas sedang diperiksa',
  REVISION_REQUIRED: 'Berkas memerlukan revisi',
  COST_VERIFICATION: 'Rincian biaya sedang disusun',
  APPROVED: 'Pengajuan disetujui',
  CONTRACT_PREPARATION: 'Persiapan akad pembiayaan',
  ACTIVE: 'Program pembiayaan aktif',
  COMPLETED: 'Program pembiayaan selesai',
  REJECTED: 'Pengajuan belum disetujui',
  CANCELLED: 'Pengajuan dibatalkan',
}

const formatDateShort = (iso: string | null) => {
  if (!iso) return 'Terbaru'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userUid, setUserUid] = useState<string | null>(null)
  const [applications, setApplications] = useState<UserApplicationDetail[]>([])
  const [payments, setPayments] = useState<UserPaymentItem[]>([])
  const [paymentProofs, setPaymentProofs] = useState<UserPaymentProofItem[]>([])
  const [readUntil, setReadUntil] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setUserUid(null)
          setApplications([])
          setPayments([])
          setPaymentProofs([])
          setLoading(false)
          return
        }
        setUserUid(user.uid)
        try {
          const stored = localStorage.getItem(`vsv_notif_read_${user.uid}`)
          if (stored && active) setReadUntil(stored)
        } catch {
          // ignore localStorage access errors
        }
        try {
          const token = await user.getIdToken()
          if (!active) return
          const result = await getUserActivityFeed(token)
          if (!active) return
          if (!result.ok) {
            setError(result.message)
          } else {
            setError('')
            setApplications(result.applications)
            setPayments(result.payments)
            setPaymentProofs(result.paymentProofs ?? [])
          }
        } catch {
          if (active) setError('Notifikasi belum dapat dimuat. Silakan coba lagi.')
        } finally {
          if (active) setLoading(false)
        }
      })
    } catch {
      setError('Notifikasi belum dapat dimuat. Silakan coba lagi.')
      setLoading(false)
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const handleMarkAllRead = () => {
    const nowIso = new Date().toISOString()
    setReadUntil(nowIso)
    if (userUid) {
      try {
        localStorage.setItem(`vsv_notif_read_${userUid}`, nowIso)
      } catch {
        // ignore localStorage access errors
      }
    }
  }

  const notifications = useMemo<NotificationEntry[]>(() => {
    const list: NotificationEntry[] = []

    // 1. Manual transfer payment proofs (highest customer touchpoint)
    for (const proof of paymentProofs) {
      if (proof.status === 'VERIFIED') {
        list.push({
          id: `proof-${proof.id}`,
          icon: 'check',
          title: `Bukti transfer Angsuran ${proof.installmentNumber} diverifikasi`,
          detail: `Pembayaran sebesar ${formatRupiah(proof.amount)} telah disetujui admin dan dicatat lunas.`,
          time: formatDateShort(proof.submittedAt),
          rawTime: proof.submittedAt ?? '',
          href: '/dashboard/angsuran',
          important: false,
        })
      } else if (proof.status === 'REJECTED') {
        list.push({
          id: `proof-${proof.id}`,
          icon: 'alert',
          title: `Bukti transfer Angsuran ${proof.installmentNumber} perlu perbaikan`,
          detail: `Bukti transfer sebesar ${formatRupiah(proof.amount)} ditolak admin. Silakan periksa kembali dan unggah ulang bukti yang sah.`,
          time: formatDateShort(proof.submittedAt),
          rawTime: proof.submittedAt ?? '',
          href: '/dashboard/angsuran',
          important: true,
        })
      } else if (proof.status === 'PENDING_REVIEW') {
        list.push({
          id: `proof-${proof.id}`,
          icon: 'clock',
          title: `Bukti transfer Angsuran ${proof.installmentNumber} sedang ditinjau`,
          detail: `Bukti transfer sebesar ${formatRupiah(proof.amount)} telah diterima dan sedang menunggu verifikasi admin.`,
          time: formatDateShort(proof.submittedAt),
          rawTime: proof.submittedAt ?? '',
          href: '/dashboard/angsuran',
          important: false,
        })
      }
    }

    for (const app of applications) {
      // 2. Next unpaid installment reminder (only for ACTIVE contracts)
      if (app.status === 'ACTIVE') {
        const nextUnpaid = app.schedule.find((item) => !item.paid)
        if (nextUnpaid) {
          list.push({
            id: `due-${app.id}-${nextUnpaid.installment}`,
            icon: 'calendar',
            title: `Jadwal Angsuran ke-${nextUnpaid.installment}`,
            detail: `Tagihan ${formatRupiah(nextUnpaid.amount)} untuk ${app.applicationId} jatuh tempo pada ${formatDateShort(nextUnpaid.dueDate)}.`,
            time: formatDateShort(nextUnpaid.dueDate),
            rawTime: nextUnpaid.dueDate,
            href: '/dashboard/angsuran',
            important: true,
          })
        }
      }

      // 3. Akad document issuance notice
      if (app.akadDocumentIssued) {
        list.push({
          id: `akad-${app.id}`,
          icon: 'document',
          title: 'Naskah akad pembiayaan telah diterbitkan',
          detail: `Draft akad untuk ${app.applicationId} telah resmi diterbitkan oleh admin dan siap ditinjau.`,
          time: formatDateShort(app.updatedAt ?? app.createdAt),
          rawTime: app.updatedAt ?? app.createdAt ?? '',
          href: '/dashboard/profil/dokumen',
          important: true,
        })
      }

      // 4. Agreement wet-signed PDF archived notice
      if (app.agreementPdf) {
        list.push({
          id: `pdf-${app.id}`,
          icon: 'check',
          title: 'Arsip akad basah telah diunggah',
          detail: `Salinan naskah akad bertandatangan basah untuk ${app.applicationId} telah diarsipkan admin.`,
          time: formatDateShort(app.agreementPdf.uploadedAt ?? app.updatedAt ?? app.createdAt),
          rawTime: app.agreementPdf.uploadedAt ?? app.updatedAt ?? app.createdAt ?? '',
          href: '/dashboard/profil/dokumen',
          important: false,
        })
      }

      // 5. Final agreement status notice (legacy agreed status)
      if (app.pricingStatus === 'AGREED' && !app.akadDocumentIssued) {
        list.push({
          id: `agreed-${app.id}`,
          icon: 'check',
          title: 'Akad final tercatat disepakati',
          detail: `Akad untuk ${app.applicationId} telah aktif dengan total kewajiban ${formatRupiah(app.totalObligation ?? 0)}.`,
          time: formatDateShort(app.updatedAt ?? app.createdAt),
          rawTime: app.updatedAt ?? app.createdAt ?? '',
          href: '/dashboard/angsuran',
          important: false,
        })
      }

      // 6. Documents needing revision
      const revisionDocs = app.documents.filter((d) => d.status === 'REVISION_REQUIRED')
      if (revisionDocs.length > 0) {
        list.push({
          id: `rev-${app.id}`,
          icon: 'info',
          title: `${revisionDocs.length} dokumen memerlukan perbaikan`,
          detail: `Silakan unggah ulang: ${revisionDocs.map((d) => d.documentType).join(', ')}.`,
          time: formatDateShort(app.updatedAt ?? app.createdAt),
          rawTime: app.updatedAt ?? app.createdAt ?? '',
          href: '/dashboard/unggah-berkas',
          important: true,
        })
      }

      // 7. Application status notification
      list.push({
        id: `status-${app.id}`,
        icon: 'document',
        title: STATUS_LABELS[app.status] ?? `Status: ${app.status}`,
        detail: `Pengajuan ${app.applicationId} (${app.product === 'FULL_COVER' ? 'VSV Full Cover' : 'VSV Dana Keberangkatan'}) tercatat di sistem.`,
        time: formatDateShort(app.updatedAt ?? app.createdAt),
        rawTime: app.updatedAt ?? app.createdAt ?? '',
        href: '/dashboard',
        important: false,
      })
    }

    // 8. Payment transactions (Xendit / recorded payments)
    for (const payment of payments) {
      if (payment.status === 'PAID') {
        list.push({
          id: `paid-${payment.id}`,
          icon: 'check',
          title: 'Pembayaran diterima',
          detail: `${payment.description || 'Pembayaran'} sebesar ${formatRupiah(payment.amount)} telah dikonfirmasi lunas.`,
          time: formatDateShort(payment.paidAt ?? payment.createdAt),
          rawTime: payment.paidAt ?? payment.createdAt ?? '',
          href: '/dashboard/angsuran',
          important: false,
        })
      } else if (payment.status === 'PENDING') {
        list.push({
          id: `pend-${payment.id}`,
          icon: 'calendar',
          title: 'Menunggu penyelesaian pembayaran',
          detail: `Tagihan ${formatRupiah(payment.amount)} (${payment.description}) masih menunggu pembayaran.`,
          time: formatDateShort(payment.createdAt),
          rawTime: payment.createdAt ?? '',
          href: payment.invoiceUrl ?? '/dashboard/angsuran',
          important: true,
        })
      }
    }

    // Sort chronologically newest first
    return list.sort((a, b) => b.rawTime.localeCompare(a.rawTime))
  }, [applications, payments, paymentProofs])

  return (
    <DashboardScaffold active="home" subtitle="Pembaruan akun Anda" title="Notifikasi">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Terbaru ({notifications.length})</h2>
        {notifications.length > 0 && (
          <button
            className="text-xs font-semibold text-[var(--primary)] transition hover:underline"
            onClick={handleMarkAllRead}
            type="button"
          >
            Tandai sudah dibaca
          </button>
        )}
      </div>

      {loading && <DashboardCardSkeleton rows={4} />}

      {!loading && error && (
        <p className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && notifications.length === 0 && (
        <DashboardCard className="p-5 text-center">
          <p className="text-xs leading-5 text-slate-500">
            Belum ada pemberitahuan baru untuk akun Anda saat ini.
          </p>
        </DashboardCard>
      )}

      {!loading && !error && notifications.length > 0 && (
        <DashboardCard>
          {notifications.map((item) => {
            const isUnread =
              item.important && (!readUntil || (item.rawTime && item.rawTime > readUntil))
            return (
              <Link
                className={`relative flex gap-3 border-b border-slate-100 p-4 transition hover:bg-slate-50 last:border-0 ${
                  isUnread ? 'bg-blue-50/40' : ''
                }`}
                href={item.href}
                key={item.id}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[var(--primary)] shadow-sm">
                  <DashboardIcon name={item.icon} />
                </span>
                <div className="min-w-0 flex-1 pr-3">
                  <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</p>
                  <span className="mt-2 block text-[10px] text-slate-400">{item.time}</span>
                </div>
                {isUnread && (
                  <span className="absolute right-4 top-4 size-2 rounded-full bg-[var(--accent)]">
                    <span className="sr-only">Belum dibaca</span>
                  </span>
                )}
              </Link>
            )
          })}
        </DashboardCard>
      )}
    </DashboardScaffold>
  )
}
