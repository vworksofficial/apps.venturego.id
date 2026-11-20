'use server'

import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { APPLICATION_STATUSES, PRICING_STATUSES } from '@/lib/firebase-data'
import {
  calculateInstallmentSchedule,
  coerceFinancingLines,
  deriveDepartureFinancials,
  deriveDepartureFirstPaymentDate,
  getFinancingLineTotal,
  serializeStable,
  withDraft1Defaults,
  type DepartureFinancials,
  type FinancingCostLine,
} from '@/lib/departure-financing'
import { deleteDriveFile, uploadDriveFile } from '@/lib/gdrive'
import { ensureApplicationDriveFolder, promoteApplicationFolder } from '@/lib/drive-folders'
import { buildDocumentFileName } from '@/lib/documents'
import { buildAkadDocument } from '@/lib/akad-document'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { ensureStudentNumber, studentNumberSequence } from '@/lib/student-number'
import { FINANCING_OPTIONS } from '@/lib/financing-plan'
import {
  calculateFullCoverBudget,
  calculateFullCoverCharges,
  normalizeFullCoverBudget,
  validateFullCoverBudget,
  type FullCoverBudget,
} from '@/lib/full-cover-budget'

type ActionResult = { ok: true } | { ok: false; message: string }

const assertStaffDocumentId = async (
  documentId: string,
): Promise<{ staff: Awaited<ReturnType<typeof getStaffSession>>; error: ActionResult | null }> => {
  const staff = await getStaffSession()
  if (!staff)
    return {
      staff: null,
      error: { ok: false, message: 'Sesi staf berakhir. Silakan masuk kembali.' },
    }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(documentId)) {
    return { staff, error: { ok: false, message: 'Pengajuan tidak valid.' } }
  }
  return { staff, error: null }
}

const appendFinancialHistory = (applicationData: DocumentData, entry: Record<string, unknown>) => {
  const previousHistory = Array.isArray(applicationData.financialPlanHistory)
    ? applicationData.financialPlanHistory
    : []
  return [...previousHistory.slice(-19), entry]
}

const validateDepartureApproval = (
  applicationData: DocumentData,
  plan: Record<string, unknown>,
  nafaqahItems: FinancingCostLine[],
  ujrahItems: FinancingCostLine[],
  refundTotal: number,
  refundEvidenceReference: string,
): string | null => {
  const hppInvoice = Number(plan.hppLpkInvoiceAmount)
  const hppPocketMoney = Number(plan.hppPocketMoneyAmount)
  const requestedAmount = Number(applicationData.departureDetails?.requestedFinancingAmount)
  const storedPrincipal = Number(plan.principal)
  const principal =
    Number.isSafeInteger(storedPrincipal) && storedPrincipal > 0 ? storedPrincipal : requestedAmount
  const languageMonths = Number(plan.wakalahLanguageMonths)
  const skillMonths = Number(plan.wakalahSkillMonths)
  const documentReturnDays = Number(plan.wakalahDocumentReturnBusinessDays)
  const writtenWarningCount = Number(plan.wakalahWrittenWarningCount)
  const graceDays = Number(plan.wakalahGraceDays)
  const derived = deriveDepartureFinancials({
    principal,
    invoice: hppInvoice,
    lpkName: String(applicationData.lpkName ?? ''),
  })
  const nafaqahTotal = Number(plan.nafaqahTotal)
  const ujrahTotal = Number(plan.ujrahTotal)
  if (
    !derived.valid ||
    hppInvoice < 1 ||
    !Number.isSafeInteger(hppPocketMoney) ||
    hppPocketMoney < 0 ||
    hppInvoice + hppPocketMoney !== derived.netAmount ||
    hppPocketMoney !== derived.pocketMoney ||
    Number(plan.qardhAmount) !== hppPocketMoney ||
    !Number.isSafeInteger(nafaqahTotal) ||
    nafaqahTotal !== hppInvoice ||
    !Number.isSafeInteger(ujrahTotal) ||
    ujrahTotal !== derived.ujrahTotal ||
    serializeStable(nafaqahItems) !== serializeStable(derived.nafaqahItems) ||
    serializeStable(ujrahItems) !== serializeStable(derived.ujrahItems) ||
    !Number.isInteger(languageMonths) ||
    languageMonths < 1 ||
    languageMonths > 60 ||
    !Number.isInteger(skillMonths) ||
    skillMonths < 1 ||
    skillMonths > 60 ||
    !Number.isInteger(documentReturnDays) ||
    documentReturnDays < 1 ||
    documentReturnDays > 90 ||
    !Number.isInteger(writtenWarningCount) ||
    writtenWarningCount < 1 ||
    writtenWarningCount > 10 ||
    !Number.isInteger(graceDays) ||
    graceDays < 1 ||
    graceDays > 90
  ) {
    return 'Rincian Lampiran A harus sesuai turunan otomatis: invoice LPK + uang saku = dana bersih setelah potongan admin 5% (Nafaqah = invoice, Ujrah = wakalah 2,4% × 12 + administrasi 5%). Periksa kartu Rincian penggunaan dana.'
  }
  const installmentCount = Number(plan.installmentCount)
  const firstPaymentDate = String(plan.firstPaymentDate ?? '')
  if (
    !Number.isInteger(installmentCount) ||
    installmentCount < 1 ||
    installmentCount > 36 ||
    !firstPaymentDate ||
    (refundTotal > 0 && !refundEvidenceReference)
  ) {
    return 'Lengkapi jumlah dan tanggal angsuran, serta bukti untuk setiap refund, sebelum verifikasi.'
  }
  const estimatedDeparture = applicationData.eligibility?.estimatedDeparture
  if (typeof estimatedDeparture === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(estimatedDeparture)) {
    const [departureYear, departureMonth] = estimatedDeparture.split('-').map(Number)
    const [paymentYear, paymentMonth] = firstPaymentDate.split('-').map(Number)
    if (paymentYear * 12 + paymentMonth <= departureYear * 12 + departureMonth) {
      return 'Tanggal angsuran pertama harus berada pada bulan setelah perkiraan keberangkatan. Perbarui perkiraan jika jadwal keberangkatan berubah.'
    }
  }
  return null
}

