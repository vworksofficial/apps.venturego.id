'use server'

import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import type { FinancingApplicationRecord } from '@/lib/firebase-data'

type UserFinancingPayment = {
  id: string
  applicationDocId: string
  installmentNumber: number | null
  amount: number
  description: string
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'
  paidAt: string | null
  paidMethod: string | null
  createdAt: string | null
}

export type UserPaymentProof = {
  id: string
  applicationDocId: string
  installmentNumber: number
  amount: number
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'
  submittedAt: string | null
}

type UserFinancingApplication = Pick<
  FinancingApplicationRecord,
  | 'id'
  | 'applicationId'
  | 'product'
  | 'applicantName'
  | 'lpkName'
  | 'destination'
  | 'status'
  | 'eligibility'
  | 'departureDate'
  | 'departureDetails'
  | 'financialPlan'
  | 'paidInstallments'
>

export type UserFinancingResult =
  | {
      ok: true
      applications: UserFinancingApplication[]
      payments: UserFinancingPayment[]
      paymentProofs: UserPaymentProof[]
    }
  | { ok: false; message: string }

const isGoogleIdentity = async (token: string) => {
  if (!token || token.length > 10_000) return null
  const identity = await getFirebaseAuth().verifyIdToken(token)
  return isAllowedSignInProvider(identity.firebase?.sign_in_provider) ? identity : null
}

const toPlainValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toPlainValue)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      toPlainValue(entry),
    ]),
  )
}

const readPayment = (id: string, value: unknown): UserFinancingPayment | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (typeof data.applicationDocId !== 'string') return null
  return {
    id,
    applicationDocId: data.applicationDocId,
    installmentNumber:
      Number.isInteger(data.installmentNumber) && Number(data.installmentNumber) > 0
        ? Number(data.installmentNumber)
        : null,
    amount: typeof data.amount === 'number' && Number.isSafeInteger(data.amount) ? data.amount : 0,
    description: typeof data.description === 'string' ? data.description : '',
    status:
      data.status === 'PAID' || data.status === 'EXPIRED' || data.status === 'FAILED'
        ? data.status
        : 'PENDING',
    paidAt: typeof data.paidAt === 'string' ? data.paidAt : null,
    paidMethod: typeof data.paidMethod === 'string' ? data.paidMethod : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
  }
}

export async function getOwnedFinancingApplications(token: string): Promise<UserFinancingResult> {
  try {
    const identity = await isGoogleIdentity(token)
    if (!identity) return { ok: false, message: 'Sesi telah berakhir. Silakan masuk kembali.' }

    const firestore = getFirebaseFirestore()
    const [applicationSnapshot, paymentSnapshot, proofSnapshot] = await Promise.all([
      firestore.collection('applications').where('ownerFirebaseUid', '==', identity.uid).get(),
      firestore
        .collection('payments')
        .where('ownerFirebaseUid', '==', identity.uid)
        .limit(100)
        .get(),
      firestore
        .collection('paymentProofs')
        .where('ownerFirebaseUid', '==', identity.uid)
        .limit(100)
        .get(),
    ])

    const applications = applicationSnapshot.docs.flatMap((document) => {
      const data = toPlainValue(document.data()) as Record<string, unknown>
      if (
        typeof data.applicationId !== 'string' ||
        typeof data.applicantName !== 'string' ||
        !['DEPARTURE_BRIDGING', 'FULL_COVER', 'ALUMNI_FINANCING'].includes(String(data.product)) ||
        !data.financialPlan ||
        typeof data.financialPlan !== 'object'
      ) {
        return []
      }
      return [
        {
          id: document.id,
          applicationId: data.applicationId,
          product: data.product as FinancingApplicationRecord['product'],
          applicantName: data.applicantName,
          lpkName: typeof data.lpkName === 'string' ? data.lpkName : '',
          destination: (data.destination === 'TURKEY'
            ? 'TURKEY'
            : 'JAPAN') as FinancingApplicationRecord['destination'],
          status: typeof data.status === 'string' ? data.status : 'SUBMITTED',
          eligibility:
            data.eligibility && typeof data.eligibility === 'object'
              ? (data.eligibility as Record<string, unknown>)
              : {},
          departureDate: typeof data.departureDate === 'string' ? data.departureDate : undefined,
          departureDetails:
            data.departureDetails && typeof data.departureDetails === 'object'
              ? (data.departureDetails as Record<string, unknown>)
              : null,
          financialPlan: data.financialPlan as Record<string, unknown>,
          paidInstallments: Array.isArray(data.paidInstallments)
            ? data.paidInstallments.filter(
                (installment): installment is number =>
                  Number.isInteger(installment) && Number(installment) > 0,
              )
            : [],
        },
      ]
    })

    const payments = paymentSnapshot.docs
      .map((document) => readPayment(document.id, toPlainValue(document.data())))
      .filter((payment): payment is UserFinancingPayment => payment !== null)
      .sort((a, b) => (b.paidAt ?? b.createdAt ?? '').localeCompare(a.paidAt ?? a.createdAt ?? ''))

    const paymentProofs = proofSnapshot.docs.flatMap((document) => {
      const data = toPlainValue(document.data()) as Record<string, unknown>
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
          status: data.status as UserPaymentProof['status'],
          submittedAt: typeof data.submittedAt === 'string' ? data.submittedAt : null,
        },
      ]
    })

    return { ok: true, applications, payments, paymentProofs }
  } catch {
    return { ok: false, message: 'Rincian angsuran belum dapat dimuat. Silakan coba lagi.' }
  }
}
