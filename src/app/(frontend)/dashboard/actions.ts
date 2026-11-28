'use server'

import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import { blocksAdditionalProgram } from '@/lib/application-lifecycle'
import { STUDENT_NUMBER_PATTERN, studentNumberCountryCode } from '@/lib/student-number'
import { DOCUMENT_DEFINITIONS } from '@/lib/documents'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import {
  ALUMNI_BUSINESS_SECTOR_LABELS,
  calculateMurabahahFinancials,
  type AlumniBusinessSector,
} from '@/lib/murabahah-financing'

export type DashboardProduct = 'FULL_COVER' | 'DEPARTURE_BRIDGING' | 'ALUMNI_FINANCING'

const normalizeDashboardProduct = (value: unknown): DashboardProduct => {
  if (value === 'FULL_COVER') return 'FULL_COVER'
  if (value === 'ALUMNI_FINANCING') return 'ALUMNI_FINANCING'
  return 'DEPARTURE_BRIDGING'
}

export type DashboardScheduleSummary = {
  total: number
  dueByToday: number
  paidCount: number
  paidAmount: number
  nextDueDate: string | null
  nextDueAmount: number | null
}

export type DashboardApplication = {
  id: string
  applicationId: string
  product: DashboardProduct
  applicantName: string
  lpkName: string
  status: string
  pricingStatus: string
  requestedFinancingAmount: number | null
  fullCoverInvoiceAmount: number | null
  totalObligation: number | null
  schedule: DashboardScheduleSummary | null
  documentsUploaded: number
  documentsVerified: number
  documentsRevision: number
  documentsTotal: number
  createdAt: number | null
  updatedAt: number | null
  settled: boolean
}

export type DashboardSummaryResult =
  | {
      ok: true
      application: DashboardApplication | null
      canApply: boolean
      isEligibleAlumni: boolean
    }
  | { ok: false; message: string }

export type ProgramStatsResult =
  | { ok: true; applicants: number; active: number; completed: number }
  | { ok: false; message: string }

export type UserDocumentItem = {
  documentType: string
  status: 'NOT_UPLOADED' | 'UPLOADED' | 'VERIFIED' | 'REVISION_REQUIRED'
  fileName: string | null
  size: number | null
}

export type UserScheduleItem = {
  installment: number
  dueDate: string
  amount: number
  paid: boolean
}

export type UserApplicationDetail = {
  id: string
  applicationId: string
  product: DashboardProduct
  applicantName: string
  phone: string
  lpkName: string
  destination: 'JAPAN' | 'TURKEY'
  status: string
  pricingStatus: string
  akadDocumentIssued: boolean
  requestedFinancingAmount: number | null
  totalObligation: number | null
  finalAgreementReference: string | null
  agreementPdf: {
    fileName: string
    size: number | null
    uploadedAt: string | null
  } | null
  createdAt: string | null
  updatedAt: string | null
  personalDetails: {
    domicileSameAsIdCard: boolean
    birthPlace: string
    birthDate: string
    gender: string
    religion: string
    idCardAddress: string
    domicileAddress: string
    domicilePostalCode: string
  }
  documents: UserDocumentItem[]
  schedule: UserScheduleItem[]
  consent: {
    understandsWakalah: boolean
    acceptsDataProcessing: boolean
  }
}

export type UserPaymentItem = {
  id: string
  applicationDocId: string
  applicationId: string
  type: 'INSTALLMENT' | 'CUSTOM'
  installmentNumber: number | null
  amount: number
  description: string
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'
  invoiceUrl: string | null
  paidAt: string | null
  paidMethod: string | null
  createdAt: string | null
}

export type UserPaymentProofItem = {
  id: string
  applicationDocId: string
  installmentNumber: number
  amount: number
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'
  submittedAt: string | null
}

export type UserActivityFeedResult =
  | {
      ok: true
      applications: UserApplicationDetail[]
      payments: UserPaymentItem[]
      paymentProofs: UserPaymentProofItem[]
    }
  | { ok: false; message: string }

export type StudentNumberResult =
  | { ok: true; studentNumber: string }
  | { ok: false; message: string }