const validateFullCoverApproval = (
  applicationData: DocumentData,
  plan: Record<string, unknown>,
  options: { requireAkadTerms?: boolean } = {},
): string | null => {
  if (applicationData.destination !== 'JAPAN') {
    return 'Akad contoh hanya menetapkan Ju’alah untuk Jepang; konfirmasi ketentuan negara tujuan terlebih dahulu.'
  }
  const { nafaqahTotal, ujrahTotal, jualaTotal, tenorMonths } = plan as Record<string, number>
  const budget = normalizeFullCoverBudget(plan.fullCoverBudget) ?? undefined
  const hppInvoice = Number(plan.hppLpkInvoiceAmount)
  const hppPocketMoney = Number(plan.hppPocketMoneyAmount)
  const fullCoverDetails = (applicationData.fullCoverDetails ?? {}) as Record<string, unknown>
  const languageMonths = Number(budget?.languageMonths ?? fullCoverDetails.languageTrainingMonths)
  const skillMonths = Number(budget?.skillMonths ?? fullCoverDetails.skillTrainingMonths)
  const commitmentAmount = Number(plan.commitmentCompensationAmount)
  const commitmentDays = Number(plan.commitmentSettlementDays ?? 30)
  const installmentPaymentDay = Number(plan.installmentPaymentDay ?? 28)
  const budgetError = budget ? validateFullCoverBudget(budget) : null
  const budgetTotals = budget ? calculateFullCoverBudget(budget) : null
  const expectedCharges = budgetTotals ? calculateFullCoverCharges(budgetTotals.nafaqahTotal) : null
  if (budgetError) return budgetError
  if (!budget || !budgetTotals) {
    return 'Simpan rincian kebutuhan Full Cover pada tab Budgeting terlebih dahulu.'
  }
  if (
    expectedCharges &&
    (ujrahTotal !== expectedCharges.ujrahTotal || jualaTotal !== expectedCharges.jualaTotal)
  ) {
    return 'Simpan Budgeting terlebih dahulu agar Ujrah Wakalah dan Ju’alah mengikuti alokasi pembiayaan terbaru.'
  }
  if (!Number.isSafeInteger(hppInvoice) || !Number.isSafeInteger(hppPocketMoney)) {
    return 'Simpan ulang rincian Budgeting agar alokasi dana ke LPK dan uang saku tersimpan.'
  }
  if (
    hppInvoice !== budgetTotals.providerTotal ||
    hppPocketMoney !== budgetTotals.studentAllowanceTotal
  ) {
    return 'Alokasi dana ke LPK atau uang saku berbeda dari rincian Budgeting. Simpan ulang Budgeting.'
  }
  if (budgetTotals.nafaqahTotal !== nafaqahTotal) {
    return 'Total Nafaqah harus berasal dari penjumlahan seluruh komponen pada Budgeting.'
  }
  if (
    !Number.isInteger(languageMonths) ||
    languageMonths < 1 ||
    languageMonths > 60 ||
    !Number.isInteger(skillMonths) ||
    skillMonths < 1 ||
    skillMonths > 60 ||
    !Number.isSafeInteger(Number(plan.languageAllowanceMonthly)) ||
    Number(plan.languageAllowanceMonthly) < 0 ||
    !Number.isSafeInteger(Number(plan.skillAllowanceMonthly)) ||
    Number(plan.skillAllowanceMonthly) < 0 ||
    !Number.isSafeInteger(Number(plan.departureAllowanceAmount)) ||
    Number(plan.departureAllowanceAmount) < 0
  ) {
    return 'Periksa durasi pelatihan dan rincian uang saku pada Budgeting.'
  }
  if (
    ![nafaqahTotal, ujrahTotal, jualaTotal, tenorMonths].every(Number.isFinite) ||
    tenorMonths < 1 ||
    tenorMonths > 36
  ) {
    return 'Isi dan verifikasi Nafaqah, Ujrah, Ju’alah, serta tenor sebelum menyetujui biaya.'
  }
  if (options.requireAkadTerms) {
    const expectedCommitmentAmount = Math.round(budgetTotals.nafaqahTotal * 0.2)
    if (!Number.isSafeInteger(commitmentAmount) || commitmentAmount !== expectedCommitmentAmount) {
      return 'Simpan Draft Akad agar biaya komitmen mengikuti Total Nafaqah.'
    }
    if (!Number.isInteger(commitmentDays) || commitmentDays < 1 || commitmentDays > 90) {
      return 'Lengkapi tenggat penyelesaian komitmen (1–90 hari) pada tab Draft Akad.'
    }
    if (
      !Number.isInteger(installmentPaymentDay) ||
      installmentPaymentDay < 1 ||
      installmentPaymentDay > 31
    ) {
      return 'Isi tanggal pembayaran angsuran antara 1 dan 31 pada tab Draft Akad.'
    }
  }
  return null
}

