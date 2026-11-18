'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  calculateFullCoverBudget,
  calculateFullCoverCharges,
  createFullCoverBudget,
  FULL_COVER_BUDGET_DEFAULTS,
  formatRupiah,
  normalizeFullCoverBudget,
  type FullCoverBudget,
  validateFullCoverBudget,
} from '@/lib/full-cover-budget'

type FieldKey =
  | 'registrationMcuAmount'
  | 'languageTuitionTotal'
  | 'languageAllowanceMonthly'
  | 'skillTrainingAmount'
  | 'skillAllowanceMonthly'
  | 'departureAllowanceAmount'

const formatInput = (value: number) => (value > 0 ? value.toLocaleString('id-ID') : '')
const parseInput = (value: string) => Number(value.replace(/\D/g, '')) || 0

export function FullCoverBudgetFields({
  fullCoverDetails,
  financialPlan,
  lpkName,
  pending,
  disabled,
  onDirtyChange,
}: {
  fullCoverDetails?: Record<string, unknown> | null
  financialPlan: Record<string, unknown>
  lpkName: string
  pending: boolean
  disabled: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const savedBudgetRaw = financialPlan.fullCoverBudget ?? null
  const savedBudget = normalizeFullCoverBudget(savedBudgetRaw)
  const suggestedMonths = (value: unknown) => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 60 ? parsed : 3
  }
  const initialBudget = createFullCoverBudget(
    savedBudget ?? {
      registrationMcuAmount: 0,
      languageTuitionTotal: 0,
      languageAllowanceMonthly:
        financialPlan.languageAllowanceMonthly === undefined
          ? FULL_COVER_BUDGET_DEFAULTS.languageAllowanceMonthly
          : Number(financialPlan.languageAllowanceMonthly),
      skillTrainingAmount: 0,
      skillAllowanceMonthly:
        financialPlan.skillAllowanceMonthly === undefined
          ? FULL_COVER_BUDGET_DEFAULTS.skillAllowanceMonthly
          : Number(financialPlan.skillAllowanceMonthly),
      departureAllowanceAmount:
        financialPlan.departureAllowanceAmount === undefined
          ? FULL_COVER_BUDGET_DEFAULTS.departureAllowanceAmount
          : Number(financialPlan.departureAllowanceAmount),
    },
    {
      languageMonths:
        savedBudget?.languageMonths ?? suggestedMonths(fullCoverDetails?.languageTrainingMonths),
      skillMonths:
        savedBudget?.skillMonths ?? suggestedMonths(fullCoverDetails?.skillTrainingMonths),
    },
  )
  const [budget, setBudget] = useState<FullCoverBudget>(initialBudget)
  const savedRepaymentMonths = Number(financialPlan.tenorMonths)
  const [repaymentMonths, setRepaymentMonths] = useState(
    Number.isInteger(savedRepaymentMonths) &&
      savedRepaymentMonths >= 1 &&
      savedRepaymentMonths <= 36
      ? savedRepaymentMonths
      : 18,
  )
  const hasSavedRepaymentMonths =
    Number.isInteger(savedRepaymentMonths) &&
    savedRepaymentMonths >= 1 &&
    savedRepaymentMonths <= 36
  const [started, setStarted] = useState(Boolean(savedBudget))
  const [touched, setTouched] = useState(false)
  const languageMonths = budget.languageMonths
  const skillMonths = budget.skillMonths
  const savedJson = savedBudget ? JSON.stringify(savedBudget) : ''
  const currentJson = JSON.stringify(budget)
  const totals = useMemo(() => calculateFullCoverBudget(budget), [budget])
  const charges = calculateFullCoverCharges(totals.nafaqahTotal)
  const savedChargesMatch =
    Number(financialPlan.ujrahTotal) === charges.ujrahTotal &&
    Number(financialPlan.jualaTotal) === charges.jualaTotal
  const isDirty = savedBudget
    ? (savedBudgetRaw as Record<string, unknown>)?.version !== 2 ||
      currentJson !== savedJson ||
      !hasSavedRepaymentMonths ||
      repaymentMonths !== savedRepaymentMonths ||
      !savedChargesMatch
    : (touched && currentJson !== savedJson) || repaymentMonths !== 18
  const monthlyAfterCoe =
    repaymentMonths > 0
      ? Math.floor(
          (totals.nafaqahTotal + charges.ujrahTotal + charges.jualaTotal) / repaymentMonths,
        )
      : 0
  const budgetValidationMessage = validateFullCoverBudget(budget)
  const repaymentValid =
    Number.isInteger(repaymentMonths) && repaymentMonths >= 1 && repaymentMonths <= 36
  const durationValid =
    Number.isInteger(languageMonths) &&
    languageMonths >= 1 &&
    languageMonths <= 60 &&
    Number.isInteger(skillMonths) &&
    skillMonths >= 1 &&
    skillMonths <= 60

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const update = (key: FieldKey, value: string) => {
    const next = { ...budget, [key]: parseInput(value) }
    setBudget(next)
    setStarted(true)
    setTouched(true)
    onDirtyChange(JSON.stringify(next) !== savedJson)
  }

  const updateDuration = (key: 'languageMonths' | 'skillMonths', value: string) => {
    const parsed = value === '' ? 0 : Number(value)
    const next = { ...budget, [key]: Number.isFinite(parsed) ? parsed : 0 }
    setBudget(next)
    setStarted(true)
    setTouched(true)
    onDirtyChange(JSON.stringify(next) !== savedJson)
  }

  const durationField = (key: 'languageMonths' | 'skillMonths', label: string) => (
    <label className="block space-y-1.5 text-xs font-semibold text-slate-700" key={key}>
      <span>{label}</span>
      <span className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0b57d0] focus-within:ring-2 focus-within:ring-[#0b57d0]/15">
        <input
          className="w-full min-w-0 rounded-lg border-0 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-0 focus:!shadow-none focus:outline-none focus-visible:!outline-none focus-visible:!outline-offset-0 focus-visible:!ring-0"
          disabled={disabled}
          inputMode="numeric"
          max={60}
          min={1}
          onChange={(event) => updateDuration(key, event.target.value)}
          placeholder="3"
          step={1}
          type="number"
          value={budget[key] > 0 ? String(budget[key]) : ''}
        />
        <span className="pr-3 text-xs font-medium text-slate-500">bulan</span>
      </span>
      <span className="block text-[11px] font-normal leading-4 text-slate-500">
        Saran awal 3 bulan; sesuaikan dengan durasi LPK.
      </span>
    </label>
  )

  const field = (key: FieldKey, label: string, help: string) => (
    <label className="block space-y-1.5 text-xs font-semibold text-slate-700" key={key}>
      <span>{label}</span>
      <span className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[#0b57d0] focus-within:ring-2 focus-within:ring-[#0b57d0]/15">
        <span className="pl-3 text-sm font-medium text-slate-500">Rp</span>
        <input
          className="w-full min-w-0 rounded-r-lg border-0 bg-transparent px-2 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-0 focus:!shadow-none focus:outline-none focus-visible:!outline-none focus-visible:!outline-offset-0 focus-visible:!ring-0"
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) => update(key, event.target.value)}
          placeholder="0"
          value={formatInput(budget[key])}
        />
      </span>
      <span className="block text-[11px] font-normal leading-4 text-slate-500">{help}</span>
    </label>
  )

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-white via-amber-50/30 to-blue-50/30 shadow-xs">
        <div className="border-b border-amber-100/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="mt-1 text-base font-bold text-slate-900">
                Rincian Nominal Kebutuhan Siswa
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                Tentukan nilai setiap komponen berdasarkan kebutuhan siswa dan konfirmasi LPK.
                Tentukan durasi masing-masing tahap sesuai kesepakatan dengan LPK. Uang saku
                keberangkatan masuk dalam total Nafaqah, dengan pencairan setelah COE terbit.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${savedBudget ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
            >
              {savedBudget
                ? isDirty
                  ? 'Perubahan belum disimpan'
                  : 'Draft tersimpan'
                : 'Belum disimpan'}
            </span>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {durationField('languageMonths', 'Durasi Pendidikan Bahasa Jepang Tahap 1')}
          {durationField('skillMonths', 'Durasi Pelatihan Skill Kerja Tahap 2')}
          {field(
            'registrationMcuAmount',
            'Pendaftaran dan Medical Check Up (MCU)',
            'Nominal total yang dibayarkan kepada klinik/rumah sakit yang ditunjuk.',
          )}
          {field(
            'languageTuitionTotal',
            `Pendidikan Bahasa Jepang Tahap 1 · ${durationValid ? languageMonths : '—'} bulan`,
            `Total biaya untuk seluruh durasi kepada LPK ${lpkName}; tidak dikalikan lagi. Contoh: Rp8.000.000 untuk ${durationValid ? languageMonths : '3'} bulan.`,
          )}
          {field(
            'languageAllowanceMonthly',
            `Uang saku Bahasa Jepang Tahap 1 · ${durationValid ? languageMonths : '—'} bulan`,
            `Usulan awal ${formatRupiah(FULL_COVER_BUDGET_DEFAULTS.languageAllowanceMonthly)} per bulan; subtotal otomatis mengikuti durasi.`,
          )}
          {field(
            'skillTrainingAmount',
            'Pelatihan Skill Kerja Tahap 2 dan pengurusan dokumen',
            'Nilai paket LPK, termasuk paspor, visa, COE, tiket pesawat, pendampingan, dan pemantapan pra-keberangkatan.',
          )}
          {field(
            'skillAllowanceMonthly',
            `Uang saku Skill Kerja Tahap 2 · ${durationValid ? skillMonths : '—'} bulan`,
            `Usulan awal ${formatRupiah(FULL_COVER_BUDGET_DEFAULTS.skillAllowanceMonthly)} per bulan; subtotal otomatis mengikuti durasi.`,
          )}
          {field(
            'departureAllowanceAmount',
            'Uang saku keberangkatan setelah COE terbit',
            `Usulan awal ${formatRupiah(FULL_COVER_BUDGET_DEFAULTS.departureAllowanceAmount)}; dibayarkan setelah COE terbit.`,
          )}
        </div>

        <input name="fullCoverBudget" type="hidden" value={started ? currentJson : ''} />
        <input name="fullCoverRepaymentMonths" type="hidden" value={repaymentMonths} />

        <div className="border-t border-amber-100/80 bg-white/70 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Durasi pelatihan: Bahasa {durationValid ? `${languageMonths} bulan` : 'belum diisi'} ·
              Skill {durationValid ? `${skillMonths} bulan` : 'belum diisi'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center rounded-lg bg-[#0b57d0] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0842a0] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled || !isDirty || pending || !durationValid || !repaymentValid}
                formNoValidate
                type="submit"
              >
                {pending ? 'Menyimpan…' : 'Simpan Draft Rincian'}
              </button>
            </div>
          </div>
          {(!durationValid || !repaymentValid) && (
            <p className="mt-2 text-xs font-medium text-amber-800">
              {!durationValid
                ? 'Durasi pelatihan belum lengkap. Perbaiki data pelatihan siswa sebelum menyimpan rincian.'
                : 'Lama angsuran harus antara 1 dan 36 bulan.'}
            </p>
          )}
          {isDirty && (
            <p className="mt-2 text-xs font-medium text-amber-800">
              Simpan perubahan dan tinjau pratinjau akad sebelum menyetujui rincian biaya.
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Ringkasan Alokasi Pembiayaan</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Rincian kebutuhan, biaya akad, dan estimasi tenor.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
            Full Cover
          </span>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Tahap 1 · Pendidikan', totals.languageTuitionTotal],
            ['Tahap 1 · Uang saku', totals.languageAllowanceTotal],
            ['Tahap 2 · Skill & dokumen', budget.skillTrainingAmount],
            ['Tahap 2 · Uang saku', totals.skillAllowanceTotal],
            ['Pendaftaran & MCU', budget.registrationMcuAmount],
            ['Keberangkatan setelah COE', budget.departureAllowanceAmount],
          ].map(([label, amount]) => (
            <div
              className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
              key={String(label)}
            >
              <span className="block min-h-7 text-[10px] font-medium leading-4 text-slate-500">
                {label}
              </span>
              <strong className="mt-0.5 block text-sm font-bold tabular-nums text-slate-900">
                {formatRupiah(Number(amount))}
              </strong>
            </div>
          ))}
        </div>
        <div className="grid gap-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-100 bg-white px-3 py-2.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              Total Nafaqah
            </span>
            <strong className="mt-1 block text-base font-extrabold tabular-nums text-[#0b57d0]">
              {formatRupiah(totals.nafaqahTotal)}
            </strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Biaya kebutuhan dan uang saku
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Ujrah Wakalah
            </span>
            <strong className="mt-1 block text-base font-bold tabular-nums text-slate-900">
              {formatRupiah(charges.ujrahTotal)}
            </strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">Biaya jasa wakalah</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Ju’alah
            </span>
            <strong className="mt-1 block text-base font-bold tabular-nums text-slate-900">
              {formatRupiah(charges.jualaTotal)}
            </strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Dibayarkan setelah COE terbit
            </span>
          </div>
          <label className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Lama mengangsur
            </span>
            <span className="mt-1 flex items-center gap-2">
              <input
                className="w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/15"
                disabled={disabled}
                max={36}
                min={1}
                onChange={(event) => {
                  setRepaymentMonths(Number(event.target.value) || 0)
                  setStarted(true)
                }}
                type="number"
                value={repaymentMonths || ''}
              />
              <span className="text-xs text-slate-500">bulan</span>
            </span>
            <span className="mt-1 block text-[10px] text-slate-500">
              Angsuran ± {formatRupiah(monthlyAfterCoe)} / bulan
            </span>
          </label>
        </div>
        <p className="px-4 pb-3 text-[11px] leading-4 text-slate-500">
          Total di atas mencakup biaya pihak ketiga dan seluruh uang saku, termasuk alokasi
          keberangkatan. Nilai akad dan tenor tersimpan bersama Budgeting untuk digunakan pada Draft
          Akad.
        </p>
        {savedBudget && budgetValidationMessage && (
          <p className="mt-2 text-xs font-medium text-amber-800">{budgetValidationMessage}</p>
        )}
      </section>
    </div>
  )
}