export type ApplicantProfileInput = {
  applicantName: string
  phone: string
  birthPlace: string
  birthDate: string
  gender: 'MALE' | 'FEMALE'
  religion: 'ISLAM' | 'PROTESTANT' | 'CATHOLIC' | 'HINDU' | 'BUDDHIST' | 'CONFUCIAN'
  idCardAddress: string
  domicileSameAsIdCard: boolean
  domicileAddress: string
  domicilePostalCode: string
}

export type ApplicantProfileUpdateResult = { ok: true } | { ok: false; message: string }

const verifyUserIdentity = async (token: string) => {
  if (!token || token.length > 10_000) return null
  const identity = await getFirebaseAuth().verifyIdToken(token)
  return isAllowedSignInProvider(identity.firebase?.sign_in_provider) ? identity : null
}

const readCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

const readPaidSet = (value: unknown): Set<number> =>
  new Set(
    Array.isArray(value)
      ? value.filter((entry): entry is number => Number.isInteger(entry) && entry > 0)
      : [],
  )

const readScheduleSummary = (
  value: unknown,
  paidSet: Set<number>,
): DashboardScheduleSummary | null => {
  if (!Array.isArray(value) || value.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  let total = 0
  let dueByToday = 0
  let paidCount = 0
  let paidAmount = 0
  let nextDueDate: string | null = null
  let nextDueAmount: number | null = null
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as { dueDate?: unknown }).dueDate !== 'string' ||
      typeof (entry as { amount?: unknown }).amount !== 'number'
    ) {
      continue
    }
    const installment = Number((entry as { installment?: unknown }).installment)
    const dueDate = (entry as { dueDate: string }).dueDate
    const amount = (entry as { amount: number }).amount
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isSafeInteger(amount)) continue
    total += 1
    const isPaid = Number.isInteger(installment) && paidSet.has(installment)
    if (isPaid) {
      paidCount += 1
      paidAmount += amount
    }
    if (dueDate <= today) {
      dueByToday += 1
    }
    if (!isPaid && nextDueDate === null) {
      nextDueDate = dueDate
      nextDueAmount = amount
    }
  }
  if (total === 0) return null
  return { total, dueByToday, paidCount, paidAmount, nextDueDate, nextDueAmount }
}

const readTimestampIso = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return null
}

const readTimestampMillis = (value: unknown): number | null => {
  if (!value) return null
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function getStudentNumber(token: string): Promise<StudentNumberResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }

    const firestore = getFirebaseFirestore()
    const [applications, profile] = await Promise.all([
      firestore.collection('applications').where('ownerFirebaseUid', '==', identity.uid).get(),
      firestore.collection('studentProfiles').doc(identity.uid).get(),
    ])
    const orderedApplications = applications.docs.sort((left, right) => {
      const leftActive = left.data().status === 'ACTIVE' ? 1 : 0
      const rightActive = right.data().status === 'ACTIVE' ? 1 : 0
      return (
        rightActive - leftActive ||
        (readTimestampMillis(right.data().createdAt) ?? 0) -
          (readTimestampMillis(left.data().createdAt) ?? 0)
      )
    })
    const primaryApplication = orderedApplications[0]
    const primaryData = primaryApplication?.data()
    const profileData = profile.data() ?? {}
    const country = studentNumberCountryCode(primaryData?.destination)
    const numbersByCountry =
      profileData.studentNumbersByCountry && typeof profileData.studentNumbersByCountry === 'object'
        ? (profileData.studentNumbersByCountry as Record<string, unknown>)
        : {}
    const profileNumber = country ? numbersByCountry[country] : profileData.studentNumber
    const applicationNumber = primaryData?.studentNumber
    const studentNumber =
      (typeof applicationNumber === 'string' && STUDENT_NUMBER_PATTERN.test(applicationNumber)
        ? applicationNumber
        : null) ??
      (typeof profileNumber === 'string' && STUDENT_NUMBER_PATTERN.test(profileNumber)
        ? profileNumber
        : null) ??
      (!country && typeof profileData.studentNumber === 'string' ? profileData.studentNumber : '')
    return {
      ok: true,
      studentNumber:
        typeof studentNumber === 'string' && STUDENT_NUMBER_PATTERN.test(studentNumber)
          ? studentNumber
          : '',
    }
  } catch {
    return { ok: false, message: 'Nomor induk siswa belum dapat dimuat. Silakan coba lagi.' }
  }
}

