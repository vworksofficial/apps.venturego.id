'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_DEFINITIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  isFormPendaftaranLabel,
  isJobDetailsFormLabel,
} from '@/lib/documents'
import { uploadToDrive } from '@/lib/upload-client'
import { getOwnedApplications, type OwnedApplication } from './actions'
import {
  DashboardCard,
  DashboardIcon,
  DashboardScaffold,
  SkeletonBlock,
} from '../_components/dashboard-ui'

const formatSize = (size?: number) => (size ? `${(size / 1024 / 1024).toFixed(1)} MB` : '')

const APPLICATION_STATUS_LABELS: Record<string, string> = {
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

export default function UploadDocumentsPage() {
  const [applications, setApplications] = useState<OwnedApplication[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [uploadToken, setUploadToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  const loadApplications = useCallback(async (token: string) => {
    const result = await getOwnedApplications(token)
    if (!result.ok) {
      setLoadingError(result.message)
      return
    }

    setApplications(result.applications)
    setSelectedApplicationId((current) =>
      result.applications.some((application) => application.id === current)
        ? current
        : (result.applications[0]?.id ?? ''),
    )
    setLoadingError('')
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    try {
      unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
        if (!active) return
        if (!user) {
          setUploadToken('')
          setLoading(false)
          return
        }

        try {
          const token = await user.getIdToken()
          if (!active) return
          setUploadToken(token)
          await loadApplications(token)
        } catch {
          if (active) setLoadingError('Sesi unggah tidak dapat diverifikasi. Silakan coba lagi.')
        } finally {
          if (active) setLoading(false)
        }
      })
    } catch {
      setLoadingError('Layanan unggah belum dapat dimuat. Silakan coba lagi.')
      setLoading(false)
    }

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [loadApplications])

  const selectedApplication = applications.find(
    (application) => application.id === selectedApplicationId,
  )
  const definitions = selectedApplication
    ? DOCUMENT_DEFINITIONS[selectedApplication.product]
    : DOCUMENT_DEFINITIONS.DEPARTURE_BRIDGING
  const groupTitles: Record<string, string> =
    selectedApplication?.product === 'FULL_COVER'
      ? {
          'dokumen-wajib': 'Dokumen Wajib',
          'dokumen-susulan': 'Dokumen Susulan (setelah pelatihan selesai)',
          'dokumen-pendukung': 'Dokumen Persyaratan',
        }
      : {
          default: 'Dokumen utama',
          'dokumen-pendukung': 'Dokumen Persyaratan',
        }
  const sectionPriority: Record<string, number> = {
    'dokumen-pendukung': 1,
    'dokumen-wajib': 2,
    default: 3,
    'dokumen-susulan': 4,
  }
  const documentGroups = Object.entries(
    definitions.reduce<Record<string, { document: (typeof definitions)[number]; index: number }[]>>(
      (groups, document, index) => {
        const key = document.section ?? 'default'
        ;(groups[key] ??= []).push({ document, index })
        return groups
      },
      {},
    ),
  )
    .map(([key, documents]) => ({ key, title: groupTitles[key] ?? key, documents }))
    .filter((group) => group.documents.length > 0)
    .sort((a, b) => (sectionPriority[a.key] ?? 99) - (sectionPriority[b.key] ?? 99))
  const uploadedBytes = useMemo(
    () =>
      selectedApplication?.documents.reduce(
        (total, document) =>
          total + (document.status !== 'NOT_UPLOADED' ? (document.size ?? 0) : 0),
        0,
      ) ?? 0,
    [selectedApplication],
  )

  const uploadDocument = async (index: number, file: File | undefined) => {
    setUploadError('')
    setSuccessMessage('')
    if (!file || !selectedApplication) return
    if (selectedApplication.documents[index]?.status === 'VERIFIED') {
      setUploadError('Dokumen sudah diverifikasi dan tidak dapat diubah.')
      return
    }
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_TYPES)[number])) {
      setUploadError('Gunakan berkas PDF, JPG, atau PNG.')
      return
    }
    if (file.size <= 0 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setUploadError('Ukuran setiap berkas maksimal 10 MB.')
      return
    }
    const previousSize =
      selectedApplication.documents[index]?.status !== 'NOT_UPLOADED'
        ? (selectedApplication.documents[index]?.size ?? 0)
        : 0
    if (uploadedBytes - previousSize + file.size > 60 * 1024 * 1024) {
      setUploadError('Ukuran seluruh berkas tidak boleh melebihi 60 MB.')
      return
    }
    if (!uploadToken) {
      setUploadError('Sesi unggah telah berakhir. Silakan muat ulang halaman.')
      return
    }

    setUploadingIndex(index)
    try {
      await uploadToDrive({
        token: uploadToken,
        file,
        documentIndex: index,
        applicationDocId: selectedApplication.id,
      })

      setSuccessMessage(`${definitions[index].label} berhasil diunggah.`)
      await loadApplications(uploadToken)
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : 'Berkas belum dapat diunggah. Periksa koneksi lalu coba lagi.',
      )
    } finally {
      setUploadingIndex(null)
    }
  }

  const downloadVerifiedDocument = async (index: number) => {
    if (!selectedApplication || !uploadToken) return
    setUploadError('')
    setSuccessMessage('')
    setDownloadingIndex(index)
    try {
      const response = await fetch(
        `/api/applicant/applications/${selectedApplication.id}/documents/${index}`,
        { headers: { Authorization: `Bearer ${uploadToken}` } },
      )
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(result.message || 'Berkas belum dapat diunduh.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = selectedApplication.documents[index]?.fileName || 'dokumen-terverifikasi'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Berkas belum dapat diunduh. Silakan coba lagi.',
      )
    } finally {
      setDownloadingIndex(null)
    }
  }

  return (
    <DashboardScaffold
      active="berkas"
      showHeader={false}
      subtitle="Lengkapi dokumen pengajuan"
      title="Unggah berkas"
    >
      {loading && (
        <div aria-label="Memuat dokumen" className="space-y-5" role="status">
          <span className="sr-only">Memuat dokumen…</span>
          <DashboardCard>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-2.5 w-20" />
                  <SkeletonBlock className="h-4 w-40" />
                </div>
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-3 w-28" />
              </div>
            </div>
          </DashboardCard>
          <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4">
            <SkeletonBlock className="size-5 shrink-0 rounded-md" />
            <SkeletonBlock className="h-8 flex-1" />
          </div>
          {[4, 3, 2].map((count, groupIndex) => (
            <section className="mt-4" key={groupIndex}>
              <SkeletonBlock className="mb-2 ml-1 h-3 w-28" />
              <DashboardCard>
                {Array.from({ length: count }, (_, rowIndex) => (
                  <div
                    className={`flex items-center gap-3 p-4 ${rowIndex < count - 1 ? 'border-b border-slate-100' : ''}`}
                    key={rowIndex}
                  >
                    <SkeletonBlock className="size-10 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonBlock className="h-3 w-3/5" />
                      <SkeletonBlock className="h-2.5 w-4/5" />
                    </div>
                    <SkeletonBlock className="h-8 w-20 shrink-0 rounded-full" />
                  </div>
                ))}
              </DashboardCard>
            </section>
          ))}
        </div>
      )}
      {!loading && loadingError && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700" role="alert">
          <p>{loadingError}</p>
          {uploadToken && (
            <button
              className="mt-3 font-bold underline"
              onClick={() => {
                setLoading(true)
                void loadApplications(uploadToken).finally(() => setLoading(false))
              }}
              type="button"
            >
              Coba lagi
            </button>
          )}
        </div>
      )}
      {!loading && !loadingError && !selectedApplication && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          role="status"
        >
          <DashboardIcon name="info" className="size-5 shrink-0 text-amber-700" />
          <p className="text-[11px] leading-5 text-amber-800">
            Pratinjau daftar dokumen. Fitur unggah belum aktif karena belum ada pengajuan yang
            tertaut ke sesi ini.
          </p>
        </div>
      )}

      {!loading && !loadingError && selectedApplication && (
        <DashboardCard>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  ID pengajuan
                </p>
                <h2 className="mt-1 truncate text-base font-extrabold tracking-tight text-slate-900">
                  {selectedApplication.applicationId}
                </h2>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  selectedApplication.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-800'
                    : selectedApplication.status === 'COMPLETED'
                      ? 'bg-slate-100 text-slate-700'
                      : ['REJECTED', 'CANCELLED'].includes(selectedApplication.status)
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-[var(--primary)]'
                }`}
              >
                {APPLICATION_STATUS_LABELS[selectedApplication.status] ??
                  selectedApplication.status}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-[11px]">
              <span className="font-bold text-slate-800">
                {selectedApplication.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="min-w-0 truncate text-slate-600">
                {selectedApplication.applicantName}
              </span>
            </div>
            {applications.length > 1 && (
              <label className="mt-3 block text-xs font-semibold text-slate-600">
                Pilih pengajuan
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
                  onChange={(event) => setSelectedApplicationId(event.target.value)}
                  value={selectedApplication.id}
                >
                  {applications.map((application) => (
                    <option key={application.id} value={application.id}>
                      {application.applicationId} · {application.applicantName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </DashboardCard>
      )}

      <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-4">
        <DashboardIcon name="shield" className="size-5 shrink-0 text-[var(--primary)]" />
        <p className="text-[11px] leading-5 text-slate-600">
          Unggah dokumen PDF, JPG, atau PNG. Maksimal 10 MB untuk setiap berkas.
        </p>
      </div>

      {!loading && !loadingError && definitions.length > 0 && (
        <>
          {documentGroups.map((group) => (
            <section aria-label={group.title} className="mt-4" key={group.title}>
              <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                {group.title}
              </h3>
              <DashboardCard>
                {group.documents.map(({ document, index }, groupIndex) => {
                  const uploadedDocument =
                    selectedApplication?.documents.find(
                      (doc) =>
                        doc.documentType === document.label ||
                        (isFormPendaftaranLabel(document.label) &&
                          isFormPendaftaranLabel(doc.documentType ?? '')),
                    ) ?? selectedApplication?.documents[index]
                  const status = uploadedDocument?.status ?? 'NOT_UPLOADED'
                  const isUploaded = status !== 'NOT_UPLOADED'
                  const isVerified = status === 'VERIFIED'
                  const needsRevision = status === 'REVISION_REQUIRED'
                  const isUploading = uploadingIndex === index
                  const statusBadge = needsRevision ? 'Perlu perbaikan' : ''
                  const isReplacing = status === 'UPLOADED'
                  return (
                    <div
                      className={`flex items-center gap-3 p-4 ${
                        groupIndex < group.documents.length - 1 ? 'border-b border-slate-100' : ''
                      }`}
                      key={document.label}
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                          isVerified
                            ? 'bg-emerald-50 text-emerald-600'
                            : needsRevision
                              ? 'bg-amber-50 text-amber-700'
                              : isUploaded
                                ? 'bg-blue-50 text-[var(--primary)]'
                                : 'bg-blue-50 text-[var(--primary)]'
                        }`}
                      >
                        <DashboardIcon
                          name={needsRevision ? 'info' : isUploaded ? 'check' : 'document'}
                          className="size-5"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="text-xs font-bold text-slate-800">
                            {document.label}
                            {document.required && (
                              <span aria-label="wajib diunggah" className="ml-1 text-red-500">
                                *
                              </span>
                            )}
                          </h3>
                          {statusBadge && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                isVerified
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : needsRevision
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-50 text-[var(--primary)]'
                              }`}
                            >
                              {statusBadge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[10px] text-slate-400">
                          {isUploaded
                            ? `${uploadedDocument?.fileName ?? 'Berkas'}${
                                uploadedDocument?.size
                                  ? ` · ${formatSize(uploadedDocument.size)}`
                                  : ''
                              }`
                            : 'Belum diunggah'}
                        </p>
                      </div>
                      {isFormPendaftaranLabel(document.label) ||
                      isJobDetailsFormLabel(document.label) ? (
                        isUploaded && selectedApplication ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              aria-label={`Unduh ${document.label}`}
                              className="grid size-9 shrink-0 place-items-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 transition hover:bg-teal-100 disabled:cursor-wait disabled:opacity-60"
                              disabled={downloadingIndex !== null}
                              onClick={() => void downloadVerifiedDocument(index)}
                              title={downloadingIndex === index ? 'Mengunduh…' : 'Unduh dokumen'}
                              type="button"
                            >
                              <DashboardIcon
                                className="size-4"
                                name={downloadingIndex === index ? 'clock' : 'download'}
                              />
                            </button>
                            <Link
                              aria-label={`Ubah ${document.label}`}
                              className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                              href={
                                isJobDetailsFormLabel(document.label)
                                  ? `/dashboard/pendaftaran?id=${selectedApplication.id}&section=pekerjaan`
                                  : `/dashboard/pendaftaran?id=${selectedApplication.id}`
                              }
                              title="Ubah data formulir"
                            >
                              <DashboardIcon className="size-3.5" name="edit" />
                            </Link>
                          </div>
                        ) : (
                          <Link
                            className="min-w-[6.5rem] shrink-0 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-3.5 py-2 text-center text-[10px] font-bold text-white shadow-sm transition hover:from-teal-700 hover:to-emerald-700"
                            href={
                              isJobDetailsFormLabel(document.label)
                                ? `/dashboard/pendaftaran?id=${selectedApplication?.id ?? ''}&section=pekerjaan`
                                : `/dashboard/pendaftaran?id=${selectedApplication?.id ?? ''}`
                            }
                          >
                            Lengkapi Form
                          </Link>
                        )
                      ) : isVerified && selectedApplication ? (
                        <button
                          aria-label={`Unduh ${document.label}`}
                          className="grid size-9 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                          disabled={downloadingIndex !== null}
                          onClick={() => void downloadVerifiedDocument(index)}
                          title={downloadingIndex === index ? 'Mengunduh…' : 'Unduh dokumen'}
                          type="button"
                        >
                          <DashboardIcon
                            className="size-4"
                            name={downloadingIndex === index ? 'clock' : 'download'}
                          />
                        </button>
                      ) : (
                        <label
                          aria-disabled={isVerified || !selectedApplication}
                          className={`min-w-[4.5rem] shrink-0 rounded-full px-3 py-2 text-center text-[10px] font-bold transition ${
                            !selectedApplication || isVerified
                              ? 'cursor-not-allowed bg-slate-300 text-white'
                              : isReplacing
                                ? 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                                : needsRevision
                                  ? 'cursor-pointer bg-amber-600 text-white'
                                  : 'cursor-pointer bg-[var(--primary)] text-white'
                          }`}
                          title={
                            isVerified
                              ? 'Dokumen sudah diverifikasi dan tidak dapat diubah'
                              : undefined
                          }
                        >
                          {isVerified
                            ? 'Ganti'
                            : selectedApplication
                              ? isUploading
                                ? 'Mengunggah…'
                                : needsRevision
                                  ? 'Perbaiki'
                                  : isUploaded
                                    ? 'Ganti'
                                    : 'Unggah'
                              : 'Belum aktif'}
                          <input
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            className="sr-only"
                            disabled={uploadingIndex !== null || !selectedApplication || isVerified}
                            onChange={(event) => {
                              void uploadDocument(index, event.target.files?.[0])
                              event.target.value = ''
                            }}
                            type="file"
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </DashboardCard>
            </section>
          ))}
        </>
      )}

      {!loading && !loadingError && selectedApplication && (
        <section aria-label="Formulir pendaftaran digital" className="mt-2">
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
                  <DashboardIcon className="size-5" name="document" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Formulir Pendaftaran Siswa
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                    Lengkapi data pemohon dan kontak darurat secara digital. Berkas PDF resmi akan
                    diterbitkan otomatis tanpa perlu dicetak manual.
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm transition hover:from-teal-700 hover:to-emerald-700"
                href={`/dashboard/pendaftaran?id=${selectedApplication.id}`}
              >
                <span>Lengkapi Form</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {uploadError && (
        <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">
          {uploadError}
        </p>
      )}
      {successMessage && (
        <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700" role="status">
          {successMessage}
        </p>
      )}
    </DashboardScaffold>
  )
}