export async function saveFinancialPlan(
  documentId: string,
  financialValues: Record<string, string>,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  const financialFields = [
    'nafaqahTotal',
    'ujrahTotal',
    'totalObligation',
    'jualaTotal',
    'tenorMonths',
    'monthlyInstallment',
    'qardhAmount',
    'installmentCount',
    'hppLpkInvoiceAmount',
    'hppPocketMoneyAmount',
    'wakalahLanguageMonths',
    'wakalahSkillMonths',
    'wakalahDocumentReturnBusinessDays',
    'wakalahWrittenWarningCount',
    'wakalahGraceDays',
    'languageAllowanceMonthly',
    'skillAllowanceMonthly',
    'departureAllowanceAmount',
    'commitmentCompensationAmount',
    'commitmentSettlementDays',
    'installmentPaymentDay',
  ] as const
  const financialNumbers: Partial<Record<(typeof financialFields)[number], number>> = {}
  for (const field of financialFields) {
    const value = financialValues?.[field]
    if (typeof value !== 'string' || value.length > 20) {
      return { ok: false, message: 'Rincian biaya tidak valid.' }
    }
    if (value.trim() === '') continue
    if (!/^\d+$/.test(value)) {
      return { ok: false, message: 'Masukkan angka yang valid pada rincian biaya.' }
    }
    financialNumbers[field] = Number(value)
    if (!Number.isSafeInteger(financialNumbers[field])) {
      return { ok: false, message: 'Masukkan angka yang valid pada rincian biaya.' }
    }
  }
  if (
    financialNumbers.tenorMonths !== undefined &&
    (!Number.isInteger(financialNumbers.tenorMonths) ||
      financialNumbers.tenorMonths < 1 ||
      financialNumbers.tenorMonths > 36)
  ) {
    return { ok: false, message: 'Tenor harus antara 1 dan 36 bulan.' }
  }
  if (
    financialNumbers.installmentPaymentDay !== undefined &&
    (!Number.isInteger(financialNumbers.installmentPaymentDay) ||
      financialNumbers.installmentPaymentDay < 1 ||
      financialNumbers.installmentPaymentDay > 31)
  ) {
    return { ok: false, message: 'Tanggal pembayaran angsuran harus antara 1 dan 31.' }
  }
  const textFields = [
    'nafaqahItems',
    'ujrahItems',
    'qardhDisbursed',
    'akadDate',
    'firstPaymentDate',
    'finalAgreementReference',
    'settlementNotes',
    'refundEvidenceReference',
    'refundTotal',
    'wakalahOtherUjrahService',
    'wakalahMediator',
    'wakalahDisputeInstitution',
    'lpkWitnessName',
    'fullCoverBudget',
    'fullCoverRepaymentMonths',
  ] as const
  if (textFields.some((field) => typeof financialValues?.[field] !== 'string')) {
    return { ok: false, message: 'Rincian akad atau penyelesaian tidak valid.' }
  }
  const qardhDisbursed = financialValues?.qardhDisbursed === 'true'
  const akadDate = financialValues?.akadDate ?? ''
  const firstPaymentDate = financialValues?.firstPaymentDate ?? ''
  const finalAgreementReference = financialValues?.finalAgreementReference?.trim() ?? ''
  const settlementNotes = financialValues?.settlementNotes?.trim() ?? ''
  const refundEvidenceReference = financialValues?.refundEvidenceReference?.trim() ?? ''
  const refundValue = financialValues?.refundTotal ?? ''
  if (
    !['true', 'false'].includes(financialValues?.qardhDisbursed ?? '') ||
    akadDate.length > 10 ||
    firstPaymentDate.length > 10 ||
    finalAgreementReference.length > 300 ||
    settlementNotes.length > 1_000 ||
    refundEvidenceReference.length > 300 ||
    refundValue.length > 20 ||
    (financialValues.wakalahOtherUjrahService?.length ?? 0) > 200 ||
    (financialValues.wakalahMediator?.length ?? 0) > 200 ||
    (financialValues.wakalahDisputeInstitution?.length ?? 0) > 200 ||
    financialValues.lpkWitnessName.length > 120 ||
    financialValues.fullCoverBudget.length > 8_000 ||
    financialValues.fullCoverRepaymentMonths.length > 3 ||
    (refundValue !== '' && !/^\d+$/.test(refundValue))
  ) {
    return { ok: false, message: 'Rincian akad atau penyelesaian tidak valid.' }
  }
  if (!calculateInstallmentSchedule(0, 1, akadDate)) {
    return { ok: false, message: 'Tanggal akad tidak valid.' }
  }
  const refundTotal = refundValue === '' ? 0 : Number(refundValue)
  if (!Number.isSafeInteger(refundTotal)) {
    return { ok: false, message: 'Nominal pengembalian tidak valid.' }
  }
  if (firstPaymentDate && !calculateInstallmentSchedule(0, 1, firstPaymentDate)) {
    return { ok: false, message: 'Tanggal angsuran pertama tidak valid.' }
  }
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    if (applicationData.financialPlan?.akadDocument) {
      return { ok: false, message: 'Dokumen akad telah terbit. Rincian biaya terkunci.' }
    }
    const currentPricingStatus = String(applicationData.financialPlan?.pricingStatus ?? 'ESTIMATED')
    if (!PRICING_STATUSES.includes(currentPricingStatus as (typeof PRICING_STATUSES)[number])) {
      return { ok: false, message: 'Status biaya tidak valid. Muat ulang halaman.' }
    }
    const applicationProduct = applicationData.product
    const existingFinancialPlan = applicationData.financialPlan ?? {}
    const rawFullCoverBudget = financialValues.fullCoverBudget.trim()
    let fullCoverBudget: FullCoverBudget | null = null
    if (rawFullCoverBudget) {
      if (applicationProduct !== 'FULL_COVER') {
        return { ok: false, message: 'Rincian anggaran ini hanya berlaku untuk Full Cover.' }
      }
      try {
        const parsed = JSON.parse(rawFullCoverBudget) as unknown
        const budgetError = validateFullCoverBudget(parsed, false)
        if (budgetError) return { ok: false, message: budgetError }
        fullCoverBudget = normalizeFullCoverBudget(parsed)
      } catch {
        return { ok: false, message: 'Rincian nominal Full Cover tidak valid.' }
      }
    }
    const effectiveFirstPaymentDate =
      applicationProduct === 'DEPARTURE_BRIDGING'
        ? firstPaymentDate ||
          String(existingFinancialPlan.firstPaymentDate ?? '') ||
          deriveDepartureFirstPaymentDate(applicationData)
        : firstPaymentDate
    const sharedNumbers = { ...financialNumbers }
    delete sharedNumbers.qardhAmount
    delete sharedNumbers.installmentCount
    const nextFinancialPlan = {
      ...existingFinancialPlan,
      ...(applicationProduct === 'DEPARTURE_BRIDGING' ? financialNumbers : sharedNumbers),
      wakalahOtherUjrahService: financialValues.wakalahOtherUjrahService.trim(),
      wakalahMediator: financialValues.wakalahMediator.trim(),
      wakalahDisputeInstitution: financialValues.wakalahDisputeInstitution.trim(),
      akadDate,
      firstPaymentDate: effectiveFirstPaymentDate,
      lpkWitnessName: financialValues.lpkWitnessName.trim(),
    }
    if (fullCoverBudget) {
      const totals = calculateFullCoverBudget(fullCoverBudget)
      const charges = calculateFullCoverCharges(totals.nafaqahTotal)
      const storedCommitmentDays = Number(existingFinancialPlan.commitmentSettlementDays)
      const commitmentSettlementDays =
        financialNumbers.commitmentSettlementDays ??
        (Number.isInteger(storedCommitmentDays) &&
        storedCommitmentDays >= 1 &&
        storedCommitmentDays <= 90
          ? storedCommitmentDays
          : 30)
      const submittedRepaymentMonths = financialValues.fullCoverRepaymentMonths.trim()
      const storedRepaymentMonths = Number(existingFinancialPlan.tenorMonths)
      const tenorMonths = submittedRepaymentMonths
        ? Number(submittedRepaymentMonths)
        : Number.isInteger(storedRepaymentMonths) &&
            storedRepaymentMonths >= 1 &&
            storedRepaymentMonths <= 36
          ? storedRepaymentMonths
          : 18
      if (!Number.isInteger(tenorMonths) || tenorMonths < 1 || tenorMonths > 36) {
        return { ok: false, message: 'Lama angsuran harus antara 1 dan 36 bulan.' }
      }
      const totalObligation = totals.nafaqahTotal + charges.ujrahTotal
      const jualaTotal = charges.jualaTotal
      Object.assign(nextFinancialPlan, {
        fullCoverBudget,
        commitmentCompensationAmount: Math.round(totals.nafaqahTotal * 0.2),
        commitmentSettlementDays,
        ujrahTotal: charges.ujrahTotal,
        jualaTotal,
        tenorMonths,
        hppLpkInvoiceAmount: totals.providerTotal,
        hppPocketMoneyAmount: totals.studentAllowanceTotal,
        languageAllowanceMonthly: fullCoverBudget.languageAllowanceMonthly,
        skillAllowanceMonthly: fullCoverBudget.skillAllowanceMonthly,
        departureAllowanceAmount: fullCoverBudget.departureAllowanceAmount,
        nafaqahTotal: totals.nafaqahTotal,
        totalObligation,
        ...(tenorMonths >= 1 && tenorMonths <= 36
          ? {
              totalObligationIfCoe: totalObligation + jualaTotal,
              monthlyInstallmentAfterCoe: Math.floor((totalObligation + jualaTotal) / tenorMonths),
              finalInstallmentAfterCoe:
                totalObligation +
                jualaTotal -
                Math.floor((totalObligation + jualaTotal) / tenorMonths) * (tenorMonths - 1),
            }
          : {}),
      })
    }
    let updateValues: Record<string, unknown> = {}
    let fullCoverNextPricingStatus = currentPricingStatus
    if (applicationProduct === 'DEPARTURE_BRIDGING') {
      const requestedAmount =
        Number(applicationData.departureDetails?.requestedFinancingAmount) || 0
      const storedPrincipal = Number(existingFinancialPlan.principal)
      const principal =
        Number.isSafeInteger(storedPrincipal) && storedPrincipal > 0
          ? storedPrincipal
          : requestedAmount
      const derived = deriveDepartureFinancials({
        principal,
        invoice: financialNumbers.hppLpkInvoiceAmount ?? 0,
        lpkName: String(applicationData.lpkName ?? ''),
      })
      if (!derived.valid) {
        return {
          ok: false,
          message:
            'Invoice LPK harus berupa angka dan tidak melebihi dana setelah biaya admin 5%. Periksa kartu Rincian penggunaan dana.',
        }
      }
      Object.assign(nextFinancialPlan, {
        principal: derived.principal,
        hppLpkInvoiceAmount: derived.invoice,
        hppPocketMoneyAmount: derived.pocketMoney,
        qardhAmount: derived.qardhAmount,
        nafaqahItems: derived.nafaqahItems,
        ujrahItems: derived.ujrahItems,
        nafaqahTotal: derived.nafaqahTotal,
        ujrahTotal: derived.ujrahTotal,
      })
      withDraft1Defaults(nextFinancialPlan)
      const nafaqahTotal = derived.nafaqahTotal
      const ujrahTotal = derived.ujrahTotal
      const qardhAmount = derived.qardhAmount
      if (refundTotal > nafaqahTotal) {
        return { ok: false, message: 'Total biaya atau refund tidak valid.' }
      }
      if (currentPricingStatus === 'VERIFIED' || currentPricingStatus === 'AGREED') {
        const approvalError = validateDepartureApproval(
          applicationData,
          nextFinancialPlan,
          derived.nafaqahItems,
          derived.ujrahItems,
          refundTotal,
          refundEvidenceReference,
        )
        if (approvalError) return { ok: false, message: approvalError }
      }
      const totalObligation = nafaqahTotal + ujrahTotal + qardhAmount - refundTotal
      if (!Number.isSafeInteger(totalObligation) || totalObligation < 0) {
        return { ok: false, message: 'Total kewajiban setelah potongan tidak valid.' }
      }
      const installmentCount = financialNumbers.installmentCount ?? 0
      const schedule =
        installmentCount > 0 && effectiveFirstPaymentDate
          ? calculateInstallmentSchedule(
              totalObligation,
              installmentCount,
              effectiveFirstPaymentDate,
            )
          : null
      if (installmentCount > 0 && !schedule) {
        return { ok: false, message: 'Jadwal angsuran tidak valid.' }
      }
      const offerSnapshot = {
        principal: derived.principal,
        nafaqahItems: derived.nafaqahItems,
        ujrahItems: derived.ujrahItems,
        nafaqahTotal,
        ujrahTotal,
        qardhAmount,
        qardhDisbursed,
        refundTotal,
        totalObligation,
        installmentCount,
        firstPaymentDate: effectiveFirstPaymentDate,
        schedule,
        refundEvidenceReference,
      }
      const previousOffer = applicationData.financialPlan?.offerSnapshot
      const offerChanged = serializeStable(previousOffer ?? null) !== serializeStable(offerSnapshot)
      const effectiveAgreementReference =
        offerChanged || currentPricingStatus === 'ESTIMATED' ? '' : finalAgreementReference
      Object.assign(nextFinancialPlan, offerSnapshot, {
        offerSnapshot,
        pricingStatus: currentPricingStatus,
        finalAgreementReference: effectiveAgreementReference,
        settlementNotes,
      })
      if (
        applicationData.status === 'CANCELLED' &&
        currentPricingStatus === 'AGREED' &&
        !settlementNotes
      ) {
        return {
          ok: false,
          message:
            'Catat perhitungan Nafaqah yang tidak dapat dipulihkan, jasa yang telah terlaksana, dan refund sebelum menyelesaikan pembatalan.',
        }
      }
      updateValues.financialPlanHistory = appendFinancialHistory(applicationData, {
        changedAt: new Date().toISOString(),
        changedBy: staff?.email ?? staff?.uid,
        financialPlan: offerSnapshot,
        pricingStatus: currentPricingStatus,
        finalAgreementReference: effectiveAgreementReference,
        settlementNotes,
      })
    }
    if (
      applicationProduct === 'FULL_COVER' &&
      (currentPricingStatus === 'VERIFIED' || currentPricingStatus === 'AGREED')
    ) {
      const approvalError = validateFullCoverApproval(applicationData, nextFinancialPlan)
      if (approvalError) return { ok: false, message: approvalError }
      const { nafaqahTotal, ujrahTotal, jualaTotal, tenorMonths } = nextFinancialPlan as Record<
        string,
        number
      >
      const totalObligation = nafaqahTotal + ujrahTotal
      const totalObligationIfCoe = totalObligation + jualaTotal
      const monthlyInstallmentAfterCoe = Math.floor(totalObligationIfCoe / tenorMonths)
      Object.assign(nextFinancialPlan, {
        totalObligation,
        totalObligationIfCoe,
        monthlyInstallmentAfterCoe,
        finalInstallmentAfterCoe:
          totalObligationIfCoe - monthlyInstallmentAfterCoe * (tenorMonths - 1),
        jualaCondition: nextFinancialPlan.jualaCondition ?? 'COE_ISSUED',
        paymentStartCondition: nextFinancialPlan.paymentStartCondition ?? 'AFTER_DEPARTURE',
      })
    }
    if (applicationProduct === 'FULL_COVER') {
      const derivedKeys = [
        'totalObligation',
        'totalObligationIfCoe',
        'monthlyInstallmentAfterCoe',
        'finalInstallmentAfterCoe',
      ] as const
      const fcSnapshot: Record<string, unknown> = {
        nafaqahTotal: Number(nextFinancialPlan.nafaqahTotal) || 0,
        ujrahTotal: Number(nextFinancialPlan.ujrahTotal) || 0,
        jualaTotal: Number(nextFinancialPlan.jualaTotal) || 0,
        tenorMonths: Number(nextFinancialPlan.tenorMonths) || 0,
        ...(nextFinancialPlan.fullCoverBudget
          ? { fullCoverBudget: nextFinancialPlan.fullCoverBudget }
          : {}),
      }
      for (const key of derivedKeys) {
        if (Number.isFinite(Number(nextFinancialPlan[key]))) {
          fcSnapshot[key] = Number(nextFinancialPlan[key])
        }
      }
      const previousOffer = applicationData.financialPlan?.offerSnapshot
      const offerChanged = serializeStable(previousOffer ?? null) !== serializeStable(fcSnapshot)
      Object.assign(nextFinancialPlan, { offerSnapshot: fcSnapshot })
      const nextPricingStatus =
        currentPricingStatus === 'AGREED' && offerChanged ? 'VERIFIED' : currentPricingStatus
      fullCoverNextPricingStatus = nextPricingStatus
      if (currentPricingStatus === 'AGREED' && offerChanged) {
        nextFinancialPlan.finalAgreementReference = ''
      }
      updateValues.financialPlanHistory = appendFinancialHistory(applicationData, {
        changedAt: new Date().toISOString(),
        changedBy: staff?.email ?? staff?.uid,
        financialPlan: fcSnapshot,
        pricingStatus: nextPricingStatus,
        finalAgreementReference: String(nextFinancialPlan.finalAgreementReference ?? ''),
        settlementNotes: String(nextFinancialPlan.settlementNotes ?? ''),
      })
    }
    await applicationRef.update({
      financialPlan: {
        ...nextFinancialPlan,
        pricingStatus:
          applicationProduct === 'FULL_COVER' ? fullCoverNextPricingStatus : currentPricingStatus,
      },
      ...updateValues,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })
    return { ok: true }
  } catch {
    return { ok: false, message: 'Rincian biaya belum dapat disimpan. Coba lagi.' }
  }
}

