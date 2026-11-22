import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import { DOCUMENT_DEFINITIONS, getFormPendaftaranIndex } from '@/lib/documents'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { deleteDriveFile, uploadDriveFile } from '@/lib/gdrive'
import { renderRegistrationFormPdf } from '@/lib/registration-form-pdf'
import { formatIndonesianDate, type RegistrationFormData } from '@/lib/registration-form-types'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const errorResponse = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })

const verifyAuth = async (request: Request) => {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || token.length > 10_000) return null
  try {
    const identity = await getFirebaseAuth().verifyIdToken(token, true)
    return isAllowedSignInProvider(identity.firebase?.sign_in_provider) ? identity : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const identity = await verifyAuth(request)
  if (!identity) return errorResponse('Sesi tidak valid. Silakan masuk kembali.', 401)

  const { searchParams } = new URL(request.url)
  const applicationId = searchParams.get('applicationId')
  if (!applicationId || !APPLICATION_ID_PATTERN.test(applicationId)) {
    return errorResponse('ID pengajuan tidak valid.', 400)
  }

  try {
    const applicationDoc = await getFirebaseFirestore()
      .collection('applications')
      .doc(applicationId)
      .get()
    if (!applicationDoc.exists) return errorResponse('Pengajuan tidak ditemukan.', 404)

    const data = applicationDoc.data() ?? {}
    if (data.ownerFirebaseUid !== identity.uid) {
      return errorResponse('Akses pengajuan ditolak.', 403)
    }

    const personal = (data.personalDetails ?? {}) as Record<string, unknown>
    const destination = String(data.destination ?? '')
    const destinationCountry =
      destination === 'JAPAN' ? 'JEPANG' : destination === 'TURKEY' ? 'TURKIYE' : 'JEPANG'

    const prefill = {
      fullName: String(data.applicantName ?? ''),
      idCardNumber: String(personal.idCardNumber ?? ''),
      mobilePhone: String(data.phone ?? ''),
      email: String(identity.email ?? personal.email ?? ''),
      birthPlace: String(personal.birthPlace ?? ''),
      birthDate: formatIndonesianDate(String(personal.birthDate ?? '')),
      gender: personal.gender === 'FEMALE' ? 'PEREMPUAN' : 'LAKI_LAKI',
      religion: String(personal.religion ?? 'ISLAM'),
      address: String(personal.domicileAddress ?? personal.idCardAddress ?? ''),
      city: String(personal.city ?? ''),
      postalCode: String(personal.domicilePostalCode ?? ''),
      destinationCountry,
    }

    const regForm = (data.registrationForm as RegistrationFormData | undefined) ?? null
    if (regForm && regForm.birthDate) {
      regForm.birthDate = formatIndonesianDate(regForm.birthDate)
    }

    return NextResponse.json({
      ok: true,
      data: regForm,
      prefill,
    })
  } catch {
    return errorResponse('Data formulir belum dapat dimuat.', 500)
  }
}

export async function POST(request: Request) {
  const identity = await verifyAuth(request)
  if (!identity) return errorResponse('Sesi tidak valid. Silakan masuk kembali.', 401)

  let body: { applicationId?: string; formData?: RegistrationFormData }
  try {
    body = (await request.json()) as { applicationId?: string; formData?: RegistrationFormData }
  } catch {
    return errorResponse('Format data tidak valid.', 400)
  }

  const { applicationId, formData } = body
  if (!applicationId || !APPLICATION_ID_PATTERN.test(applicationId) || !formData) {
    return errorResponse('Permintaan tidak lengkap.', 400)
  }

  if (!formData.fullName.trim()) return errorResponse('Nama lengkap pemohon wajib diisi.')
  if (!formData.idCardNumber.trim()) return errorResponse('Nomor KTP wajib diisi.')
  if (!formData.emergencyName.trim()) return errorResponse('Nama kontak emergency wajib diisi.')

  try {
    const firestore = getFirebaseFirestore()
    const applicationRef = firestore.collection('applications').doc(applicationId)
    const applicationDoc = await applicationRef.get()
    if (!applicationDoc.exists) return errorResponse('Pengajuan tidak ditemukan.', 404)

    const applicationData = applicationDoc.data() ?? {}
    if (applicationData.ownerFirebaseUid !== identity.uid) {
      return errorResponse('Akses pengajuan ditolak.', 403)
    }

    const product = applicationData.product as keyof typeof DOCUMENT_DEFINITIONS
    if (!Object.hasOwn(DOCUMENT_DEFINITIONS, product)) {
      return errorResponse('Tipe produk pengajuan tidak valid.')
    }

    const formIndex = getFormPendaftaranIndex(product)
    if (formIndex < 0) {
      return errorResponse('Slot dokumen Form Pendaftaran tidak ditemukan.', 404)
    }

    // 1. Generate PDF
    const pdfBytes = await renderRegistrationFormPdf(formData)

    // 2. Ensure Google Drive folder
    const existingFolderId =
      typeof applicationData.driveFolderId === 'string' ? applicationData.driveFolderId : ''
    const folderId = existingFolderId || (await ensureApplicationDriveFolder(applicationData))

    const applicantName =
      typeof applicationData.applicantName === 'string'
        ? applicationData.applicantName
        : formData.fullName
    const fileName = `Form Pendaftaran - ${applicantName.trim() || applicationId}.pdf`

    // 3. Upload PDF to Google Drive
    const uploaded = await uploadDriveFile({
      parentFolderId: folderId,
      fileName,
      mimeType: 'application/pdf',
      bytes: pdfBytes,
    })

    // 4. Update Firestore documents array
    const currentDocuments = Array.isArray(applicationData.documents)
      ? (applicationData.documents as Record<string, unknown>[])
      : []

    const previousFileId =
      typeof currentDocuments[formIndex]?.fileId === 'string'
        ? (currentDocuments[formIndex]?.fileId as string)
        : null

    const definitions = DOCUMENT_DEFINITIONS[product]
    const nextDocuments = definitions.map((definition, index) => {
      if (index !== formIndex) {
        return (
          currentDocuments[index] ?? {
            documentType: definition.label,
            status: 'NOT_UPLOADED',
          }
        )
      }
      return {
        documentType: 'Form Pendaftaran',
        status: 'UPLOADED',
        fileId: uploaded.fileId,
        fileName,
        mimeType: 'application/pdf',
        size: uploaded.size,
      }
    })

    const updatedFormData: RegistrationFormData = {
      ...formData,
      completedAt: new Date().toISOString(),
      pdfFileId: uploaded.fileId,
    }

    await applicationRef.update({
      documents: nextDocuments,
      registrationForm: updatedFormData,
      driveFolderId: folderId,
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Clean up previous Drive file if replaced
    if (previousFileId && previousFileId !== uploaded.fileId) {
      void deleteDriveFile(previousFileId).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      fileId: uploaded.fileId,
      fileName,
    })
  } catch (error) {
    console.error('Error generating/saving registration form:', error)
    const message =
      error instanceof Error ? error.message : 'Gagal memproses dan menyimpan formulir pendaftaran.'
    return errorResponse(message, 500)
  }
}
