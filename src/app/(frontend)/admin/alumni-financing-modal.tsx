'use client'

import { useState, useTransition } from 'react'
import {
  type AlumniBusinessSector,
  ALUMNI_BUSINESS_SECTOR_LABELS,
  calculateMurabahahFinancials,
} from '@/lib/murabahah-financing'
import { createAlumniFinancingApplication } from './actions'
import type { FinancingApplicationRecord } from '@/lib/firebase-data'

function formatRupiah(amount: number): string {
  return `Rp${Number(amount || 0).toLocaleString('id-ID')}`
}

export function AlumniFinancingModal({
  alumnus,
  isOpen,
  onClose,
  onSuccess,
}: {
  alumnus: FinancingApplicationRecord | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (newAppDocId: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [businessSector, setBusinessSector] = useState<AlumniBusinessSector>('PETERNAKAN')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessCity, setBusinessCity] = useState('Wonosobo')
  const [businessProvince, setBusinessProvince] = useState('Jawa Tengah')
  const [requestedAmount, setRequestedAmount] = useState('10000000')
  const [tenorMonths, setTenorMonths] = useState(12)
  const [marginAmount, setMarginAmount] = useState('1500000')

  if (!isOpen || !alumnus) return null

  const principalNum = Math.max(0, Number(requestedAmount) || 0)
  const marginNum = Math.max(0, Number(marginAmount) || 0)
  const preview = calculateMurabahahFinancials({
    principal: principalNum > 0 ? principalNum : 10_000_000,
    marginAmount: marginNum,
    adminFeePercentage: 3,
    tenorMonths,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!businessName.trim()) {
      setError('Nama usaha wajib diisi.')
      return
    }
    if (!businessAddress.trim()) {
      setError('Alamat lokasi usaha wajib diisi.')
      return
    }
    if (principalNum < 1_000_000) {
      setError('Plafon pengadaan minimal Rp1.000.000.')
      return
    }

    startTransition(async () => {
      const res = await createAlumniFinancingApplication({
        previousApplicationDocId: alumnus.id,
        businessName: businessName.trim(),
        businessSector,
        businessAddress: businessAddress.trim(),
        businessCity: businessCity.trim(),
        businessProvince: businessProvince.trim(),
        requestedAmount: principalNum,
        tenorMonths,
        marginAmount: marginNum,
      })

      if (!res.ok) {
        setError(res.message)
      } else {
        onSuccess(res.applicationDocId || '')
      }
    })
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 via-white to-purple-50/50 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm font-bold text-lg">
              🏢
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Buat Pengajuan Modal Usaha Alumni
              </h2>
              <p className="text-xs text-slate-500">
                Penerima: <strong className="text-purple-700">{alumnus.applicantName}</strong> (NIS:{' '}
                {alumnus.studentNumber || 'Alumni'})
              </p>
            </div>
          </div>
          <button
            aria-label="Tutup modal"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">Nama Unit Usaha</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                placeholder="Contoh: Peternakan Unggas Berkah Mandiri"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Bidang / Sektor Usaha</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                value={businessSector}
                onChange={(e) => setBusinessSector(e.target.value as AlumniBusinessSector)}
              >
                {(Object.keys(ALUMNI_BUSINESS_SECTOR_LABELS) as AlumniBusinessSector[]).map(
                  (sector) => (
                    <option key={sector} value={sector}>
                      {ALUMNI_BUSINESS_SECTOR_LABELS[sector]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Kota / Kabupaten</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                value={businessCity}
                onChange={(e) => setBusinessCity(e.target.value)}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-700">
                Alamat Lengkap Lokasi Usaha
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                placeholder="Alamat fisik usaha / kandang / workshop"
                required
                rows={2}
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-900">
              Struktur Pembiayaan Murabahah
            </h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Harga Beli (Tsamān)</label>
                <input
                  type="number"
                  step="500000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-purple-700 focus:border-purple-500 focus:outline-none"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Margin (Ribh)</label>
                <input
                  type="number"
                  step="100000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-purple-500 focus:outline-none"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">Tenor Angsuran</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-purple-500 focus:outline-none"
                  value={tenorMonths}
                  onChange={(e) => setTenorMonths(Number(e.target.value))}
                >
                  <option value={6}>6 Bulan</option>
                  <option value={12}>12 Bulan (1 Tahun)</option>
                  <option value={18}>18 Bulan</option>
                  <option value={24}>24 Bulan (2 Tahun)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-purple-100 pt-2 text-[11px]">
              <div>
                <span className="text-slate-500">Biaya Admin (3% dipotong di muka):</span>
                <span className="ml-1 font-bold text-amber-700">
                  {formatRupiah(preview.adminFeeAmount)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Pencairan Bersih ke Alumni:</span>
                <span className="ml-1 font-extrabold text-emerald-700">
                  {formatRupiah(preview.netDisbursedAmount)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Total Kewajiban:</span>
                <span className="ml-1 font-bold text-slate-900">
                  {formatRupiah(preview.totalObligation)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Angsuran per Bulan:</span>
                <span className="ml-1 font-extrabold text-[#0b57d0]">
                  {formatRupiah(preview.monthlyInstallment)} / bln
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              disabled={isPending}
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-lg bg-purple-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-800 disabled:opacity-50"
              disabled={isPending}
            >
              {isPending ? 'Memproses Pengajuan...' : 'Terbitkan Pengajuan Modal Usaha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