export async function updateApplicationWorkflow(
  documentId: string,
  status: string,
  internalNotes: string,
  departureDate?: string,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  if (!APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    return { ok: false, message: 'Pilih status pengajuan yang valid.' }
  }
  if (typeof internalNotes !== 'string' || internalNotes.length > 2_000) {
    return { ok: false, message: 'Catatan internal maksimal 2.000 karakter.' }
  }
  if (
    departureDate !== undefined &&
    typeof departureDate === 'string' &&
    departureDate.trim().length > 30
  ) {
    return { ok: false, message: 'Format tanggal penerbangan tidak valid.' }
  }
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    if (
      status === 'CANCELLED' &&
      String(applicationData.financialPlan?.pricingStatus ?? '') === 'AGREED' &&
      !String(applicationData.financialPlan?.settlementNotes ?? '').trim()
    ) {
      return {
        ok: false,
        message:
          'Catat perhitungan Nafaqah yang tidak dapat dipulihkan, jasa yang telah terlaksana, dan refund sebelum menyelesaikan pembatalan.',
      }
    }
    const updatePayload: Record<string, unknown> = {
      status,
      internalNotes: internalNotes.trim(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    }
    if (departureDate !== undefined) {
      updatePayload.departureDate = departureDate.trim() || null
    }
    await applicationRef.update(updatePayload)
    if (status === 'ACTIVE' && applicationData.status !== 'ACTIVE') {
      const ownerUid =
        typeof applicationData.ownerFirebaseUid === 'string' ? applicationData.ownerFirebaseUid : ''
      const applicantName =
        typeof applicationData.applicantName === 'string' ? applicationData.applicantName : ''
      if (ownerUid && applicantName) {
        const currentDocuments = Array.isArray(applicationData.documents)
          ? applicationData.documents
          : []
        const driveFiles = currentDocuments
          .filter((document: Record<string, unknown>) => typeof document.fileId === 'string')
          .map((document: Record<string, unknown>) => ({
            fileId: String(document.fileId),
            fileName: typeof document.fileName === 'string' ? document.fileName : '',
            label: String(document.documentType ?? ''),
          }))
        const agreementPdf = applicationData.agreementPdf
        if (agreementPdf && typeof agreementPdf.fileId === 'string') {
          driveFiles.push({
            fileId: String(agreementPdf.fileId),
            fileName: typeof agreementPdf.fileName === 'string' ? agreementPdf.fileName : '',
            label: 'Akad Wakalah bil Ujrah',
          })
        }
        await promoteApplicationFolder({
          folderId:
            typeof applicationData.driveFolderId === 'string' ? applicationData.driveFolderId : '',
          ownerUid,
          applicantName,
          files: driveFiles,
        })
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Status belum dapat disimpan. Coba lagi.' }
  }
}

export async function approveApplicationDocument(
  documentId: string,
  documentIndex: number,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  if (!Number.isInteger(documentIndex) || documentIndex < 0 || documentIndex > 60) {
    return { ok: false, message: 'Dokumen tidak valid.' }
  }
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const currentDocuments = application.data()?.documents
    if (!Array.isArray(currentDocuments) || documentIndex >= currentDocuments.length) {
      return { ok: false, message: 'Dokumen tidak ditemukan.' }
    }
    const target = currentDocuments[documentIndex]
    if (!target || typeof target.fileId !== 'string') {
      return { ok: false, message: 'Berkas belum diunggah untuk dokumen ini.' }
    }
    const documents = currentDocuments.map((document: Record<string, unknown>, index: number) =>
      index === documentIndex ? { ...document, status: 'VERIFIED' } : document,
    )
    await applicationRef.update({
      documents,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })
    return { ok: true }
  } catch {
    return { ok: false, message: 'Status dokumen belum dapat disimpan. Coba lagi.' }
  }
}

export async function deleteApplicationDocument(
  documentId: string,
  documentIndex: number,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  if (!Number.isInteger(documentIndex) || documentIndex < 0 || documentIndex > 60) {
    return { ok: false, message: 'Dokumen tidak valid.' }
  }
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const currentDocuments = application.data()?.documents
    if (!Array.isArray(currentDocuments) || documentIndex >= currentDocuments.length) {
      return { ok: false, message: 'Dokumen tidak ditemukan.' }
    }
    const target = currentDocuments[documentIndex]
    if (!target || typeof target.fileId !== 'string') {
      return { ok: false, message: 'Berkas tidak ditemukan.' }
    }
    const fileId = target.fileId
    try {
      await deleteDriveFile(fileId)
    } catch {
      // Best-effort: rekaman tetap diperbarui bila Drive sedang tidak tersedia.
    }
    const documents = currentDocuments.map((document: Record<string, unknown>, index: number) => {
      if (index !== documentIndex) return document
      const next: Record<string, unknown> = { ...document, status: 'REVISION_REQUIRED' }
      delete next.fileId
      delete next.fileName
      delete next.mimeType
      delete next.size
      return next
    })
    await applicationRef.update({
      documents,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })
    return { ok: true }
  } catch {
    return { ok: false, message: 'Dokumen belum dapat dihapus. Coba lagi.' }
  }
}

