'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { DashboardIcon, DashboardScaffold, SkeletonBlock } from '../_components/dashboard-ui'
import { getOwnedApplications, type OwnedApplication } from '../unggah-berkas/actions'
import {
  EMPTY_REGISTRATION_FORM_DATA,
  formatIndonesianDate,
  type RegistrationFormData,
} from '@/lib/registration-form-types'

function RegistrationFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryAppId = searchParams.get('id') ?? ''

  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [applications, setApplications] = useState<OwnedApplication[]>([])
  const [selectedAppId, setSelectedAppId] = useState(queryAppId)
  const [formData, setFormData] = useState<RegistrationFormData>(EMPTY_REGISTRATION_FORM_DATA)

  // 1. Authenticate & load owned applications
  useEffect(() => {
    let active = true
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
      if (!active) return
      if (!user) {
        setToken('')
        setLoading(false)
        setErrorMessage('Sesi berakhir. Silakan masuk kembali.')
        return
      }

      try {
        const idToken = await user.getIdToken()
        if (!active) return
        setToken(idToken)

        const result = await getOwnedApplications(idToken)
        if (!result.ok) {
          setErrorMessage(result.message)
          return
        }

        setApplications(result.applications)
        const targetId =
          queryAppId && result.applications.some((app) => app.id === queryAppId)
            ? queryAppId
            : (result.applications[0]?.id ?? '')
        setSelectedAppId(targetId)
      } catch {
        if (active) setErrorMessage('Gagal memverifikasi akun.')
      } finally {
        if (active) setLoading(false)
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [queryAppId])

  // 2. Fetch existing form data or prefill
  useEffect(() => {
    if (!token || !selectedAppId) return

    let active = true
    void (async () => {
      try {
        const response = await fetch(
          `/api/applicant/registration-form?applicationId=${selectedAppId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok) return

        const result = (await response.json()) as {
          ok: boolean
          data?: RegistrationFormData | null
          prefill?: Partial<RegistrationFormData>
        }

        if (active && result.ok) {
          if (result.data) {
            const data = { ...result.data }
            if (data.birthDate) {
              data.birthDate = formatIndonesianDate(data.birthDate)
            }
            setFormData(data)
          } else if (result.prefill) {
            const prefill = { ...result.prefill }
            if (prefill.birthDate) {
              prefill.birthDate = formatIndonesianDate(prefill.birthDate)
            }
            setFormData((prev) => ({
              ...prev,
              ...prefill,
            }))
          }
        }
      } catch {
        // Fallback to default
      }
    })()

    return () => {
      active = false
    }
  }, [token, selectedAppId])

  const updateField = <K extends keyof RegistrationFormData>(
    field: K,
    value: RegistrationFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !selectedAppId) return

    setErrorMessage('')
    setSuccessMessage('')
    setSubmitting(true)

    try {
      const response = await fetch('/api/applicant/registration-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId: selectedAppId,
          formData,
        }),
      })

      const result = (await response.json()) as { ok: boolean; message?: string }
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Gagal menyimpan formulir pendaftaran.')
      }

      setSuccessMessage('Formulir pendaftaran berhasil disimpan dan PDF resmi telah diterbitkan!')
      setTimeout(() => {
        router.push('/dashboard/unggah-berkas')
      }, 1500)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan formulir.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <DashboardScaffold
        active="berkas"
        backHref="/dashboard/unggah-berkas"
        subtitle="Memuat formulir pendaftaran..."
        title="Form Pendaftaran"
      >
        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
      </DashboardScaffold>
    )
  }

  return (
    <DashboardScaffold
      active="berkas"
      backHref="/dashboard/unggah-berkas"
      subtitle="Data Pemohon, Kontak Darurat, & Pekerjaan"
      title="Form Pendaftaran"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
          href="/dashboard/unggah-berkas"
        >
          <DashboardIcon className="size-4" name="arrowLeft" />
          <span>Kembali ke Unggah Berkas</span>
        </Link>
        {formData.completedAt && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Sudah Dilengkapi
          </span>
        )}
      </div>

      {applications.length > 1 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
          <label className="block text-xs font-semibold text-slate-700">
            Pilih Pengajuan
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
              onChange={(e) => setSelectedAppId(e.target.value)}
              value={selectedAppId}
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.applicationId} · {app.applicantName}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {errorMessage && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* ================= SECTION 1: DATA PEMOHON ================= */}
        <section
          aria-labelledby="section-pemohon"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4"
        >
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-teal-600 text-xs font-extrabold text-white">
                1
              </span>
              <h2 className="text-sm font-bold text-slate-900" id="section-pemohon">
                Data Pemohon
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Identitas lengkap siswa pemohon pembiayaan
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="Sesuai KTP"
              readOnly
              required
              type="text"
              value={formData.fullName}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                No. KTP <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 font-mono text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              maxLength={16}
              placeholder="16 digit NIK"
              readOnly
              required
              type="text"
              value={formData.idCardNumber}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Nama Gadis Ibu Kandung <span className="text-red-500">*</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('motherMaidenName', e.target.value)}
              placeholder="Nama lengkap ibu kandung"
              required
              type="text"
              value={formData.motherMaidenName}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              NPWP <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('npwp', e.target.value)}
              placeholder="Nomor pokok wajib pajak"
              type="text"
              value={formData.npwp}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Email <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="alamat@email.com"
              readOnly
              required
              type="email"
              value={formData.email}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Alamat Rumah Terkini <span className="text-red-500">*</span>
            </label>
            <textarea
              className="mt-1.5 min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs leading-relaxed text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Jalan, No. Rumah, Dusun / Lingkungan"
              required
              rows={4}
              value={formData.address}
            />
          </div>

          {/* RT dan RW dalam 1 row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">RT</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                maxLength={3}
                onChange={(e) => updateField('rt', e.target.value)}
                placeholder="001"
                type="text"
                value={formData.rt}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">RW</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                maxLength={3}
                onChange={(e) => updateField('rw', e.target.value)}
                placeholder="002"
                type="text"
                value={formData.rw}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kelurahan / Desa</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('kelurahan', e.target.value)}
              placeholder="Desa / Kelurahan"
              type="text"
              value={formData.kelurahan}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kecamatan</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('kecamatan', e.target.value)}
              placeholder="Kecamatan"
              type="text"
              value={formData.kecamatan}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Kota / Kabupaten <span className="text-red-500">*</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('city', e.target.value)}
              placeholder="Contoh: Kab. Wonosobo"
              required
              type="text"
              value={formData.city}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kode Pos</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              maxLength={5}
              onChange={(e) => updateField('postalCode', e.target.value)}
              placeholder="5 digit"
              type="text"
              value={formData.postalCode}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">No. Telepon Rumah</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('homePhone', e.target.value)}
              placeholder="Opsional"
              type="tel"
              value={formData.homePhone}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                No. Handphone / WhatsApp <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 font-mono text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="0812xxxx"
              readOnly
              required
              type="tel"
              value={formData.mobilePhone}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Dapat Dihubungi Pada Jam
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('contactHourStart', e.target.value)}
                placeholder="08.00"
                type="text"
                value={formData.contactHourStart}
              />
              <span className="text-xs text-slate-400">-</span>
              <input
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('contactHourEnd', e.target.value)}
                placeholder="17.00"
                type="text"
                value={formData.contactHourEnd}
              />
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('contactTimeZone', e.target.value)}
                value={formData.contactTimeZone}
              >
                <option value="WIB">WIB</option>
                <option value="WITA">WITA</option>
                <option value="WIT">WIT</option>
                <option value="Waktu Jepang">Waktu Jepang</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Tempat Lahir <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="Kota Lahir"
              readOnly
              required
              type="text"
              value={formData.birthPlace}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Tanggal Lahir</label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="Contoh: 12 Februari 2000"
              readOnly
              type="text"
              value={formData.birthDate ? formatIndonesianDate(formData.birthDate) : ''}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">
                Jenis Kelamin <span className="text-red-500">*</span>
              </label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <div className="mt-1.5 flex gap-2">
              <div
                className={`flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold cursor-not-allowed select-none ${
                  formData.gender === 'LAKI_LAKI'
                    ? 'border-teal-500/50 bg-teal-50/70 text-teal-800'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                Laki-laki
              </div>
              <div
                className={`flex-1 rounded-xl border py-2.5 text-center text-xs font-semibold cursor-not-allowed select-none ${
                  formData.gender === 'PEREMPUAN'
                    ? 'border-teal-500/50 bg-teal-50/70 text-teal-800'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                Perempuan
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Agama</label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs text-slate-700 cursor-not-allowed select-none focus:outline-none"
              readOnly
              type="text"
              value={
                formData.religion === 'ISLAM'
                  ? 'Islam'
                  : formData.religion === 'PROTESTAN'
                    ? 'Protestan'
                    : formData.religion === 'KATHOLIK'
                      ? 'Katholik'
                      : formData.religion === 'HINDU'
                        ? 'Hindu'
                        : formData.religion === 'BUDHA'
                          ? 'Budha'
                          : formData.religion === 'KONG_HU_CHU'
                            ? 'Kong Hu Chu'
                            : 'Lainnya'
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Jumlah Tanggungan</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                min={0}
                onChange={(e) => updateField('dependentsCount', Number(e.target.value) || 0)}
                type="number"
                value={formData.dependentsCount}
              />
              <span className="text-xs text-slate-600">Orang</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Pendidikan Terakhir
            </label>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) =>
                updateField(
                  'lastEducation',
                  e.target.value as RegistrationFormData['lastEducation'],
                )
              }
              value={formData.lastEducation}
            >
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMA_SEDERAJAT">SMA / SMK / Sederajat</option>
              <option value="D1">D1</option>
              <option value="D2">D2</option>
              <option value="D3">D3</option>
              <option value="D4">D4</option>
              <option value="S1">S1</option>
              <option value="S2">S2</option>
              <option value="S3">S3</option>
            </select>
          </div>
        </section>

        {/* ================= SECTION 2: KONTAK EMERGENCY ================= */}
        <section
          aria-labelledby="section-emergency"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4"
        >
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-teal-600 text-xs font-extrabold text-white">
                2
              </span>
              <h2 className="text-sm font-bold text-slate-900" id="section-emergency">
                Kontak Emergency (Darurat)
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Keluarga atau kerabat yang dapat dihubungi dalam keadaan darurat
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Nama Lengkap Kontak Darurat <span className="text-red-500">*</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyName', e.target.value)}
              placeholder="Nama lengkap wali / kerabat"
              required
              type="text"
              value={formData.emergencyName}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Hubungan</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) =>
                updateField(
                  'emergencyRelation',
                  e.target.value as RegistrationFormData['emergencyRelation'],
                )
              }
              value={formData.emergencyRelation}
            >
              <option value="ORANG_TUA">Orang Tua</option>
              <option value="ANAK">Anak</option>
              <option value="SAUDARA_KANDUNG">Saudara Kandung</option>
              <option value="SAUDARA_KANDUNG_ORANG_TUA">
                Saudara Kandung Orang Tua (Paman/Bibi)
              </option>
              <option value="LAINNYA">Lainnya</option>
            </select>
          </div>

          {formData.emergencyRelation === 'LAINNYA' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Keterangan Hubungan
              </label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('emergencyRelationOther', e.target.value)}
                placeholder="Contoh: Mertua, Sepupu"
                type="text"
                value={formData.emergencyRelationOther}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Jenis Kelamin</label>
            <div className="mt-1.5 flex gap-2">
              <button
                className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  formData.emergencyGender === 'LAKI_LAKI'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => updateField('emergencyGender', 'LAKI_LAKI')}
                type="button"
              >
                Laki-laki
              </button>
              <button
                className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  formData.emergencyGender === 'PEREMPUAN'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => updateField('emergencyGender', 'PEREMPUAN')}
                type="button"
              >
                Perempuan
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">No. Telepon Rumah</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyPhone', e.target.value)}
              placeholder="Opsional"
              type="tel"
              value={formData.emergencyPhone}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              No. Handphone / WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyMobile', e.target.value)}
              placeholder="08xxxxxxxx"
              required
              type="tel"
              value={formData.emergencyMobile}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Alamat Tempat Tinggal <span className="text-red-500">*</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyAddress', e.target.value)}
              placeholder="Alamat tempat tinggal kontak darurat"
              required
              rows={2}
              value={formData.emergencyAddress}
            />
          </div>

          {/* RT dan RW kontak darurat dalam 1 row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">RT</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                maxLength={3}
                onChange={(e) => updateField('emergencyRt', e.target.value)}
                placeholder="001"
                type="text"
                value={formData.emergencyRt}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">RW</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                maxLength={3}
                onChange={(e) => updateField('emergencyRw', e.target.value)}
                placeholder="002"
                type="text"
                value={formData.emergencyRw}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kelurahan / Desa</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyKelurahan', e.target.value)}
              placeholder="Desa"
              type="text"
              value={formData.emergencyKelurahan}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kecamatan</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyKecamatan', e.target.value)}
              placeholder="Kecamatan"
              type="text"
              value={formData.emergencyKecamatan}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kota / Kabupaten</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('emergencyCity', e.target.value)}
              placeholder="Kota domisili"
              type="text"
              value={formData.emergencyCity}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kode Pos</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              maxLength={5}
              onChange={(e) => updateField('emergencyPostalCode', e.target.value)}
              placeholder="5 digit"
              type="text"
              value={formData.emergencyPostalCode}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Status Tempat Tinggal
            </label>
            <div className="mt-1.5 flex gap-2">
              <button
                className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  formData.emergencyCohabitation === 'TINGGAL_SERUMAH'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => updateField('emergencyCohabitation', 'TINGGAL_SERUMAH')}
                type="button"
              >
                Tinggal Serumah
              </button>
              <button
                className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                  formData.emergencyCohabitation === 'TIDAK_TINGGAL_SERUMAH'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                onClick={() => updateField('emergencyCohabitation', 'TIDAK_TINGGAL_SERUMAH')}
                type="button"
              >
                Tidak Serumah
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Dapat Dihubungi Pada Jam
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('emergencyContactHourStart', e.target.value)}
                placeholder="08.00"
                type="text"
                value={formData.emergencyContactHourStart}
              />
              <span className="text-xs text-slate-400">-</span>
              <input
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('emergencyContactHourEnd', e.target.value)}
                placeholder="17.00"
                type="text"
                value={formData.emergencyContactHourEnd}
              />
              <span className="text-xs font-semibold text-slate-600">WIB</span>
            </div>
          </div>
        </section>

        {/* ================= SECTION 3: PEKERJAAN DI NEGARA TERTUJU ================= */}
        <section
          aria-labelledby="section-pekerjaan"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4"
        >
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-lg bg-teal-600 text-xs font-extrabold text-white">
                3
              </span>
              <h2 className="text-sm font-bold text-slate-900" id="section-pekerjaan">
                Pekerjaan di Negara Tertuju
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Rincian kontrak kerja dan perusahaan penempatan di negara tujuan
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Negara Tertuju</label>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Tersinkron
              </span>
            </div>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs font-semibold text-slate-700 cursor-not-allowed select-none focus:outline-none"
              placeholder="Contoh: JEPANG / TURKIYE"
              readOnly
              type="text"
              value={formData.destinationCountry}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nama Perusahaan</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="Nama perusahaan penerima di negara tujuan"
              type="text"
              value={formData.companyName}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Bidang Usaha</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyBusiness', e.target.value)}
              placeholder="Contoh: Manufaktur, Pertanian, Perhotelan"
              type="text"
              value={formData.companyBusiness}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Posisi / Peran</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyRole', e.target.value)}
              placeholder="Operator Pabrik, Caregiver, dsb."
              type="text"
              value={formData.companyRole}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Alamat Perusahaan</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyAddress', e.target.value)}
              placeholder="Alamat kantor atau lokasi kerja"
              type="text"
              value={formData.companyAddress}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Kota Perusahaan</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyCity', e.target.value)}
              placeholder="Prefektur / Kota di negara tujuan"
              type="text"
              value={formData.companyCity}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              No. Telepon Perusahaan
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('companyPhone', e.target.value)}
              placeholder="Opsional"
              type="text"
              value={formData.companyPhone}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Tanggal Mulai Bekerja
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) => updateField('workStartDate', e.target.value)}
              placeholder="DD/MM/YYYY"
              type="text"
              value={formData.workStartDate}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Status Pekerjaan</label>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              onChange={(e) =>
                updateField(
                  'employmentStatus',
                  e.target.value as RegistrationFormData['employmentStatus'],
                )
              }
              value={formData.employmentStatus}
            >
              <option value="MAGANG">Magang</option>
              <option value="KONTRAK">Kontrak</option>
              <option value="LAINNYA">Lainnya</option>
            </select>
          </div>

          {formData.employmentStatus === 'LAINNYA' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Keterangan Status Pekerjaan
              </label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                onChange={(e) => updateField('employmentStatusOther', e.target.value)}
                placeholder="Sebutkan..."
                type="text"
                value={formData.employmentStatusOther}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Lama Kontrak (Tahun)
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              maxLength={2}
              onChange={(e) => updateField('contractDurationYears', e.target.value)}
              placeholder="Contoh: 1, 3, atau 5"
              type="text"
              value={formData.contractDurationYears}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Pendapatan Bulanan (Rp)
            </label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              min={0}
              onChange={(e) => updateField('monthlyIncome', Number(e.target.value) || 0)}
              placeholder="Contoh: 15000000"
              type="number"
              value={formData.monthlyIncome || ''}
            />
          </div>
        </section>

        {/* Tombol Simpan */}
        <div className="pt-2">
          <button
            className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3.5 text-xs font-bold text-white shadow-md transition hover:from-teal-700 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </DashboardScaffold>
  )
}

export default function RegistrationFormPage() {
  return (
    <Suspense
      fallback={
        <DashboardScaffold active="berkas" title="Form Pendaftaran">
          <div className="p-8 text-center text-xs text-slate-500">Memuat formulir...</div>
        </DashboardScaffold>
      }
    >
      <RegistrationFormContent />
    </Suspense>
  )
}