export async function updateApplicantPersonalDetails(
  token: string,
  applicationId: string,
  input: ApplicantProfileInput,
): Promise<ApplicantProfileUpdateResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }
    if (typeof applicationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(applicationId)) {
      return { ok: false, message: 'Pengajuan tidak valid.' }
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, message: 'Data profil tidak valid.' }
    }

    const applicantName = typeof input.applicantName === 'string' ? input.applicantName.trim() : ''
    const phone = typeof input.phone === 'string' ? input.phone.trim() : ''
    const birthPlace = typeof input.birthPlace === 'string' ? input.birthPlace.trim() : ''
    const birthDate = typeof input.birthDate === 'string' ? input.birthDate.trim() : ''
    const idCardAddress = typeof input.idCardAddress === 'string' ? input.idCardAddress.trim() : ''
    const domicileAddress = input.domicileSameAsIdCard
      ? idCardAddress
      : typeof input.domicileAddress === 'string'
        ? input.domicileAddress.trim()
        : ''
    const domicilePostalCode =
      typeof input.domicilePostalCode === 'string' ? input.domicilePostalCode.trim() : ''
    const religions = ['ISLAM', 'PROTESTANT', 'CATHOLIC', 'HINDU', 'BUDDHIST', 'CONFUCIAN']

    if (
      applicantName.length < 2 ||
      applicantName.length > 100 ||
      phone.length > 24 ||
      !/^(\+62|62|0)[0-9]{8,14}$/.test(phone.replace(/[\s-]/g, '')) ||
      birthPlace.length < 2 ||
      birthPlace.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      !['MALE', 'FEMALE'].includes(input.gender) ||
      !religions.includes(input.religion) ||
      typeof input.domicileSameAsIdCard !== 'boolean' ||
      idCardAddress.length < 5 ||
      idCardAddress.length > 500 ||
      domicileAddress.length < 5 ||
      domicileAddress.length > 500 ||
      !/^\d{0,10}$/.test(domicilePostalCode)
    ) {
      return {
        ok: false,
        message: 'Periksa kembali nama, nomor WhatsApp, tanggal lahir, dan alamat.',
      }
    }

    const birth = new Date(`${birthDate}T00:00:00.000Z`)
    if (
      Number.isNaN(birth.getTime()) ||
      birth.toISOString().slice(0, 10) !== birthDate ||
      birth.getUTCFullYear() < 1900
    ) {
      return { ok: false, message: 'Tanggal lahir tidak valid.' }
    }

    const applicationRef = getFirebaseFirestore().collection('applications').doc(applicationId)
    const outcome = await getFirebaseFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(applicationRef)
      const data = snapshot.data()
      if (!snapshot.exists || data?.ownerFirebaseUid !== identity.uid) return 'NOT_FOUND'

      const pricingStatus = data?.financialPlan?.pricingStatus
      if (pricingStatus === 'AGREED' || ['ACTIVE', 'COMPLETED'].includes(String(data.status))) {
        return 'LOCKED'
      }

      transaction.update(applicationRef, {
        applicantName: applicantName.replace(/[<>]/g, ''),
        phone: phone.replace(/[<>]/g, ''),
        personalDetails: {
          ...(data.personalDetails && typeof data.personalDetails === 'object'
            ? data.personalDetails
            : {}),
          birthPlace: birthPlace.replace(/[<>]/g, ''),
          birthDate,
          gender: input.gender,
          religion: input.religion,
          idCardAddress: idCardAddress.replace(/[<>]/g, ''),
          domicileSameAsIdCard: input.domicileSameAsIdCard,
          domicileAddress: domicileAddress.replace(/[<>]/g, ''),
          domicilePostalCode,
        },
        applicantProfileUpdatedAt: FieldValue.serverTimestamp(),
      })
      return 'UPDATED'
    })

    if (outcome === 'NOT_FOUND') {
      return { ok: false, message: 'Pengajuan tidak ditemukan pada akun ini.' }
    }
    if (outcome === 'LOCKED') {
      return {
        ok: false,
        message:
          'Data terkunci setelah akad disepakati atau pembiayaan aktif. Hubungi Pusat Bantuan untuk koreksi.',
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: 'Data diri belum dapat disimpan. Silakan coba lagi.' }
  }
}