export async function rejectAndDeleteApplication(documentId: string): Promise<ActionResult> {
  const { error } = await assertStaffDocumentId(documentId)
  if (error) return error

  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }

    const applicationData = application.data() ?? {}
    if (applicationData.legacy && typeof applicationData.legacy === 'object') {
      return {
        ok: false,
        message: 'Data kontrak legacy dilindungi dan tidak dapat dihapus dari menu Pengajuan.',
      }
    }

    await applicationRef.delete()
    return { ok: true }
  } catch {
    return { ok: false, message: 'Pengajuan belum dapat dihapus. Coba lagi.' }
  }
}

const buildDepartureOfferSnapshot = (
  derived: DepartureFinancials,
  qardhDisbursed: boolean,
  refundTotal: number,
  refundEvidenceReference: string,
  installmentCount: number,
  firstPaymentDate: string,
): { snapshot: Record<string, unknown>; error: string | null } => {
  const nafaqahTotal = derived.nafaqahTotal
  const ujrahTotal = derived.ujrahTotal
  const qardhAmount = derived.qardhAmount
  const totalObligation = nafaqahTotal + ujrahTotal + qardhAmount - refundTotal
  if (!Number.isSafeInteger(totalObligation) || totalObligation < 0) {
    return { snapshot: {}, error: 'Total kewajiban setelah potongan tidak valid.' }
  }
  const schedule =
    installmentCount > 0 && firstPaymentDate
      ? calculateInstallmentSchedule(totalObligation, installmentCount, firstPaymentDate)
      : null
  if (installmentCount > 0 && !schedule) {
    return { snapshot: {}, error: 'Jadwal angsuran tidak valid.' }
  }
  return {
    snapshot: {
      principal: derived.principal,
      nafaqahItems: derived.nafaqahItems,
      ujrahItems: derived.ujrahItems,
      nafaqahTotal,
      ujrahTotal,
      qardhAmount,
      qardhDisbursed,
      refundTotal,
      totalObligation,
      installmentCount,
      firstPaymentDate,
      schedule,
      refundEvidenceReference,
    },
    error: null,
  }
}

