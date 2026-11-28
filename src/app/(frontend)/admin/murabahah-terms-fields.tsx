'use client'

import { useState, useMemo } from 'react'
import { calculateMurabahahFinancials, type ItemProcurementPlan } from '@/lib/murabahah-financing'

const formatRupiah = (amount: number) => `Rp${Math.round(amount || 0).toLocaleString('id-ID')}`

const formatThousandsInput = (value: string) =>
  value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const parseThousandsInput = (value: string) => Number(value.replace(/\D/g, '')) || 0

export function MurabahahTermsFields({
  financialPlan,
  disabled = false,
}: {
  financialPlan: Record<string, unknown>
  disabled?: boolean
}) {
  const initialPrincipal = Number(financialPlan.principal) || 40_000_000
  const initialMargin = Number(financialPlan.marginAmount) || 11_060_000
  const initialTenor = Number(financialPlan.tenorMonths) || 12
  const initialAdminPct = Number(financialPlan.adminFeePercentage) || 3

  const [principalInput, setPrincipalInput] = useState(
    formatThousandsInput(String(initialPrincipal)),
  )
  const [marginInput, setMarginInput] = useState(formatThousandsInput(String(initialMargin)))
  const [tenorMonths, setTenorMonths] = useState<number>(initialTenor)
  const [adminFeePercentage, setAdminFeePercentage] = useState<number>(initialAdminPct)
  const [items, setItems] = useState<ItemProcurementPlan[]>(() => {
    if (
      Array.isArray(financialPlan.itemProcurementPlan) &&
      financialPlan.itemProcurementPlan.length > 0
    ) {
      return financialPlan.itemProcurementPlan as ItemProcurementPlan[]
    }
    return [
      {
        itemName: 'Tambahan material bangunan peternakan kandang peternak',
        estimatedCost: Math.round(initialPrincipal * 0.6),
      },
      {
        itemName: 'Tambahan pengadaan bibit unggas peternakan',
        estimatedCost: Math.round(initialPrincipal * 0.4),
      },
    ]
  })

  const principal = parseThousandsInput(principalInput)
  const marginAmount = parseThousandsInput(marginInput)

  const calculated = useMemo(() => {
    return calculateMurabahahFinancials({
      principal,
      marginAmount,
      tenorMonths,
      adminFeePercentage,
      itemProcurementPlan: items,
    })
  }, [principal, marginAmount, tenorMonths, adminFeePercentage, items])

  const handleAddItem = () => {
    setItems((prev) => [...prev, { itemName: '', estimatedCost: 0 }])
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (
    index: number,
    field: keyof ItemProcurementPlan,
    value: string | number,
  ) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Hidden inputs to feed formData on form submit */}
      <input type="hidden" name="contractType" value="MURABAHAH" />
      <input type="hidden" name="principal" value={String(principal)} />
      <input type="hidden" name="marginAmount" value={String(marginAmount)} />
      <input type="hidden" name="adminFeePercentage" value={String(adminFeePercentage)} />
      <input type="hidden" name="adminFeeAmount" value={String(calculated.adminFeeAmount)} />
      <input
        type="hidden"
        name="netDisbursedAmount"
        value={String(calculated.netDisbursedAmount)}
      />
      <input type="hidden" name="totalObligation" value={String(calculated.totalObligation)} />
      <input type="hidden" name="tenorMonths" value={String(tenorMonths)} />
      <input
        type="hidden"
        name="monthlyInstallment"
        value={String(calculated.monthlyInstallment)}
      />
      <input type="hidden" name="itemProcurementPlanJson" value={JSON.stringify(items)} />

      {/* SECTION 1: IKHTISAR FINANSIAL MURABAHAH */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tsaman / Pokok */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Harga Pokok (Tsamān)
          </span>
          <strong className="mt-1 block text-2xl font-black text-emerald-950">
            {formatRupiah(principal)}
          </strong>
          <span className="mt-1 block text-[11px] text-emerald-700">
            Nilai beli barang modal ke supplier
          </span>
        </div>

        {/* Administrasi 3% */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Biaya Adm ({adminFeePercentage}%)
          </span>
          <strong className="mt-1 block text-2xl font-black text-rose-600">
            - {formatRupiah(calculated.adminFeeAmount)}
          </strong>
          <span className="mt-1 block text-[11px] text-slate-500">
            Dipotong langsung saat pencairan
          </span>
        </div>

        {/* Dana Bersih Cair */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0b57d0]">
            Dana Bersih Diterima
          </span>
          <strong className="mt-1 block text-2xl font-black text-blue-950">
            {formatRupiah(calculated.netDisbursedAmount)}
          </strong>
          <span className="mt-1 block text-[11px] text-blue-700">
            Ditransfer ke rekening alumni
          </span>
        </div>

        {/* Margin Ribh */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Margin VentureGo (Ribh)
          </span>
          <strong className="mt-1 block text-2xl font-black text-amber-950">
            + {formatRupiah(marginAmount)}
          </strong>
          <span className="mt-1 block text-[11px] text-amber-700">
            Keuntungan jual beli disepakati
          </span>
        </div>
      </div>

      {/* SECTION 2: FORM INPUT PARAMETER */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">Parameter Pembiayaan Murabahah</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Tentukan harga pokok barang, persentase margin, dan tenor angsuran alumni.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Harga Pokok Barang (Rp)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-semibold text-slate-400">
                Rp
              </span>
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pr-3 pl-9 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
                disabled={disabled}
                onChange={(e) => setPrincipalInput(formatThousandsInput(e.target.value))}
                type="text"
                value={principalInput}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Margin Keuntungan / Ribh (Rp)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-semibold text-slate-400">
                Rp
              </span>
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pr-3 pl-9 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
                disabled={disabled}
                onChange={(e) => setMarginInput(formatThousandsInput(e.target.value))}
                type="text"
                value={marginInput}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Tenor Angsuran (Bulan)
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 py-2.5 px-3 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-100"
              disabled={disabled}
              onChange={(e) => setTenorMonths(Number(e.target.value))}
              value={tenorMonths}
            >
              <option value={6}>6 Bulan</option>
              <option value={12}>12 Bulan (1 Tahun)</option>
              <option value={18}>18 Bulan (1,5 Tahun)</option>
              <option value={24}>24 Bulan (2 Tahun)</option>
            </select>
          </div>
        </div>

        {/* Ringkasan Kewajiban & Cicilan */}
        <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-900 to-teal-900 p-5 text-white shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                Total Harga Jual Murabahah (Kewajiban)
              </span>
              <p className="mt-1 text-3xl font-black tracking-tight text-white">
                {formatRupiah(calculated.totalObligation)}
              </p>
              <span className="mt-1 block text-xs text-emerald-200/80">
                Harga pokok {formatRupiah(principal)} + Keuntungan {formatRupiah(marginAmount)}
              </span>
            </div>

            <div className="sm:border-l sm:border-white/20 sm:pl-6 text-left sm:text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                Angsuran per Bulan ({tenorMonths}x)
              </span>
              <p className="mt-1 text-2xl font-black text-emerald-100">
                {formatRupiah(calculated.monthlyInstallment)}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-50">
                Jatuh tempo setiap tanggal 25
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: DAFTAR OBJEK BARANG MODAL USAHA (PASAL 2 AYAT 1) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Rincian Objek Jual Beli Barang Modal (Pasal 2)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Daftar barang produktif riil yang dibelikan VentureGo untuk keperluan usaha alumni.
            </p>
          </div>
          {!disabled && (
            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
              onClick={handleAddItem}
              type="button"
            >
              + Tambah Barang
            </button>
          )}
        </div>

        <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {items.map((item, index) => (
            <div className="flex items-center gap-3 py-3" key={index}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                {index + 1}
              </span>
              <div className="flex-1">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-50"
                  disabled={disabled}
                  onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                  placeholder="Nama barang modal (misal: Tambahan material kandang ayam)"
                  type="text"
                  value={item.itemName}
                />
              </div>
              <div className="w-36 shrink-0">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 disabled:bg-slate-50"
                  disabled={disabled}
                  onChange={(e) =>
                    handleItemChange(index, 'estimatedCost', parseThousandsInput(e.target.value))
                  }
                  placeholder="Estimasi Biaya"
                  type="text"
                  value={formatThousandsInput(String(item.estimatedCost || ''))}
                />
              </div>
              {!disabled && items.length > 1 && (
                <button
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => handleRemoveItem(index)}
                  title="Hapus baris"
                  type="button"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: SIMULASI JADWAL ANGSURAN BULANAN (TANGGAL 25) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Jadwal Angsuran Murabahah ({calculated.schedule.length} Bulan)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Kewajiban pembayaran angsuran wajib diselesaikan setiap tanggal 25 bulan berjalan.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0b57d0]">
            Jatuh Tempo Tgl 25
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
          {calculated.schedule.map((row) => (
            <div className="flex items-center justify-between py-2.5 text-xs" key={row.installment}>
              <div className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-slate-100 font-bold text-slate-600">
                  {row.installment}
                </span>
                <div>
                  <strong className="block text-slate-800">Angsuran ke-{row.installment}</strong>
                  <span className="text-[11px] text-slate-500">Jatuh Tempo: {row.dueDate}</span>
                </div>
              </div>
              <div className="text-right">
                <strong className="block font-bold text-slate-900">
                  {formatRupiah(row.amount)}
                </strong>
                <span className="text-[10px] text-slate-400">
                  Sisa Saldo: {formatRupiah(row.remainingBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