export async function getDashboardSummary(token: string): Promise<DashboardSummaryResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }

    const snapshot = await getFirebaseFirestore()
      .collection('applications')
      .where('ownerFirebaseUid', '==', identity.uid)
      .get()

    const applications = snapshot.docs.flatMap((document) => {
      const data = document.data()
      if (typeof data.applicantName !== 'string' || typeof data.applicationId !== 'string') {
        return []
      }
      const createdAt = readTimestampMillis(data.createdAt)
      const updatedAt = readTimestampMillis(data.updatedAt) ?? createdAt
      const financialPlan =
        data.financialPlan && typeof data.financialPlan === 'object' ? data.financialPlan : {}
      const departureDetails =
        data.departureDetails && typeof data.departureDetails === 'object'
          ? data.departureDetails
          : null
      const fullCoverDetails =
        data.fullCoverDetails && typeof data.fullCoverDetails === 'object'
          ? data.fullCoverDetails
          : null
      const documents = Array.isArray(data.documents) ? data.documents : []
      const paidSet = readPaidSet(data.paidInstallments)

      const application: DashboardApplication = {
        id: document.id,
        applicationId: data.applicationId,
        product: normalizeDashboardProduct(data.product),
        applicantName: data.applicantName,
        lpkName: typeof data.lpkName === 'string' ? data.lpkName : '',
        status: typeof data.status === 'string' ? data.status : 'SUBMITTED',
        pricingStatus:
          typeof financialPlan.pricingStatus === 'string'
            ? financialPlan.pricingStatus
            : 'ESTIMATED',
        requestedFinancingAmount:
          data.product === 'ALUMNI_FINANCING'
            ? readCount(financialPlan.principal)
            : departureDetails
              ? readCount(departureDetails.requestedFinancingAmount)
              : null,
        fullCoverInvoiceAmount: fullCoverDetails
          ? readCount(fullCoverDetails.lpkInvoiceAmount)
          : null,
        totalObligation: readCount(financialPlan.totalObligation),
        schedule: readScheduleSummary(financialPlan.schedule, paidSet),
        documentsUploaded: documents.filter(
          (doc) =>
            doc &&
            typeof doc === 'object' &&
            (doc as { status?: unknown }).status !== 'NOT_UPLOADED',
        ).length,
        documentsVerified: documents.filter(
          (doc) =>
            doc && typeof doc === 'object' && (doc as { status?: unknown }).status === 'VERIFIED',
        ).length,
        documentsRevision: documents.filter(
          (doc) =>
            doc &&
            typeof doc === 'object' &&
            (doc as { status?: unknown }).status === 'REVISION_REQUIRED',
        ).length,
        documentsTotal: documents.length,
        createdAt,
        updatedAt,
        settled: !blocksAdditionalProgram(data),
      }
      return [application]
    })

    applications.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    const application = applications.find((item) => !item.settled) ?? applications[0] ?? null
    const canApply = snapshot.docs.every((document) => !blocksAdditionalProgram(document.data()))
    const hasCompletedProgram = snapshot.docs.some(
      (document) => document.data().status === 'COMPLETED',
    )
    const isEligibleAlumni = canApply && hasCompletedProgram
    return {
      ok: true,
      application,
      canApply,
      isEligibleAlumni,
    }
  } catch {
    return { ok: false, message: 'Ringkasan dashboard belum dapat dimuat. Silakan coba lagi.' }
  }
}