export async function approveApplicationPricing(
  documentId: string,
  newNominal: number | null,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  if (
    newNominal !== null &&
    (!Number.isSafeInteger(newNominal) || newNominal < 1 || newNominal > 10_000_000_000)
  ) {
    return { ok: false, message: 'Nominal baru tidak valid.' }
  }
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    if (applicationData.financialPlan?.akadDocument) {
      return { ok: false, message: 'Dokumen akad telah terbit. Rincian biaya terkunci.' }
    }
    const product = applicationData.product
    if (newNominal !== null && product === 'DEPARTURE_BRIDGING') {
      const requested = applicationData.departureDetails?.requestedFinancingAmount
      const requestedNumber =
        typeof requested === 'number' && Number.isSafeInteger(requested) && requested > 0
          ? requested
          : 0
      const isProgramOption = FINANCING_OPTIONS.some((option) => option.amount === newNominal)
      if (!isProgramOption && (!requestedNumber || requestedNumber !== newNominal)) {
        return {
          ok: false,
          message:
            'Pilih nominal Dana Keberangkatan dari opsi yang tersedia atau nominal pengajuan siswa.',
        }
      }
    }
    const plan = { ...(applicationData.financialPlan ?? {}) } as Record<string, unknown>
    const previousOffer = plan.offerSnapshot
    let nextPlan: Record<string, unknown> = { ...plan }
    let offerSnapshot: Record<string, unknown>

    if (product === 'DEPARTURE_BRIDGING') {
      const requested = applicationData.departureDetails?.requestedFinancingAmount
      const requestedNumber =
        typeof requested === 'number' && Number.isSafeInteger(requested) && requested > 0
          ? requested
          : 0
      const rawPrincipal = Number(plan.principal)
      const principal =
        Number.isSafeInteger(rawPrincipal) && rawPrincipal > 0 ? rawPrincipal : requestedNumber
      if (newNominal !== null) {
        if (requestedNumber > 0 && newNominal > requestedNumber) {
          return {
            ok: false,
            message: `Nominal baru tidak boleh melebihi nominal yang diajukan siswa (Rp${requestedNumber.toLocaleString('id-ID')}).`,
          }
        }
      }
      const storedInvoice = Number(plan.hppLpkInvoiceAmount) || 0
      const outstandingInvoice = Number(applicationData.departureDetails?.outstandingLPKAmount) || 0
      const invoice = storedInvoice > 0 ? storedInvoice : outstandingInvoice
      const derived = deriveDepartureFinancials({
        principal: newNominal ?? principal,
        invoice,
        lpkName: String(applicationData.lpkName ?? ''),
      })
      if (!derived.valid) {
        return {
          ok: false,
          message:
            'Isi invoice LPK pada tab Draft Akad (invoice tidak boleh melebihi dana setelah potongan admin 5%) sebelum menyetujui.',
        }
      }
      plan.principal = derived.principal
      plan.hppLpkInvoiceAmount = derived.invoice
      plan.hppPocketMoneyAmount = derived.pocketMoney
      plan.qardhAmount = derived.qardhAmount
      plan.nafaqahItems = derived.nafaqahItems
      plan.ujrahItems = derived.ujrahItems
      plan.nafaqahTotal = derived.nafaqahTotal
      plan.ujrahTotal = derived.ujrahTotal
      const qardhDisbursed = plan.qardhDisbursed === true
      const refundTotal = Number(plan.refundTotal) || 0
      const refundEvidenceReference = String(plan.refundEvidenceReference ?? '').trim()
      const rawInstallmentCount = Number(plan.installmentCount)
      const installmentCount =
        Number.isInteger(rawInstallmentCount) &&
        rawInstallmentCount >= 1 &&
        rawInstallmentCount <= 36
          ? rawInstallmentCount
          : 12
      const firstPaymentDate =
        String(plan.firstPaymentDate ?? '').trim() ||
        deriveDepartureFirstPaymentDate(applicationData)
      plan.installmentCount = installmentCount
      plan.firstPaymentDate = firstPaymentDate
      withDraft1Defaults(plan)
      const approvalError = validateDepartureApproval(
        applicationData,
        plan,
        derived.nafaqahItems,
        derived.ujrahItems,
        refundTotal,
        refundEvidenceReference,
      )
      if (approvalError) return { ok: false, message: approvalError }
      const built = buildDepartureOfferSnapshot(
        derived,
        qardhDisbursed,
        refundTotal,
        refundEvidenceReference,
        installmentCount,
        firstPaymentDate,
      )
      if (built.error) return { ok: false, message: built.error }
      offerSnapshot = built.snapshot
      const offerChanged = serializeStable(previousOffer ?? null) !== serializeStable(offerSnapshot)
      const effectiveReference = offerChanged ? '' : String(plan.finalAgreementReference ?? '')
      nextPlan = {
        ...plan,
        ...offerSnapshot,
        offerSnapshot,
        pricingStatus: 'VERIFIED',
        finalAgreementReference: effectiveReference,
      }
      await applicationRef.update({
        financialPlan: nextPlan,
        ...buildApprovalUpdateValues(
          applicationData,
          offerSnapshot,
          'VERIFIED',
          staff,
          effectiveReference,
          String(plan.settlementNotes ?? ''),
        ),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: staff?.email ?? staff?.uid,
      })
      return { ok: true }
    }

    if (product === 'FULL_COVER') {
      if (newNominal !== null) {
        return {
          ok: false,
          message:
            'Untuk Full Cover, ubah nominal pada komponen kebutuhan di tab Nominal Pengajuan.',
        }
      }
      const budget = normalizeFullCoverBudget(plan.fullCoverBudget) ?? undefined
      const budgetTotals = budget ? calculateFullCoverBudget(budget) : null
      const budgetError = budget ? validateFullCoverBudget(budget) : null
      if (!budget || !budgetTotals || budgetError) {
        return {
          ok: false,
          message:
            budgetError ??
            'Simpan rincian kebutuhan Full Cover pada tab Budgeting terlebih dahulu.',
        }
      }
      const nafaqahTotal = budgetTotals.nafaqahTotal
      const { ujrahTotal, jualaTotal } = calculateFullCoverCharges(nafaqahTotal)
      const savedTenor = Number(plan.tenorMonths)
      const tenorMonths =
        Number.isInteger(savedTenor) && savedTenor >= 1 && savedTenor <= 36 ? savedTenor : 18
      const fullCoverApprovalPlan = {
        ...plan,
        nafaqahTotal,
        ujrahTotal,
        jualaTotal,
        tenorMonths,
        hppLpkInvoiceAmount: budgetTotals.providerTotal,
        hppPocketMoneyAmount: budgetTotals.studentAllowanceTotal,
        languageAllowanceMonthly: budget.languageAllowanceMonthly,
        skillAllowanceMonthly: budget.skillAllowanceMonthly,
        departureAllowanceAmount: budget.departureAllowanceAmount,
      }
      const approvalError = validateFullCoverApproval(applicationData, fullCoverApprovalPlan, {
        requireAkadTerms: false,
      })
      if (approvalError) return { ok: false, message: approvalError }
      const totalObligation = nafaqahTotal + ujrahTotal
      const totalObligationIfCoe = totalObligation + jualaTotal
      const monthlyInstallmentAfterCoe = Math.floor(totalObligationIfCoe / tenorMonths)
      offerSnapshot = {
        fullCoverBudget: budget,
        nafaqahTotal,
        ujrahTotal,
        jualaTotal,
        tenorMonths,
        totalObligation,
        totalObligationIfCoe,
        monthlyInstallmentAfterCoe,
        finalInstallmentAfterCoe:
          totalObligationIfCoe - monthlyInstallmentAfterCoe * (tenorMonths - 1),
        jualaCondition: plan.jualaCondition ?? 'COE_ISSUED',
        paymentStartCondition: plan.paymentStartCondition ?? 'AFTER_DEPARTURE',
      }
      const offerChanged = serializeStable(previousOffer ?? null) !== serializeStable(offerSnapshot)
      nextPlan = {
        ...plan,
        ...offerSnapshot,
        offerSnapshot,
        pricingStatus: 'VERIFIED',
        finalAgreementReference: offerChanged ? '' : String(plan.finalAgreementReference ?? ''),
      }
      await applicationRef.update({
        financialPlan: nextPlan,
        ...buildApprovalUpdateValues(applicationData, offerSnapshot, 'VERIFIED', staff),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: staff?.email ?? staff?.uid,
      })
      return { ok: true }
    }

    return { ok: false, message: 'Jenis pengajuan tidak dikenal.' }
  } catch {
    return { ok: false, message: 'Status biaya belum dapat disetujui. Coba lagi.' }
  }
}

