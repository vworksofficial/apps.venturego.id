'use client'

import { useState, useTransition } from 'react'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { ALUMNI_BUSINESS_SECTOR_LABELS, type AlumniBusinessSector } from '@/lib/murabahah-financing'
import { submitAlumniFinancingByUser } from '../actions'

const formatRupiah = (amount: number) => `Rp${Math.round(amount || 0).toLocaleString('id-ID')}`

export function UserAlumniApplicationModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [businessSector, setBusinessSector] = useState<AlumniBusinessSector>('PETERNAKAN')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessCity, setBusinessCity] = useState('')
  const [businessProvince, setBusinessProvince] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [requestedAmount, setRequestedAmount] = useState('10000000')
  const [tenorMonths, setTenorMonths] = useState(12)
  const [disbursementBankName, setDisbursementBankName] = useState('')
  const [disbursementBankAccount, setDisbursementBankAccount] = useState('')
  const [disbursementAccountHolder, setDisbursementAccountHolder] = useState('')
  const [understandsMurabahah, setUnderstandsMurabahah] = useState(false)
  const [acceptsDataProcessing, setAcceptsDataProcessing] = useState(false)

  if (!isOpen) return null

  const principalNum = Math.max(0, Number(requestedAmount.replace(/\D/g, '')) || 0)
  const adminFeeEstimate = Math.round(principalNum * 0.03)
  const netDisbursedEstimate = Math.max(0, principalNum - adminFeeEstimate)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (businessName.trim().length < 2) {
      setError('Nama unit usaha wajib diisi.')
      return
    }
    if (businessAddress.trim().length < 5) {
      setError('Alamat lokasi usaha wajib diisi lengkap.')
      return
    }
    if (principalNum < 1_000_000 || principalNum > 100_000_000) {
      setError('Nominal modal usaha harus antara Rp1.000.000 hingga Rp100.000.000.')
      return
    }
    if (!understandsMurabahah || !acceptsDataProcessing) {
      setError('Mohon centang kedua persetujuan akad Murabahah dan pemrosesan data.')
      return
    }

    startTransition(async () => {
      try {
        const user = getFirebaseClientAuth().currentUser
        if (!user) {
          setError('Sesi masuk telah berakhir. Silakan masuk kembali.')
          return
        }
        const token = await user.getIdToken()
        const result = await submitAlumniFinancingByUser(token, {
          businessName,
          businessSector,
          businessAddress,
          businessCity,
          businessProvince,
          businessDescription,
          requestedAmount: principalNum,
          tenorMonths,
          disbursementBankName,
          disbursementBankAccount,
          disbursementAccountHolder,
          understandsMurabahah,
          acceptsDataProcessing,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        onSuccess()
      } catch {
        setError('Pengajuan belum dapat dikirim. Silakan coba lagi.')
      }
    })
  }

  return (
    <div
      aria-labelledby="alumni-apply-title"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) onClose()
      }}
      role="dialog"
    >
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div>
            <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-800">
              KHUSUS ALUMNI · AKAD MURABAHAH
            </span>
            <h2 className="mt-1 text-base font-bold text-slate-900" id="alumni-apply-title">
              Ajukan Pembiayaan Modal Usaha
            </h2>
          </div>
          <button
            aria-label="Tutup formulir pengajuan alumni"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <form className="space-y-4 p-5 sm:p-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs leading-5 text-purple-950">
            Data identitas KTP Anda otomatis diambil dari program sebelumnya yang sudah lunas.
            Margin keuntungan (Ribh) dan rincian akhir akan diverifikasi tim VentureGo sebelum akad
            diterbitkan.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Nama Unit Usaha *
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Contoh: Peternakan Ayam Berkah"
                required
                type="text"
                value={businessName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Sektor Usaha *
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
                onChange={(e) => setBusinessSector(e.target.value as AlumniBusinessSector)}
                value={businessSector}
              >
                {(
                  Object.entries(ALUMNI_BUSINESS_SECTOR_LABELS) as [AlumniBusinessSector, string][]
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Alamat Lokasi Usaha *
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="Alamat lengkap tempat usaha dijalankan"
              required
              rows={2}
              value={businessAddress}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Kota / Kabupaten
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
                onChange={(e) => setBusinessCity(e.target.value)}
                placeholder="Contoh: Wonosobo"
                type="text"
                value={businessCity}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Provinsi</label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
                onChange={(e) => setBusinessProvince(e.target.value)}
                placeholder="Contoh: Jawa Tengah"
                type="text"
                value={businessProvince}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Rencana Pengadaan Barang Modal Usaha
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Jelaskan barang/peralatan modal usaha yang akan dibeli"
              rows={2}
              value={businessDescription}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Nominal Kebutuhan Modal (Rp) *
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-purple-600 focus:outline-none"
                min={1000000}
                onChange={(e) => setRequestedAmount(e.target.value.replace(/\D/g, ''))}
                required
                step={500000}
                type="number"
                value={requestedAmount}
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Estimasi pencairan bersih setelah admin 3%: {formatRupiah(netDisbursedEstimate)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Rencana Tenor Angsuran *
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold focus:border-purple-600 focus:outline-none"
                onChange={(e) => setTenorMonths(Number(e.target.value))}
                value={tenorMonths}
              >
                {[6, 12, 18, 24, 36].map((m) => (
                  <option key={m} value={m}>
                    {m} Bulan (Jatuh tempo tgl 25)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
            <p className="text-xs font-bold text-slate-800">
              Rekening Pencairan Dana Usaha (Opsional, dapat dilengkapi nanti)
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-purple-600 focus:outline-none"
                onChange={(e) => setDisbursementBankName(e.target.value)}
                placeholder="Nama Bank (BSI/BRI/BCA)"
                type="text"
                value={disbursementBankName}
              />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-purple-600 focus:outline-none"
                onChange={(e) => setDisbursementBankAccount(e.target.value)}
                placeholder="Nomor Rekening"
                type="text"
                value={disbursementBankAccount}
              />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-purple-600 focus:outline-none"
                onChange={(e) => setDisbursementAccountHolder(e.target.value)}
                placeholder="Atas Nama"
                type="text"
                value={disbursementAccountHolder}
              />
            </div>
          </div>

          <div className="space-y-2 pt-1 text-xs text-slate-600">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                checked={understandsMurabahah}
                className="mt-0.5 size-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                onChange={(e) => setUnderstandsMurabahah(e.target.checked)}
                type="checkbox"
              />
              <span>
                Saya memahami bahwa program ini menggunakan skema syariah{' '}
                <strong>Akad Murabahah</strong> (jual beli barang modal usaha dengan margin yang
                disepakati bersama).
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                checked={acceptsDataProcessing}
                className="mt-0.5 size-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                onChange={(e) => setAcceptsDataProcessing(e.target.checked)}
                type="checkbox"
              />
              <span>
                Saya menyatakan data usaha yang saya berikan benar dan menyetujui pemrosesan data
                oleh tim VentureGo.
              </span>
            </label>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Batal
            </button>
            <button
              className="rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
              disabled={isPending}
              type="submit"
            >
              {isPending ? 'Mengirim Pengajuan…' : 'Kirim Pengajuan Modal Usaha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
