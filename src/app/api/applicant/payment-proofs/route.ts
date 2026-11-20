import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import { resolveInstallmentSchedule } from '@/lib/installment-schedule'
import {
  hasValidDocumentSignature,
  isAcceptedDocumentType,
  MAX_DOCUMENT_SIZE_BYTES,
  sanitizeUploadFileName,
} from '@/lib/documents'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import { GDriveError, deleteDriveFile, getOrCreateChildFolder, uploadDriveFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

const errorResponse = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_SIZE_BYTES + 256_000) {
    return errorResponse('Ukuran bukti transaksi maksimal 10 MB.')
  }
  const token = request.headers.get('x-upload-token')
  if (!token || token.length > 10_000) {
    return errorResponse('Sesi telah berakhir. Silakan masuk kembali.', 401)
  }

  let identity
  try {
    identity = await getFirebaseAuth().verifyIdToken(token)
  } catch {
    return errorResponse('Sesi tidak dapat diverifikasi. Silakan masuk kembali.', 401)
  }
  if (!isAllowedSignInProvider(identity.firebase?.sign_in_provider)) {
    return errorResponse('Metode masuk akun ini tidak didukung.', 403)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorResponse('Form pembayaran tidak valid.')
  }

  const applicationDocId = String(form.get('applicationDocId') ?? '')
  const installmentNumber = Number(form.get('installmentNumber'))
  const amount = Number(form.get('amount'))
  const file = form.get('file')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(applicationDocId)) {
    return errorResponse('Pengajuan tidak valid.')
  }
  if (!Number.isSafeInteger(installmentNumber) || installmentNumber < 1) {
    return errorResponse('Nomor angsuran tidak valid.')
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return errorResponse('Masukkan nominal transfer yang valid.')
  }
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return errorResponse('Pilih bukti transaksi maksimal 10 MB.')
  }
  if (!isAcceptedDocumentType(file.type)) {
    return errorResponse('Bukti harus berupa PDF, JPG, atau PNG.')
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return errorResponse('Berkas bukti pembayaran tidak dapat dibaca.')
  }
  if (!hasValidDocumentSignature(file.type, bytes.subarray(0, 8))) {
    return errorResponse('Isi berkas tidak sesuai dengan format yang dipilih.')
  }

  const db = getFirebaseFirestore()
  const applicationRef = db.collection('applications').doc(applicationDocId)
  const applicationSnapshot = await applicationRef.get()
  const application = applicationSnapshot.data()
  if (!applicationSnapshot.exists || application?.ownerFirebaseUid !== identity.uid) {
    return errorResponse('Pengajuan tidak ditemukan untuk sesi ini.', 404)
  }
  if (application.status !== 'ACTIVE') {
    return errorResponse('Pembayaran angsuran baru tersedia setelah akad diterbitkan.', 409)
  }

  const plan =
    application.financialPlan && typeof application.financialPlan === 'object'
      ? (application.financialPlan as Record<string, unknown>)
      : {}
  const schedule = resolveInstallmentSchedule(application.product, plan)
  const scheduledRow = schedule.find((entry) => entry.installment === installmentNumber)
  const scheduledAmount = Number(scheduledRow?.amount)
  if (!Number.isSafeInteger(scheduledAmount) || scheduledAmount < 1 || amount > scheduledAmount) {
    return errorResponse('Nominal transfer tidak boleh melebihi nilai angsuran ini.')
  }

  const paymentsSnapshot = await db
    .collection('payments')
    .where('applicationDocId', '==', applicationDocId)
    .limit(100)
    .get()
  const paidInstallments = new Set<number>(
    Array.isArray(application.paidInstallments)
      ? application.paidInstallments.filter(
          (value): value is number => Number.isInteger(value) && Number(value) > 0,
        )
      : [],
  )
  for (const payment of paymentsSnapshot.docs) {
    const data = payment.data()
    if (data.status === 'PAID' && Number.isInteger(data.installmentNumber)) {
      paidInstallments.add(Number(data.installmentNumber))
    }
  }
  if (paidInstallments.has(installmentNumber)) {
    return errorResponse('Angsuran ini sudah tercatat lunas.', 409)
  }
  const firstUnpaidInstallment = schedule.find(
    (entry) => !paidInstallments.has(entry.installment),
  )?.installment
  if (firstUnpaidInstallment !== installmentNumber) {
    return errorResponse('Pembayaran hanya dapat dikirim untuk angsuran yang sedang berjalan.', 409)
  }

  const existingProofs = await db
    .collection('paymentProofs')
    .where('applicationDocId', '==', applicationDocId)
    .limit(100)
    .get()
  const pendingProofExists = existingProofs.docs.some((document) => {
    const data = document.data()
    return data.installmentNumber === installmentNumber && data.status === 'PENDING_REVIEW'
  })
  if (pendingProofExists) {
    return errorResponse('Bukti angsuran ini sedang menunggu pemeriksaan admin.', 409)
  }

  let uploadedFileId = ''
  try {
    const studentFolderId =
      typeof application.driveFolderId === 'string' && application.driveFolderId
        ? application.driveFolderId
        : await ensureApplicationDriveFolder(application)
    if (!application.driveFolderId) {
      await applicationRef.update({
        driveFolderId: studentFolderId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    const proofFolderId = await getOrCreateChildFolder(
      studentFolderId,
      'Bukti Transaksi Pembayaran',
    )
    const extension = file.name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0]?.toLowerCase() ?? ''
    const amountLabel = `Rp${amount.toLocaleString('id-ID')}`
    const fileName = sanitizeUploadFileName(
      `Angsuran ${installmentNumber} - ${amountLabel} - ${new Date().toISOString().slice(0, 10)}${extension}`,
    )
    const uploaded = await uploadDriveFile({
      parentFolderId: proofFolderId,
      fileName,
      mimeType: file.type,
      bytes,
    })
    uploadedFileId = uploaded.fileId

    const proofRef = db.collection('paymentProofs').doc()
    const submittedAt = new Date().toISOString()
    await proofRef.set({
      applicationDocId,
      applicationId: application.applicationId,
      ownerFirebaseUid: identity.uid,
      applicantName: application.applicantName,
      installmentNumber,
      amount,
      status: 'PENDING_REVIEW',
      fileId: uploaded.fileId,
      fileName,
      mimeType: file.type,
      size: uploaded.size,
      driveFolderId: proofFolderId,
      submittedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ ok: true, submittedAt })
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => {})
    if (error instanceof GDriveError) {
      const status =
        error.code === 'NOT_CONFIGURED'
          ? 503
          : error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'INVALID'
              ? 422
              : 502
      return errorResponse(error.message, status)
    }
    return errorResponse('Bukti pembayaran belum dapat disimpan. Silakan coba lagi.', 500)
  }
}
