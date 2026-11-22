'use client'

import { useState } from 'react'
import type { FinancingApplicationRecord } from '@/lib/firebase-data'
import {
  type AdditionalRecipient,
  type TransferDetailsState,
  formatThousandsNumber,
  parseThousandsInput,
} from '@/lib/transfer-summary'

export function TransferBreakdownModal({
  target,
  state,
  messageText,
  copied,
  onClose,
  onCopy,
  onReset,
  onUpdateState,
  onAddRecipient,
  onRemoveRecipient,
  onUpdateRecipient,
  onMessageTextChange,
}: {
  target: { app: FinancingApplicationRecord; index: number }
  state: TransferDetailsState
  messageText: string
  copied: boolean
  onClose: () => void
  onCopy: () => void
  onReset: () => void
  onUpdateState: (updater: (prev: TransferDetailsState) => TransferDetailsState) => void
  onAddRecipient: () => void
  onRemoveRecipient: (id: string) => void
  onUpdateRecipient: (id: string, patch: Partial<AdditionalRecipient>) => void
  onMessageTextChange: (text: string) => void
}) {
  const [showLpkConfig, setShowLpkConfig] = useState(false)
  const [showStudentConfig, setShowStudentConfig] = useState(false)

  const formatDisplayId = (id: string) => {
    if (!id) return ''
    const parts = id.split('-')
    if (parts.length >= 2) return `VSV-${parts[parts.length - 1]}`
    return id
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="transfer-detail-title"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-slate-300 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {/* Header Formal */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-2xs">
              <svg
                aria-hidden="true"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900" id="transfer-detail-title">
                Lembar Instruksi Transfer Pencairan — Dana Keberangkatan
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">
                  {target.index + 1}. {target.app.applicantName}
                </span>{' '}
                · ID {formatDisplayId(target.app.applicationId)}
              </p>
            </div>
          </div>
          <button
            aria-label="Tutup popup"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Body Dua Kolom (Grid Formal) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* KOLOM KIRI: LEMBAR DATA PENCAIRAN FORMAL (7 Kolom) */}
            <div className="space-y-4 lg:col-span-7">
              {/* Seksi 1: Ringkasan Plafon & Jasa Administrasi */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    1. Alokasi Plafon & Biaya Administrasi
                  </span>
                </div>
                <div className="divide-y divide-slate-150 text-xs">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-medium text-slate-600">Plafon Pembiayaan</span>
                    <strong className="text-sm font-bold text-slate-900">
                      Rp{formatThousandsNumber(state.principal)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="font-medium text-slate-600">Jasa Administrasi (5%)</span>
                      <p className="text-[11px] text-slate-500">
                        60% PT Vworks: Rp{formatThousandsNumber(state.adminVworks)} · 40%
                        Operasional: Rp{formatThousandsNumber(state.adminOperasional)}
                      </p>
                    </div>
                    <strong className="text-xs font-bold text-[#0b57d0]">
                      Rp{formatThousandsNumber(state.adminFee)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50/50 px-4 py-2 text-[11px]">
                    <span className="text-slate-500">
                      Total Bersih yang Dicairkan (Plafon − Admin 5%)
                    </span>
                    <span className="font-semibold text-slate-800">
                      Rp{formatThousandsNumber(state.principal - state.adminFee)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seksi 2: Daftar Rekening Tujuan Transfer */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    2. Rekening Tujuan Pencairan
                  </span>
                  <button
                    className="text-[11px] font-semibold text-[#0b57d0] transition hover:underline"
                    onClick={onAddRecipient}
                    type="button"
                  >
                    + Tambah Komisi / LPK Lain
                  </button>
                </div>

                <div className="divide-y divide-slate-200 text-xs">
                  {/* 2A. Sisa Beban LPK */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">A. Sisa Beban LPK</span>
                        <p className="mt-0.5 text-slate-700">
                          {state.lpkBank
                            ? `${state.lpkBank}. ${state.lpkAccountName}`
                            : state.lpkAccountName}
                        </p>
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {state.lpkAccountNumber || 'Nomor rekening belum diatur'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Ket. {state.lpkNotes || target.app.applicantName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">
                          Rp{formatThousandsNumber(state.lpkAmount)}
                        </span>
                        <div className="mt-1">
                          <button
                            className="text-[11px] text-[#0b57d0] hover:underline"
                            onClick={() => setShowLpkConfig((prev) => !prev)}
                            type="button"
                          >
                            {showLpkConfig ? 'Selesai' : 'Ubah Norek LPK'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {showLpkConfig && (
                      <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50/70 p-3 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">
                              Nominal Beban LPK (Rp)
                            </span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = parseThousandsInput(e.target.value)
                                onUpdateState((prev) => ({ ...prev, lpkAmount: val }))
                              }}
                              type="text"
                              value={formatThousandsNumber(state.lpkAmount)}
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">Bank LPK</span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({ ...prev, lpkBank: val }))
                              }}
                              placeholder="BRI"
                              type="text"
                              value={state.lpkBank}
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">
                              Atas Nama Rekening LPK
                            </span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  lpkAccountName: val,
                                }))
                              }}
                              type="text"
                              value={state.lpkAccountName}
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">No. Rekening LPK</span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  lpkAccountNumber: val,
                                }))
                              }}
                              type="text"
                              value={state.lpkAccountNumber}
                            />
                          </label>
                        </div>
                        <label className="block space-y-0.5">
                          <span className="text-[10px] text-slate-500">Keterangan Transfer</span>
                          <input
                            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                            onChange={(e) => {
                              const val = e.target.value
                              onUpdateState((prev) => ({ ...prev, lpkNotes: val }))
                            }}
                            type="text"
                            value={state.lpkNotes}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* 2B. Penerima Tambahan (Komisi / LPK Lain) */}
                  {state.additionalRecipients.map((rec, idx) => (
                    <div className="bg-slate-50/40 p-4" key={rec.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-900">
                            B.{idx + 1}. {rec.title || 'Pencairan Komisi / LPK Lain'}
                          </span>
                          <p className="mt-0.5 text-slate-700">
                            {rec.bank ? `${rec.bank}. ` : ''}
                            {rec.accountName || '—'}
                          </p>
                          <p className="font-mono text-xs font-semibold text-slate-800">
                            {rec.accountNumber || '—'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Ket. {rec.notes || target.app.applicantName}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-900">
                            Rp{formatThousandsNumber(rec.amount)}
                          </span>
                          <div className="mt-1">
                            <button
                              className="text-[11px] text-red-600 hover:underline"
                              onClick={() => onRemoveRecipient(rec.id)}
                              type="button"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2 text-xs">
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          onChange={(e) => onUpdateRecipient(rec.id, { title: e.target.value })}
                          placeholder="Judul Keperluan"
                          type="text"
                          value={rec.title}
                        />
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                          onChange={(e) => {
                            const val = parseThousandsInput(e.target.value)
                            onUpdateRecipient(rec.id, { amount: val })
                          }}
                          placeholder="Nominal (Rp)"
                          type="text"
                          value={formatThousandsNumber(rec.amount)}
                        />
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          onChange={(e) => onUpdateRecipient(rec.id, { bank: e.target.value })}
                          placeholder="Bank (misal BRI)"
                          type="text"
                          value={rec.bank}
                        />
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          onChange={(e) =>
                            onUpdateRecipient(rec.id, { accountName: e.target.value })
                          }
                          placeholder="Atas Nama Rekening"
                          type="text"
                          value={rec.accountName}
                        />
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900"
                          onChange={(e) =>
                            onUpdateRecipient(rec.id, { accountNumber: e.target.value })
                          }
                          placeholder="No. Rekening"
                          type="text"
                          value={rec.accountNumber}
                        />
                        <input
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          onChange={(e) => onUpdateRecipient(rec.id, { notes: e.target.value })}
                          placeholder="Keterangan"
                          type="text"
                          value={rec.notes}
                        />
                      </div>
                    </div>
                  ))}

                  {/* 2C. Uang Saku Siswa (Nafaqah) */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">
                            C. Uang Saku Siswa (Nafaqah)
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                            Otomatis Sisa
                          </span>
                        </div>
                        <p className="mt-0.5 text-slate-700">
                          {state.applicantBank
                            ? `${state.applicantBank}. ${state.applicantAccountName}`
                            : state.applicantAccountName}
                        </p>
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {state.applicantAccountNumber || 'Nomor rekening belum diatur'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Ket. {state.applicantNotes || `Uang Saku ${target.app.applicantName}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">
                          Rp{formatThousandsNumber(state.pocketMoney)}
                        </span>
                        <div className="mt-1">
                          <button
                            className="text-[11px] text-[#0b57d0] hover:underline"
                            onClick={() => setShowStudentConfig((prev) => !prev)}
                            type="button"
                          >
                            {showStudentConfig ? 'Selesai' : 'Ubah Rekening Siswa'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {showStudentConfig && (
                      <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50/70 p-3 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">Bank Siswa</span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  applicantBank: val,
                                }))
                              }}
                              placeholder="BNI"
                              type="text"
                              value={state.applicantBank}
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">Atas Nama Rekening</span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  applicantAccountName: val,
                                }))
                              }}
                              type="text"
                              value={state.applicantAccountName}
                            />
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">Nomor Rekening Siswa</span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  applicantAccountNumber: val,
                                }))
                              }}
                              type="text"
                              value={state.applicantAccountNumber}
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-slate-500">
                              Keterangan Transfer Siswa
                            </span>
                            <input
                              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#0b57d0] focus:outline-none"
                              onChange={(e) => {
                                const val = e.target.value
                                onUpdateState((prev) => ({
                                  ...prev,
                                  applicantNotes: val,
                                }))
                              }}
                              type="text"
                              value={state.applicantNotes}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2D. Operasional Pencairan */}
                  <div className="bg-slate-50/50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">
                          D. Notes: Operasional Pencairan
                        </span>
                        <p className="mt-0.5 text-slate-700">
                          {state.operasionalBank || 'Jenius SMBC Indonesia'}
                        </p>
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {state.operasionalAccountNumber || '90020422216'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {state.operasionalRecipientName || 'Panut'} (Staf VentureGo)
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">
                          Rp{formatThousandsNumber(state.adminOperasional)}
                        </span>
                        <p className="mt-0.5 text-[10px] text-slate-500">40% Jasa Administrasi</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* KOLOM KANAN: FORMAT PESAN WHATSAPP & SALIN (5 Kolom) */}
            <div className="flex flex-col lg:col-span-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-900">
                  Format Pesan WhatsApp (Finance)
                </span>
                <button
                  className="text-[11px] font-medium text-[#0b57d0] hover:underline"
                  onClick={onReset}
                  title="Kembalikan nilai ke perhitungan awal"
                  type="button"
                >
                  Reset Default
                </button>
              </div>

              <p className="mt-1.5 text-[11px] text-slate-500 leading-normal">
                Pesan di bawah ini sinkron otomatis dengan data di sebelah kiri dan siap dikirimkan
                ke bagian finance/tukang transfer:
              </p>

              <textarea
                className="mt-2.5 flex-1 min-h-[340px] w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-900 outline-none transition focus:border-[#0b57d0] focus:bg-white focus:ring-1 focus:ring-[#0b57d0]"
                id="transfer-whatsapp-textarea"
                onChange={(e) => onMessageTextChange(e.target.value)}
                rows={18}
                value={messageText}
              />

              <button
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold text-white shadow-xs transition ${
                  copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#0b57d0] hover:bg-[#0842a0]'
                }`}
                onClick={onCopy}
                type="button"
              >
                {copied ? (
                  <>
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M4.5 12.75l6 6 9-13.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Tersalin ke Clipboard!
                  </>
                ) : (
                  <>
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Salin Rincian Transfer (WhatsApp)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Formal */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-6 py-3">
          <span className="text-[11px] text-slate-500">
            Pencairan diverifikasi berdasarkan persetujuan nominal akad.
          </span>
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            Tutup
          </button>
        </div>
      </section>
    </div>
  )
}