export async function getProgramStats(
  token: string,
  product: DashboardApplication['product'],
): Promise<ProgramStatsResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }
    if (
      product !== 'FULL_COVER' &&
      product !== 'DEPARTURE_BRIDGING' &&
      product !== 'ALUMNI_FINANCING'
    )
      return { ok: false, message: 'Program tidak dikenal.' }

    const snapshot = await getFirebaseFirestore()
      .collection('applications')
      .where('product', '==', product)
      .select('ownerFirebaseUid', 'status')
      .get()
    const groups = {
      applicants: new Set<string>(),
      active: new Set<string>(),
      completed: new Set<string>(),
    }
    const applicationStatuses = new Set([
      'SUBMITTED',
      'ELIGIBILITY_REVIEW',
      'DOCUMENT_REVIEW',
      'REVISION_REQUIRED',
      'COST_VERIFICATION',
      'APPROVED',
      'CONTRACT_PREPARATION',
    ])

    snapshot.docs.forEach((document) => {
      const data = document.data()
      const participantId =
        typeof data.ownerFirebaseUid === 'string' ? data.ownerFirebaseUid : document.id
      if (applicationStatuses.has(String(data.status))) groups.applicants.add(participantId)
      if (data.status === 'ACTIVE') groups.active.add(participantId)
      if (data.status === 'COMPLETED') groups.completed.add(participantId)
    })

    return {
      ok: true,
      applicants: groups.applicants.size,
      active: groups.active.size,
      completed: groups.completed.size,
    }
  } catch {
    return { ok: false, message: 'Informasi program belum dapat dimuat.' }
  }
}

