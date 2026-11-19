'use client'

import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { getUserActivityFeed, type UserApplicationDetail } from '../../actions'
import { DashboardCard, DashboardIcon, DashboardScaffold } from '../../_components/dashboard-ui'

const programLabel = (application: UserApplicationDetail) =>
  application.product === 'FULL_COVER' ? 'Program Full Cover' : 'Program Dana Keberangkatan'

const agreementTitle = (application: UserApplicationDetail) =>
  application.product === 'FULL_COVER'
    ? 'Akad Wakalah bil Ujrah dan Ju’alah'
    : 'Akad Wakalah bil Ujrah'

const isProgramHistory = (application: UserApplicationDetail) =>
  application.status === 'ACTIVE' || application.status === 'COMPLETED'

export default function ProfileDocumentsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState<UserApplicationDetail[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [agreementPreviewUrl, setAgreementPreviewUrl] = useState('')
  const [previewApplicationId, setPreviewApplicationId] = useState('')
  const [agreementLoading, setAgreementLoading] = useState(false)
  const [agreementError, setAgreementError] = useState('')

  const programHistory = useMemo(() => applications.filter(isProgramHistory), [applications])
  const selectedApplication =
    programHistory.find((application) => application.id === selectedApplicationId) ?? null

  useEffect(() => {
    let active = true
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
      if (!user || !active) {
        if (active) setLoading(false)
        return
      }
      try {
        const feed = await getUserActivityFeed(await user.getIdToken())
        if (!active) return
        if (feed.ok) {
          const history = feed.applications.filter(isProgramHistory)
          setApplications(feed.applications)
          setSelectedApplicationId((current) =>
            history.some((application) => application.id === current)
              ? current
              : (history[0]?.id ?? ''),
          )
          setError('')
        } else {
          setError(feed.message)
        }
      } catch {
        if (active) setError('Riwayat dokumen akad belum dapat dimuat. Silakan coba lagi.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(
    () => () => {
      if (agreementPreviewUrl) URL.revokeObjectURL(agreementPreviewUrl)
    },
    [agreementPreviewUrl],
  )

  const loadAgreementPdf = async (application: UserApplicationDetail) => {
    const user = getFirebaseClientAuth().currentUser
    if (!user) throw new Error('Sesi telah berakhir. Silakan masuk kembali.')

    const response = await fetch(`/api/applicant/applications/${application.id}/agreement`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    })
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { message?: string }
      throw new Error(result.message || 'PDF akad belum dapat dibuka.')
    }

    const blob = await response.blob()
    if (blob.type !== 'application/pdf') throw new Error('Berkas yang diterima bukan PDF.')
    const url = URL.createObjectURL(blob)
    setAgreementPreviewUrl(url)
    setPreviewApplicationId(application.id)
    return url
  }

  const openAgreement = async (application: UserApplicationDetail) => {
    setSelectedApplicationId(application.id)
    setAgreementError('')
    if (!application.agreementPdf) return

    setAgreementLoading(true)
    try {
      if (previewApplicationId === application.id && agreementPreviewUrl) return
      await loadAgreementPdf(application)
    } catch (loadError) {
      setAgreementError(
        loadError instanceof Error ? loadError.message : 'PDF akad belum dapat dibuka.',
      )
    } finally {
      setAgreementLoading(false)
    }
  }

  const downloadAgreement = async () => {
    if (!selectedApplication?.agreementPdf) return
    setAgreementError('')
    setAgreementLoading(true)
    try {
      const url =
        previewApplicationId === selectedApplication.id && agreementPreviewUrl
          ? agreementPreviewUrl
          : await loadAgreementPdf(selectedApplication)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = selectedApplication.agreementPdf.fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (downloadError) {
      setAgreementError(
        downloadError instanceof Error ? downloadError.message : 'PDF akad belum dapat diunduh.',
      )
    } finally {
      setAgreementLoading(false)
    }
  }

  return (
    <DashboardScaffold
      active="profil"
      backHref="/dashboard/profil"
      subtitle="Riwayat program dan scan akad bertanda tangan basah"
      title="Dokumen Akad Saya"
    >
      <p className="rounded-2xl bg-blue-50 px-4 py-3 text-xs leading-5 text-slate-600">
        Pilih program untuk melihat scan dokumen akad yang telah ditandatangani basah oleh siswa dan
        pihak VentureGo.
      </p>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700" role="alert">
          {error}
        </p>
      )}

      <section aria-label="Riwayat program" className="space-y-3">
        {loading ? (
          <DashboardCard className="p-4">
            <div
              aria-label="Memuat riwayat program"
              className="flex animate-pulse items-center gap-3"
              role="status"
            >
              <span className="size-11 rounded-2xl bg-slate-200" />
              <span className="h-4 flex-1 rounded-lg bg-slate-200" />
            </div>
          </DashboardCard>
        ) : programHistory.length === 0 ? (
          <DashboardCard className="p-5 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-blue-50 text-[var(--primary)]">
              <DashboardIcon name="document" />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-800">Belum ada riwayat program</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Program yang sedang berjalan atau telah lunas akan muncul di sini.
            </p>
          </DashboardCard>
        ) : (
          programHistory.map((application) => {
            const completed = application.status === 'COMPLETED'
            return (
              <button
                aria-label={`Buka dokumen ${programLabel(application)}`}
                className="w-full rounded-2xl text-left outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                key={application.id}
                onClick={() => void openAgreement(application)}
                type="button"
              >
                <div className="flex items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-100">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--primary)]">
                    <DashboardIcon name="document" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">
                      {programLabel(application)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {application.lpkName || 'LPK belum tercatat'}
                    </span>
                    <span className="mt-2 block text-[11px] leading-4 text-slate-500">
                      Scan akad bertanda tangan basah
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${completed ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}
                  >
                    {completed ? 'Lunas' : 'Sedang berjalan'}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </section>

      {selectedApplication && (
        <div
          aria-labelledby="agreement-dialog-title"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedApplicationId('')
          }}
          role="dialog"
        >
          <section className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
            <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <h2
                  className="truncate text-sm font-bold text-slate-900"
                  id="agreement-dialog-title"
                >
                  {agreementTitle(selectedApplication)}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {programLabel(selectedApplication)} ·{' '}
                  {selectedApplication.status === 'COMPLETED' ? 'Lunas' : 'Sedang berjalan'}
                </p>
              </div>
              <button
                aria-label="Unduh scan dokumen akad"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-[var(--primary)] transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!selectedApplication.agreementPdf || agreementLoading}
                onClick={() => void downloadAgreement()}
                title="Unduh PDF"
                type="button"
              >
                <DashboardIcon className="size-4" name="download" />
              </button>
              <button
                aria-label="Tutup pratinjau dokumen akad"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                onClick={() => setSelectedApplicationId('')}
                type="button"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {agreementError && (
                <p className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">
                  {agreementError}
                </p>
              )}

              {selectedApplication.agreementPdf ? (
                agreementLoading && previewApplicationId !== selectedApplication.id ? (
                  <div
                    aria-label="Memuat scan dokumen akad"
                    className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 text-xs font-medium text-slate-500"
                    role="status"
                  >
                    Memuat scan dokumen akad…
                  </div>
                ) : agreementPreviewUrl && previewApplicationId === selectedApplication.id ? (
                  <iframe
                    className="h-[68dvh] min-h-80 w-full rounded-xl border border-slate-200 bg-slate-50"
                    src={agreementPreviewUrl}
                    title={`Pratinjau ${agreementTitle(selectedApplication)}`}
                  />
                ) : (
                  <div className="grid min-h-64 place-items-center rounded-2xl bg-slate-50 text-center">
                    <p className="text-xs text-slate-500">Menyiapkan pratinjau PDF…</p>
                  </div>
                )
              ) : !selectedApplication.akadDocumentIssued ? (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-amber-200 bg-amber-50/70 p-6 text-center">
                  <div>
                    <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-white text-amber-600 shadow-sm">
                      <DashboardIcon name="document" />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-amber-950">
                      Draft akad belum terbit
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-amber-800">
                      Dokumen akad akan ditampilkan setelah draft akad diterbitkan, ditandatangani
                      basah oleh siswa dan pihak VentureGo, lalu scan-nya diunggah oleh admin.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                  <div>
                    <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm">
                      <DashboardIcon name="document" />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-slate-800">
                      Scan akad belum diunggah
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-slate-500">
                      Draft akad telah terbit. Scan dokumen yang sudah ditandatangani basah oleh
                      siswa dan pihak VentureGo akan muncul di sini setelah admin mengunggahnya.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardScaffold>
  )
}