type StaffContext = { email?: string; uid: string } | null

const buildApprovalUpdateValues = (
  applicationData: DocumentData,
  offerSnapshot: Record<string, unknown>,
  pricingStatus: string,
  staff: StaffContext,
  finalAgreementReference?: string,
  settlementNotes?: string,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {}
  values.financialPlanHistory = appendFinancialHistory(applicationData, {
    changedAt: new Date().toISOString(),
    changedBy: staff?.email ?? staff?.uid,
    financialPlan: offerSnapshot,
    pricingStatus,
    finalAgreementReference: finalAgreementReference ?? '',
    settlementNotes: settlementNotes ?? '',
  })
  return values
}

export async function setApplicationPricingAgreed(documentId: string): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    const product = applicationData.product
    const plan = { ...(applicationData.financialPlan ?? {}) } as Record<string, unknown>
    const finalAgreementReference = String(plan.finalAgreementReference ?? '').trim()
    const settlementNotes = String(plan.settlementNotes ?? '').trim()
    let offerSnapshot: Record<string, unknown>

    if (product === 'DEPARTURE_BRIDGING') {
      withDraft1Defaults(plan)
      const nafaqahItems = coerceFinancingLines(plan.nafaqahItems) ?? []
      const ujrahItems = coerceFinancingLines(plan.ujrahItems) ?? []
      const approvalError = validateDepartureApproval(
        applicationData,
        plan,
        nafaqahItems,
        ujrahItems,
        Number(plan.refundTotal) || 0,
        String(plan.refundEvidenceReference ?? '').trim(),
      )
      if (approvalError) return { ok: false, message: approvalError }
      offerSnapshot = (plan.offerSnapshot as Record<string, unknown>) ?? {}
    } else if (product === 'FULL_COVER') {
      const approvalError = validateFullCoverApproval(applicationData, plan)
      if (approvalError) return { ok: false, message: approvalError }
      offerSnapshot = (plan.offerSnapshot as Record<string, unknown>) ?? {}
    } else {
      return { ok: false, message: 'Jenis pengajuan tidak dikenal.' }
    }

    await applicationRef.update({
      financialPlan: { ...plan, pricingStatus: 'AGREED' },
      financialPlanHistory: appendFinancialHistory(applicationData, {
        changedAt: new Date().toISOString(),
        changedBy: staff?.email ?? staff?.uid,
        financialPlan: offerSnapshot,
        pricingStatus: 'AGREED',
        finalAgreementReference,
        settlementNotes,
      }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })
    return { ok: true }
  } catch {
    return { ok: false, message: 'Status biaya belum dapat disimpan. Coba lagi.' }
  }
}

export async function revertApplicationPricingToEstimated(
  documentId: string,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error
  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    const plan = { ...(applicationData.financialPlan ?? {}) } as Record<string, unknown>
    if (plan.akadDocument) {
      return {
        ok: false,
        message:
          'Dokumen akad telah terbit. Batalkan penerbitan akad terlebih dahulu jika ingin mengembalikan pengajuan.',
      }
    }
    const nextPlan = {
      ...plan,
      pricingStatus: 'ESTIMATED',
      finalAgreementReference: '',
    }
    await applicationRef.update({
      financialPlan: nextPlan,
      financialPlanHistory: appendFinancialHistory(applicationData, {
        changedAt: new Date().toISOString(),
        changedBy: staff?.email ?? staff?.uid,
        financialPlan: (plan.offerSnapshot as Record<string, unknown>) ?? {},
        pricingStatus: 'ESTIMATED',
        finalAgreementReference: '',
        settlementNotes:
          'Persetujuan nominal dibatalkan oleh staf. Pengajuan dikembalikan ke menu Pengajuan untuk ditinjau ulang.',
      }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })
    return { ok: true }
  } catch {
    return {
      ok: false,
      message: 'Gagal mengembalikan pengajuan ke menu Pengajuan. Coba lagi.',
    }
  }
}

export async function deleteApplicationAkadPhoto(
  documentId: string,
  fileId: string,
): Promise<ActionResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error

  try {
    const firestore = getFirebaseFirestore()
    const applicationRef = firestore.collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }

    const applicationData = application.data() ?? {}
    const photos = Array.isArray(applicationData.akadPhotos) ? applicationData.akadPhotos : []
    const updatedPhotos = photos.filter(
      (p) => p && typeof p === 'object' && (p as { fileId?: unknown }).fileId !== fileId,
    )

    await deleteDriveFile(fileId).catch(() => {})

    await applicationRef.update({
      akadPhotos: updatedPhotos,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff?.email ?? staff?.uid,
    })

    return { ok: true }
  } catch {
    return { ok: false, message: 'Gagal menghapus foto dokumentasi akad.' }
  }
}

type IssueAkadResult =
  | { ok: true; documentNumber: string; studentNumber: string }
  | { ok: false; message: string }