export async function getUserActivityFeed(token: string): Promise<UserActivityFeedResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }

    const db = getFirebaseFirestore()
    const [appSnapshot, paymentSnapshot, proofSnapshot] = await Promise.all([
      db.collection('applications').where('ownerFirebaseUid', '==', identity.uid).get(),
      db.collection('payments').where('ownerFirebaseUid', '==', identity.uid).limit(50).get(),
      db.collection('paymentProofs').where('ownerFirebaseUid', '==', identity.uid).limit(50).get(),
    ])

    const applications: UserApplicationDetail[] = appSnapshot.docs
      .flatMap((document) => {
        const data = document.data()
        if (typeof data.applicantName !== 'string' || typeof data.applicationId !== 'string') {
          return []
        }
        const financialPlan =
          data.financialPlan && typeof data.financialPlan === 'object'
            ? (data.financialPlan as Record<string, unknown>)
            : {}
        const departureDetails =
          data.departureDetails && typeof data.departureDetails === 'object'
            ? (data.departureDetails as Record<string, unknown>)
            : null
        const personal =
          data.personalDetails && typeof data.personalDetails === 'object'
            ? (data.personalDetails as Record<string, unknown>)
            : {}
        const paidSet = readPaidSet(data.paidInstallments)

        const rawDocs = Array.isArray(data.documents) ? data.documents : []
        const documents: UserDocumentItem[] = rawDocs.flatMap((doc) => {
          if (!doc || typeof doc !== 'object') return []
          const item = doc as Record<string, unknown>
          if (typeof item.documentType !== 'string') return []
          const rawStatus = String(item.status ?? 'NOT_UPLOADED')
          const status: UserDocumentItem['status'] =
            rawStatus === 'UPLOADED' ||
            rawStatus === 'VERIFIED' ||
            rawStatus === 'REVISION_REQUIRED'
              ? rawStatus
              : 'NOT_UPLOADED'
          return [
            {
              documentType: item.documentType,
              status,
              fileName: typeof item.fileName === 'string' ? item.fileName : null,
              size: typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : null,
            },
          ]
        })

        const rawSchedule = Array.isArray(financialPlan.schedule) ? financialPlan.schedule : []
        const schedule: UserScheduleItem[] = rawSchedule.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return []
          const item = entry as Record<string, unknown>
          const installment = Number(item.installment)
          const dueDate = typeof item.dueDate === 'string' ? item.dueDate : ''
          const amount = Number(item.amount)
          if (
            !Number.isInteger(installment) ||
            installment < 1 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
            !Number.isSafeInteger(amount)
          ) {
            return []
          }
          return [{ installment, dueDate, amount, paid: paidSet.has(installment) }]
        })

        const agreementDocument =
          data.agreementPdf && typeof data.agreementPdf === 'object'
            ? (data.agreementPdf as Record<string, unknown>)
            : null

        const detail: UserApplicationDetail = {
          id: document.id,
          applicationId: data.applicationId,
          product: normalizeDashboardProduct(data.product),
          applicantName: data.applicantName,
          phone: typeof data.phone === 'string' ? data.phone : '',
          lpkName: typeof data.lpkName === 'string' ? data.lpkName : '',
          destination: data.destination === 'TURKEY' ? 'TURKEY' : 'JAPAN',
          status: typeof data.status === 'string' ? data.status : 'SUBMITTED',
          pricingStatus:
            typeof financialPlan.pricingStatus === 'string'
              ? financialPlan.pricingStatus
              : 'ESTIMATED',
          akadDocumentIssued:
            Boolean(financialPlan.akadDocument) && typeof financialPlan.akadDocument === 'object',
          requestedFinancingAmount: departureDetails
            ? readCount(departureDetails.requestedFinancingAmount)
            : null,
          totalObligation: readCount(financialPlan.totalObligation),
          finalAgreementReference:
            typeof financialPlan.finalAgreementReference === 'string' &&
            financialPlan.finalAgreementReference
              ? financialPlan.finalAgreementReference
              : null,
          agreementPdf:
            financialPlan.pricingStatus === 'AGREED' &&
            agreementDocument &&
            typeof agreementDocument.fileId === 'string' &&
            typeof agreementDocument.agreementReference === 'string' &&
            agreementDocument.agreementReference === financialPlan.finalAgreementReference
              ? {
                  fileName:
                    typeof agreementDocument.fileName === 'string'
                      ? agreementDocument.fileName
                      : 'Akad Wakalah bil Ujrah.pdf',
                  size:
                    typeof agreementDocument.size === 'number' &&
                    Number.isFinite(agreementDocument.size)
                      ? agreementDocument.size
                      : null,
                  uploadedAt: readTimestampIso(agreementDocument.uploadedAt),
                }
              : null,
          createdAt: readTimestampIso(data.createdAt),
          updatedAt: readTimestampIso(data.updatedAt),
          personalDetails: {
            domicileSameAsIdCard: personal.domicileSameAsIdCard === true,
            birthPlace: typeof personal.birthPlace === 'string' ? personal.birthPlace : '',
            birthDate: typeof personal.birthDate === 'string' ? personal.birthDate : '',
            gender: typeof personal.gender === 'string' ? personal.gender : '',
            religion: typeof personal.religion === 'string' ? personal.religion : '',
            idCardAddress: typeof personal.idCardAddress === 'string' ? personal.idCardAddress : '',
            domicileAddress:
              typeof personal.domicileAddress === 'string' ? personal.domicileAddress : '',
            domicilePostalCode:
              typeof personal.domicilePostalCode === 'string' ? personal.domicilePostalCode : '',
          },
          documents,
          schedule,
          consent: {
            understandsWakalah: data.understandsWakalah === true,
            acceptsDataProcessing: data.acceptsDataProcessing === true,
          },
        }
        return [detail]
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

    const payments: UserPaymentItem[] = paymentSnapshot.docs
      .map((document) => {
        const data = document.data()
        return {
          id: document.id,
          applicationDocId: typeof data.applicationDocId === 'string' ? data.applicationDocId : '',
          applicationId: typeof data.applicationId === 'string' ? data.applicationId : '',
          type: data.type === 'CUSTOM' ? ('CUSTOM' as const) : ('INSTALLMENT' as const),
          installmentNumber: Number.isInteger(data.installmentNumber)
            ? (data.installmentNumber as number)
            : null,
          amount:
            typeof data.amount === 'number' && Number.isSafeInteger(data.amount) ? data.amount : 0,
          description: typeof data.description === 'string' ? data.description : '',
          status:
            data.status === 'PAID' || data.status === 'EXPIRED' || data.status === 'FAILED'
              ? (data.status as 'PAID' | 'EXPIRED' | 'FAILED')
              : ('PENDING' as const),
          invoiceUrl: typeof data.invoiceUrl === 'string' ? data.invoiceUrl : null,
          paidAt: typeof data.paidAt === 'string' ? data.paidAt : null,
          paidMethod: typeof data.paidMethod === 'string' ? data.paidMethod : null,
          createdAt: readTimestampIso(data.createdAt),
        }
      })
      .sort((a, b) => (b.paidAt ?? b.createdAt ?? '').localeCompare(a.paidAt ?? a.createdAt ?? ''))

    const paymentProofs: UserPaymentProofItem[] = proofSnapshot.docs.flatMap((document) => {
      const data = document.data()
      if (
        typeof data.applicationDocId !== 'string' ||
        !Number.isInteger(data.installmentNumber) ||
        !Number.isSafeInteger(data.amount) ||
        !['PENDING_REVIEW', 'VERIFIED', 'REJECTED'].includes(String(data.status))
      ) {
        return []
      }
      return [
        {
          id: document.id,
          applicationDocId: data.applicationDocId,
          installmentNumber: Number(data.installmentNumber),
          amount: Number(data.amount),
          status: data.status as UserPaymentProofItem['status'],
          submittedAt: typeof data.submittedAt === 'string' ? data.submittedAt : null,
        },
      ]
    })

    return { ok: true, applications, payments, paymentProofs }
  } catch {
    return { ok: false, message: 'Data aktivitas belum dapat dimuat. Silakan coba lagi.' }
  }
}

