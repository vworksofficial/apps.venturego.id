export type ApplicationProduct = 'FULL_COVER' | 'DEPARTURE_BRIDGING'

export type ApplicationDocumentStatus =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'VERIFIED'
  | 'REVISION_REQUIRED'

export type ApplicationInput = {
  product: ApplicationProduct
  applicantName: string
  phone: string
  lpkName: string
  birthPlace: string
  birthDate: string
  gender: 'MALE' | 'FEMALE'
  religion: 'ISLAM' | 'PROTESTANT' | 'CATHOLIC' | 'HINDU' | 'BUDDHIST' | 'CONFUCIAN'
  idCardAddress: string
  domicileSameAsIdCard: boolean
  domicileAddress: string
  domicilePostalCode: string
  destination: 'JAPAN' | 'TURKEY'
  trainingStarted: boolean
  trainingCompleted: boolean
  hasPassport: boolean
  hasWorkContract: boolean
  guardianApproval: boolean
  placementPassed: boolean
  coeStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'ISSUED'
  visaStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'ISSUED'
  languageLevel: 'NOT_STARTED' | 'BASIC_N5' | 'N5' | 'N4' | 'N3_PLUS'
  trainingStartDate: string
  languageTrainingMonths: string
  skillTrainingMonths: string
  requiresTrainingAllowance: boolean
  requiresAccommodation: boolean
  estimatedDeparture: string
  outstandingLPKAmount: string
  financingAmount: string
  selectedNeeds: string[]
  understandsWakalah: boolean
  acceptsDataProcessing: boolean
}

export type ApplicationDocumentRecord = {
  documentType: string
  status: ApplicationDocumentStatus
  fileId?: string
  fileName?: string
  mimeType?: string
  size?: number
  uploadedAt?: string
}

export type AkadPhotoRecord = {
  fileId: string
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
  uploadedBy: string
}

export type FinancingApplicationRecord = {
  id: string
  applicationId: string
  legacy?: Record<string, unknown>
  product: ApplicationProduct
  contractScheme?: string
  applicantName: string
  phone: string
  lpkName: string
  destination: 'JAPAN' | 'TURKEY'
  status: string
  createdAt: string
  updatedAt?: string
  updatedBy?: string
  paidInstallments?: number[]
  paidAmount?: number
  personalDetails: Record<string, unknown>
  eligibility: Record<string, unknown>
  fullCoverDetails: Record<string, unknown> | null
  departureDetails: Record<string, unknown> | null
  fundingNeeds: Record<string, unknown>[]
  financialPlan: Record<string, unknown>
  agreementPdf?: {
    fileId: string
    fileName: string
    mimeType: 'application/pdf'
    size: number
    uploadedAt: string
    uploadedBy: string
    agreementReference: string
  }
  akadPhotos?: AkadPhotoRecord[]
  financialPlanHistory?: {
    changedAt: string
    changedBy: string
    financialPlan: Record<string, unknown>
    pricingStatus: string
    finalAgreementReference?: string
    settlementNotes?: string
  }[]
  documents: ApplicationDocumentRecord[]
  understandsWakalah: boolean
  acceptsDataProcessing: boolean
  internalNotes?: string
  departureDate?: string
  driveFolderId?: string
  studentNumber?: string
  registrationForm?: Record<string, unknown>
}

export type AdminPaymentRecord = {
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
  paidChannel: string | null
  createdAt: string | null
}

export type AdminPaymentProofRecord = {
  id: string
  applicationDocId: string
  ownerFirebaseUid: string
  applicantName: string
  installmentNumber: number
  amount: number
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'REJECTING'
  fileName: string
  mimeType: string
  size: number
  submittedAt: string
}

export const APPLICATION_STATUSES = [
  'SUBMITTED',
  'ELIGIBILITY_REVIEW',
  'DOCUMENT_REVIEW',
  'REVISION_REQUIRED',
  'COST_VERIFICATION',
  'APPROVED',
  'CONTRACT_PREPARATION',
  'ACTIVE',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const

export const APPLICATION_DOCUMENT_STATUSES = [
  'NOT_UPLOADED',
  'UPLOADED',
  'VERIFIED',
  'REVISION_REQUIRED',
] as const

export const PRICING_STATUSES = ['ESTIMATED', 'VERIFIED', 'AGREED'] as const
