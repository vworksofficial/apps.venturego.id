'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminPaymentProofRecord, FinancingApplicationRecord } from '@/lib/firebase-data'
import { resolveInstallmentSchedule } from '@/lib/installment-schedule'
import { approvePaymentProof, rejectAndDeletePaymentProof } from './actions'

const money = (amount: number) => `Rp${amount.toLocaleString('id-ID')}`

const dateTime = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak tersedia'
    : date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      })
}

const dateOnly = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
}

export function InstallmentMonitor({
  proofs,
  applications,
}: {
  proofs: AdminPaymentProofRecord[]
  applications: FinancingApplicationRecord[]
}) {
  const router = useRouter()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const rows = useMemo(
    () =>
      proofs.flatMap((proof) => {
        const application = applications.find((entry) => entry.id === proof.applicationDocId)
        if (!application) return []
        const plan = application.financialPlan ?? {}
        const schedule = resolveInstallmentSchedule(application.product, plan)
        const installment = schedule.find((entry) => entry.installment === proof.installmentNumber)
        const akad = plan.akadDocument
        const studentNumber =
          akad && typeof akad === 'object' && 'studentNumber' in akad
            ? String(akad.studentNumber ?? '')
            : (application.studentNumber ?? '')
        return [
          {
            proof,
            application,
            studentNumber,
            scheduledAmount: installment?.amount ?? null,
            dueDate: installment?.dueDate ?? '',
          },
        ]
      }),
    [proofs, applications],
  )

  const review = async (proofId: string, action: 'approve' | 'reject') => {
    setError('')
    setMessage('')
    if (
      action === 'reject' &&
      !window.confirm(
        'Tolak bukti dan hapus berkasnya? Siswa dapat mengunggah bukti baru setelahnya.',
      )
    ) {
      return
    }
    setBusyId(proofId)
    try {
      const result =
        action === 'approve'
          ? await approvePaymentProof(proofId)
          : await rejectAndDeletePaymentProof(proofId)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPreviewId(null)
      setMessage(
        action === 'approve'
          ? 'Pembayaran disetujui dan masuk ke Riwayat Angsuran.'
          : 'Bukti dihapus. Siswa dapat mengunggah ulang.',
      )
      router.refresh()
    } catch {
      setError('Tindakan belum berhasil. Silakan coba lagi.')
    } finally {
      setBusyId(null)
    }
  }

  const preview = rows.find((row) => row.proof.id === previewId)

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-emerald-50/30 p-5 shadow-xs sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Monitor Angsuran</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Tinjau bukti pembayaran yang dikirim siswa. Pembayaran yang disetujui tercatat pada
              Riwayat Angsuran siswa.
            </p>
          </div>
          <div className="rounded-xl bg-white px-4 py-2 text-center ring-1 ring-blue-100">
            <strong className="block text-xl font-extrabold text-[#0b57d0]">{rows.length}</strong>
            <span className="text-[10px] font-semibold text-slate-500">Menunggu pemeriksaan</span>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800" role="status">
          {message}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <svg
                aria-hidden="true"
                className="size-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h2 className="mt-3 text-sm font-bold text-slate-800">
              Belum ada bukti untuk diperiksa
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Bukti pembayaran baru akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Siswa</th>
                  <th className="px-4 py-3">Program & LPK</th>
                  <th className="px-4 py-3">Angsuran</th>
                  <th className="px-4 py-3 text-right">Nominal transfer</th>
                  <th className="px-4 py-3">Bukti dikirim</th>
                  <th className="px-4 py-3">Berkas</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(({ proof, application, studentNumber, scheduledAmount, dueDate }) => (
                  <tr className="align-middle hover:bg-slate-50/70" key={proof.id}>
                    <td className="px-4 py-3">
                      <strong className="block max-w-48 truncate text-xs text-slate-900">
                        {application.applicantName}
                      </strong>
                      <span className="mt-0.5 block text-[10px] text-emerald-700">
                        {studentNumber ? `NIS ${studentNumber}` : 'NIS belum tersedia'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <strong className="block text-[11px] text-slate-800">
                        {application.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
                      </strong>
                      <span className="mt-0.5 block max-w-48 truncate text-[10px] text-slate-500">
                        {application.lpkName || 'LPK belum tercatat'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <strong className="block text-[11px] text-slate-800">
                        Angsuran {proof.installmentNumber}
                      </strong>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        Jadwal: {dueDate ? dateOnly(dueDate) : 'Fleksibel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <strong className="block text-xs font-bold text-slate-900">
                        {money(proof.amount)}
                      </strong>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        Angsuran {scheduledAmount ? money(scheduledAmount) : '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[10px] text-slate-600">
                      {dateTime(proof.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-36 truncate text-[10px] text-slate-600">
                        {proof.fileName}
                      </span>
                      <span className="text-[9px] uppercase text-slate-400">
                        {proof.mimeType.split('/').pop()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => setPreviewId(proof.id)}
                          type="button"
                        >
                          Pratinjau
                        </button>
                        <button
                          aria-label={`Tolak dan hapus bukti ${application.applicantName}`}
                          className="grid size-8 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          disabled={busyId === proof.id}
                          onClick={() => void review(proof.id, 'reject')}
                          title="Tolak dan hapus"
                          type="button"
                        >
                          <svg
                            aria-hidden="true"
                            className="size-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path
                              d="M3 6h18m-2 0-.9 14H5.9L5 6m3 0V4h8v2m-7 4v6m4-6v6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          disabled={busyId === proof.id}
                          onClick={() => void review(proof.id, 'approve')}
                          type="button"
                        >
                          {busyId === proof.id ? 'Memproses…' : 'Setujui'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewId(null)
          }}
        >
          <section
            aria-label={`Pratinjau bukti ${preview.application.applicantName}`}
            aria-modal="true"
            className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            role="dialog"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-slate-900">
                  Bukti Angsuran {preview.proof.installmentNumber} ·{' '}
                  {preview.application.applicantName}
                </h2>
                <p className="text-[10px] text-slate-500">
                  {money(preview.proof.amount)} · {preview.proof.fileName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  aria-label={`Tolak dan hapus bukti ${preview.application.applicantName}`}
                  className="grid size-9 place-items-center rounded-full border border-rose-200 text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                  disabled={busyId === preview.proof.id}
                  onClick={() => void review(preview.proof.id, 'reject')}
                  title="Tolak dan hapus bukti"
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="size-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M3 6h18m-2 0-.9 14H5.9L5 6m3 0V4h8v2m-7 4v6m4-6v6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                  disabled={busyId === preview.proof.id}
                  onClick={() => void review(preview.proof.id, 'approve')}
                  type="button"
                >
                  {busyId === preview.proof.id ? 'Memproses…' : 'Setujui'}
                </button>
                <button
                  aria-label="Tutup pratinjau"
                  className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                  onClick={() => setPreviewId(null)}
                  type="button"
                >
                  ×
                </button>
              </div>
            </header>
            <div className="min-h-[55dvh] flex-1 bg-slate-100">
              {preview.proof.mimeType.startsWith('image/') ? (
                <img
                  alt={`Bukti pembayaran ${preview.application.applicantName}`}
                  className="mx-auto max-h-[78dvh] w-full object-contain"
                  src={`/api/admin/payment-proofs/${preview.proof.id}`}
                />
              ) : (
                <iframe
                  className="h-[78dvh] w-full"
                  src={`/api/admin/payment-proofs/${preview.proof.id}`}
                  title={`Bukti pembayaran ${preview.application.applicantName}`}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