export type SubmitAlumniFinancingInput = {
  businessName: string
  businessSector: string
  businessAddress: string
  businessCity: string
  businessProvince: string
  businessDescription: string
  requestedAmount: number
  tenorMonths: number
  disbursementBankName: string
  disbursementBankAccount: string
  disbursementAccountHolder: string
  understandsMurabahah: boolean
  acceptsDataProcessing: boolean
}

export type SubmitAlumniFinancingResult =
  | { ok: true; id: string; applicationId: string }
  | { ok: false; message: string }

export async function submitAlumniFinancingByUser(
  token: string,
  input: SubmitAlumniFinancingInput,
): Promise<SubmitAlumniFinancingResult> {
  try {
    const identity = await verifyUserIdentity(token)
    if (!identity) {
      return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, message: 'Data pengajuan tidak valid.' }
    }

    const businessName =
      typeof input.businessName === 'string' ? input.businessName.trim().slice(0, 120) : ''
    const businessSectorRaw =
      typeof input.businessSector === 'string' ? input.businessSector.trim() : ''
    const businessAddress =
      typeof input.businessAddress === 'string' ? input.businessAddress.trim().slice(0, 250) : ''
    const businessCity =
      typeof input.businessCity === 'string' ? input.businessCity.trim().slice(0, 80) : ''
    const businessProvince =
      typeof input.businessProvince === 'string' ? input.businessProvince.trim().slice(0, 80) : ''
    const businessDescription =
      typeof input.businessDescription === 'string'
        ? input.businessDescription.trim().slice(0, 500)
        : ''
    const requestedAmount = Math.round(Number(input.requestedAmount) || 0)
    const tenorMonths = Math.round(Number(input.tenorMonths) || 0)
    const disbursementBankName =
      typeof input.disbursementBankName === 'string'
        ? input.disbursementBankName.trim().slice(0, 60)
        : ''
    const disbursementBankAccount =
      typeof input.disbursementBankAccount === 'string'
        ? input.disbursementBankAccount.trim().slice(0, 40)
        : ''
    const disbursementAccountHolder =
      typeof input.disbursementAccountHolder === 'string'
        ? input.disbursementAccountHolder.trim().slice(0, 100)
        : ''

    if (businessName.length < 2) {
      return { ok: false, message: 'Nama usaha wajib diisi (minimal 2 karakter).' }
    }
    if (!(businessSectorRaw in ALUMNI_BUSINESS_SECTOR_LABELS)) {
      return { ok: false, message: 'Sektor usaha tidak valid.' }
    }
    if (businessAddress.length < 5) {
      return { ok: false, message: 'Alamat lokasi usaha wajib diisi lengkap.' }
    }
    if (
      !Number.isSafeInteger(requestedAmount) ||
      requestedAmount < 1_000_000 ||
      requestedAmount > 100_000_000
    ) {
      return {
        ok: false,
        message: 'Nominal modal usaha harus antara Rp1.000.000 hingga Rp100.000.000.',
      }
    }
    if (!Number.isSafeInteger(tenorMonths) || tenorMonths < 3 || tenorMonths > 36) {
      return { ok: false, message: 'Tenor cicilan harus antara 3 hingga 36 bulan.' }
    }
    if (input.understandsMurabahah !== true || input.acceptsDataProcessing !== true) {
      return {
        ok: false,
        message: 'Anda wajib menyetujui ketentuan Akad Murabahah dan pemrosesan data.',
      }
    }

    const firestore = getFirebaseFirestore()
    const existingSnap = await firestore
      .collection('applications')
      .where('ownerFirebaseUid', '==', identity.uid)
      .get()

    if (existingSnap.empty) {
      return {
        ok: false,
        message:
          'Program ini khusus untuk alumni VentureGo yang telah melunasi program sebelumnya.',
      }
    }

    const hasBlocking = existingSnap.docs.some((doc) => blocksAdditionalProgram(doc.data()))
    if (hasBlocking) {
      return {
        ok: false,
        message: 'Anda masih memiliki pengajuan atau kewajiban aktif yang belum selesai.',
      }
    }

    const completedDocs = existingSnap.docs
      .filter((doc) => doc.data().status === 'COMPLETED')
      .sort(
        (a, b) =>
          (readTimestampMillis(b.data().createdAt) ?? 0) -
          (readTimestampMillis(a.data().createdAt) ?? 0),
      )

    const sourceDoc = completedDocs[0]
    if (!sourceDoc) {
      return {
        ok: false,
        message:
          'Program ini khusus untuk alumni dengan riwayat pembiayaan berstatus Lunas (Selesai).',
      }
    }

    const sourceData = sourceDoc.data()
    const year = new Date().getFullYear()
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const applicationId = `VSV-ALM-${year}-${randomSuffix}`

    const initialPlan = calculateMurabahahFinancials({
      principal: requestedAmount,
      marginAmount: 0,
      adminFeePercentage: 3,
      tenorMonths,
      itemProcurementPlan: [
        {
          itemName: `Pengadaan modal usaha: ${businessName}`,
          estimatedCost: requestedAmount,
        },
      ],
    })

    const initialDocuments = DOCUMENT_DEFINITIONS.ALUMNI_FINANCING.map((doc) => ({
      documentType: doc.label,
      status: 'NOT_UPLOADED' as const,
      fileName: null,
      fileId: null,
      size: null,
      uploadedAt: null,
    }))

    const payload: Record<string, unknown> = {
      applicationId,
      product: 'ALUMNI_FINANCING',
      ownerFirebaseUid: identity.uid,
      email: typeof sourceData.email === 'string' ? sourceData.email : (identity.email ?? ''),
      applicantName: typeof sourceData.applicantName === 'string' ? sourceData.applicantName : '',
      phone: typeof sourceData.phone === 'string' ? sourceData.phone : '',
      idCardNumber: typeof sourceData.idCardNumber === 'string' ? sourceData.idCardNumber : '',
      destination: typeof sourceData.destination === 'string' ? sourceData.destination : 'JAPAN',
      lpkName: typeof sourceData.lpkName === 'string' ? sourceData.lpkName : 'Alumni VentureGo',
      studentNumber: typeof sourceData.studentNumber === 'string' ? sourceData.studentNumber : '',
      isAlumni: true,
      previousApplicationDocId: sourceDoc.id,
      personalDetails: sourceData.personalDetails ?? {},
      alumniBusinessDetails: {
        businessName,
        businessSector: businessSectorRaw as AlumniBusinessSector,
        businessAddress,
        businessCity,
        businessProvince,
        businessDescription,
        ...(disbursementBankName && disbursementBankAccount
          ? {
              disbursementBank: {
                bankName: disbursementBankName,
                accountNumber: disbursementBankAccount,
                accountHolderName:
                  disbursementAccountHolder ||
                  (typeof sourceData.applicantName === 'string' ? sourceData.applicantName : ''),
              },
            }
          : {}),
      },
      financialPlan: initialPlan,
      documents: initialDocuments,
      paidInstallments: [],
      status: 'SUBMITTED',
      understandsWakalah: true,
      acceptsDataProcessing: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: identity.email ?? identity.uid,
    }

    const docRef = await firestore.collection('applications').add(payload)

    try {
      const folderId = await ensureApplicationDriveFolder(payload)
      if (folderId) {
        await docRef.update({ driveFolderId: folderId })
      }
    } catch {
      // Best-effort Drive draft folder creation
    }

    return { ok: true, id: docRef.id, applicationId }
  } catch {
    return { ok: false, message: 'Pengajuan pembiayaan alumni belum dapat dikirim. Coba lagi.' }
  }
}
