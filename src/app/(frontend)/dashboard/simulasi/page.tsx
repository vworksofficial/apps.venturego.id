'use client'

import { useMemo, useState } from 'react'
import { calculateWakalahPlan, formatRupiah, getFinancingOptions } from '@/lib/financing-plan'
import { DashboardCard, DashboardIcon, DashboardScaffold } from '../_components/dashboard-ui'
import { FormSelect } from '../../_components/form-select'

export default function SimulationPage() {
  const [amount, setAmount] = useState<number>(getFinancingOptions('JAPAN')[0].amount)
  const [destination, setDestination] = useState<'JAPAN' | 'TURKEY'>('JAPAN')
  const plan = useMemo(() => calculateWakalahPlan(amount), [amount])
  const adminFee = Math.round(amount * 0.05)
  const netNafaqah = amount - adminFee

  return (
    <DashboardScaffold
      active="home"
      subtitle="Estimasi Wakalah bil Ujrah"
      title="Simulasi pembiayaan"
    >
      <DashboardCard className="brand-card p-5 text-white ring-0">
        <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
          <DashboardIcon name="calculator" />
        </span>
        <p className="mt-4 text-xs text-blue-100">Estimasi angsuran bulanan</p>
        <strong className="mt-2 block text-2xl tracking-tight">
          {formatRupiah(plan.monthlyInstallment)}
        </strong>
        <span className="mt-2 block text-[11px] text-blue-200">
          Selama {plan.tenorMonths} bulan
        </span>
      </DashboardCard>

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Pilih negara tujuan</h2>
        <FormSelect
          value={destination}
          onChange={(value) => {
            const nextDestination = value as 'JAPAN' | 'TURKEY'
            setDestination(nextDestination)
            setAmount(getFinancingOptions(nextDestination)[0].amount)
          }}
          placeholder="Pilih negara tujuan"
          options={[
            { value: 'JAPAN', label: 'Jepang', destination: 'JAPAN' },
            { value: 'TURKEY', label: 'Turki', destination: 'TURKEY' },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Pilih kebutuhan pembiayaan</h2>
        <FormSelect
          value={String(amount)}
          onChange={(value) => setAmount(Number(value))}
          placeholder="Pilih nilai pembiayaan"
          options={getFinancingOptions(destination).map((option) => ({
            value: String(option.amount),
            label: option.label,
          }))}
        />
      </section>

      <section aria-labelledby="estimate-details-title">
        <h2 className="mb-2 text-sm font-bold text-slate-900" id="estimate-details-title">
          Rincian estimasi
        </h2>
        {[
          ['Negara tujuan', destination === 'JAPAN' ? 'Jepang' : 'Turki'],
          ['Nominal pembiayaan', formatRupiah(amount)],
          ['Jasa administrasi (5%)', formatRupiah(adminFee)],
          ['Nafaqah setelah jasa administrasi', formatRupiah(netNafaqah)],
          ['Total ujrah', formatRupiah(plan.ujrahTotal)],
          ['Total kewajiban', formatRupiah(plan.totalObligation)],
          ['Tenor', `${plan.tenorMonths} bulan`],
          ['Angsuran terakhir', formatRupiah(plan.finalInstallment)],
        ].map(([label, value]) => (
          <div
            className={`flex items-center justify-between border-b border-slate-200/80 py-3 text-xs ${
              label === 'Total kewajiban' ? 'font-bold text-slate-900' : ''
            }`}
            key={label}
          >
            <span className={label === 'Total kewajiban' ? 'text-slate-900' : 'text-slate-500'}>
              {label}
            </span>
            <strong
              className={label === 'Total kewajiban' ? 'text-[var(--primary)]' : 'text-slate-800'}
            >
              {value}
            </strong>
          </div>
        ))}
      </section>

      <div className="flex gap-3 rounded-2xl bg-blue-50 p-4">
        <DashboardIcon name="info" className="size-5 shrink-0 text-[var(--primary)]" />
        <p className="text-[11px] leading-5 text-slate-600">
          Hasil ini merupakan simulasi. Nilai akhir mengikuti verifikasi program, kebutuhan, dan
          akad pembiayaan.
        </p>
      </div>
    </DashboardScaffold>
  )
}