export async function issueAkadDocument(documentId: string): Promise<IssueAkadResult> {
  const { staff, error } = await assertStaffDocumentId(documentId)
  if (error) return error.ok ? { ok: false, message: 'Sesi staf berakhir.' } : error
  try {
    const firestore = getFirebaseFirestore()
    const applicationRef = firestore.collection('applications').doc(documentId)
    const application = await applicationRef.get()
    if (!application.exists) return { ok: false, message: 'Pengajuan tidak ditemukan.' }
    const applicationData = application.data() ?? {}
    if (['REJECTED', 'CANCELLED', 'COMPLETED'].includes(String(applicationData.status ?? ''))) {
      return {
        ok: false,
        message: 'Pengajuan yang sudah ditutup tidak dapat diterbitkan akadnya.',
      }
    }
    const plan = { ...(applicationData.financialPlan ?? {}) } as Record<string, unknown>
    if (plan.akadDocument) {
      return { ok: false, message: 'Dokumen akad sudah terbit untuk pengajuan ini.' }
    }
    const pricingStatus = String(plan.pricingStatus ?? '')
    if (pricingStatus !== 'VERIFIED' && pricingStatus !== 'AGREED') {
      return {
        ok: false,
        message: 'Terbitkan dokumen akad setelah rincian biaya berstatus Terverifikasi.',
      }
    }
    const product = String(applicationData.product ?? '')
    if (product === 'DEPARTURE_BRIDGING') {
      withDraft1Defaults(plan)
      const nafaqahItems = coerceFinancingLines(plan.nafaqahItems) ?? []
      const ujrahItems = coerceFinancingLines(plan.ujrahItems) ?? []
      const nafaqahTotal = Number(plan.nafaqahTotal) || getFinancingLineTotal(nafaqahItems)
      const ujrahTotal = Number(plan.ujrahTotal) || getFinancingLineTotal(ujrahItems)
      if (!(nafaqahTotal > 0) || !(ujrahTotal > 0)) {
        return {
          ok: false,
          message:
            'Lengkapi rincian Nafaqah dan Ujrah pada tab Draft Akad sebelum menerbitkan dokumen.',
        }
      }
      const hppError = validateDepartureApproval(
        applicationData,
        { ...plan, nafaqahTotal, ujrahTotal },
        nafaqahItems,
        ujrahItems,
        Number(plan.refundTotal) || 0,
        String(plan.refundEvidenceReference ?? '').trim(),
      )
      if (hppError) return { ok: false, message: hppError }
    } else if (product === 'FULL_COVER') {
      if (
        !(Number(plan.nafaqahTotal) > 0) ||
        !(Number(plan.ujrahTotal) > 0) ||
        !(Number(plan.tenorMonths) >= 1)
      ) {
        return {
          ok: false,
          message:
            'Lengkapi Nafaqah, Ujrah, dan tenor pada tab Draft Akad sebelum menerbitkan dokumen.',
        }
      }
      const hppError = validateFullCoverApproval(applicationData, plan)
      if (hppError) return { ok: false, message: hppError }
    } else {
      return { ok: false, message: 'Jenis pengajuan tidak dikenal.' }
    }

    const ownerUid =
      typeof applicationData.ownerFirebaseUid === 'string' ? applicationData.ownerFirebaseUid : ''
    if (!ownerUid) {
      return { ok: false, message: 'Pengajuan belum terhubung ke akun pemohon.' }
    }

    const studentNumber = await ensureStudentNumber(ownerUid)
    if (!studentNumber) {
      return { ok: false, message: 'NIS belum dapat diterbitkan. Coba lagi.' }
    }
    const sequence = studentNumberSequence(studentNumber)
    if (!sequence) {
      return { ok: false, message: 'NIS tidak valid. Muat ulang halaman.' }
    }

    const issuedAt = new Date()
    const built = await buildAkadDocument({
      application: applicationData,
      studentSequence: sequence,
      issuedAt,
    })

    const applicantName =
      typeof applicationData.applicantName === 'string' ? applicationData.applicantName : ''
    const label =
      product === 'FULL_COVER' ? 'Akad Wakalah bil Ujrah dan Jualah' : 'Akad Wakalah bil Ujrah'
    const fileName = applicantName.trim()
      ? buildDocumentFileName(label, applicantName, 'akad.docx')
      : `${documentId}-akad.docx`

    const existingFolderId =
      typeof applicationData.driveFolderId === 'string' ? applicationData.driveFolderId : ''
    const folderId = existingFolderId || (await ensureApplicationDriveFolder(applicationData))
    const uploaded = await uploadDriveFile({
      parentFolderId: folderId,
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: built.bytes,
    })

    const akadDocument = {
      documentNumber: built.documentNumber,
      studentNumber,
      template: built.template,
      fileName,
      driveFileId: uploaded.fileId,
      size: uploaded.size,
      issuedAt: FieldValue.serverTimestamp(),
      issuedBy: staff?.email ?? staff?.uid,
    }

    let linkResult: 'linked' | 'already-issued' | 'closed' = 'already-issued'
    try {
      linkResult = await firestore.runTransaction(async (transaction) => {
        const latest = await transaction.get(applicationRef)
        const latestData = latest.data()
        if (!latest.exists || latestData?.financialPlan?.akadDocument) return 'already-issued'
        if (['REJECTED', 'CANCELLED', 'COMPLETED'].includes(String(latestData?.status ?? ''))) {
          return 'closed'
        }
        const latestPlan = { ...(latestData?.financialPlan ?? {}) } as Record<string, unknown>
        if (product === 'DEPARTURE_BRIDGING') withDraft1Defaults(latestPlan)
        transaction.update(applicationRef, {
          status: 'ACTIVE',
          financialPlan: {
            ...latestPlan,
            ...(String(latestPlan.finalAgreementReference ?? '').trim()
              ? {}
              : { finalAgreementReference: built.documentNumber }),
            akadDocument,
          },
          ...(existingFolderId ? {} : { driveFolderId: folderId }),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: staff?.email ?? staff?.uid,
        })
        return 'linked'
      })
    } catch {
      try {
        await deleteDriveFile(uploaded.fileId)
      } catch {
        // best-effort cleanup
      }
      return {
        ok: false,
        message: 'Dokumen sudah dibuat, tetapi belum dapat disimpan ke pengajuan. Coba lagi.',
      }
    }
    if (linkResult !== 'linked') {
      try {
        await deleteDriveFile(uploaded.fileId)
      } catch {
        // best-effort cleanup
      }
      if (linkResult === 'closed') {
        return { ok: false, message: 'Pengajuan telah ditutup; akad tidak diterbitkan.' }
      }
      return { ok: false, message: 'Dokumen akad sudah terbit untuk pengajuan ini.' }
    }

    if (ownerUid && applicantName.trim()) {
      const currentDocuments = Array.isArray(applicationData.documents)
        ? applicationData.documents
        : []
      const driveFiles = currentDocuments
        .filter((document: Record<string, unknown>) => typeof document.fileId === 'string')
        .map((document: Record<string, unknown>) => ({
          fileId: String(document.fileId),
          fileName: typeof document.fileName === 'string' ? document.fileName : '',
          label: String(document.documentType ?? ''),
        }))
      const agreementPdf = applicationData.agreementPdf
      if (agreementPdf && typeof agreementPdf.fileId === 'string') {
        driveFiles.push({
          fileId: String(agreementPdf.fileId),
          fileName: typeof agreementPdf.fileName === 'string' ? agreementPdf.fileName : '',
          label: 'Akad Wakalah bil Ujrah',
        })
      }
      driveFiles.push({ fileId: uploaded.fileId, fileName, label })
      await promoteApplicationFolder({
        folderId,
        ownerUid,
        applicantName,
        files: driveFiles,
      })
    }

    return { ok: true, documentNumber: built.documentNumber, studentNumber }
  } catch {
    return { ok: false, message: 'Dokumen akad belum dapat diterbitkan. Coba lagi.' }
  }
}
