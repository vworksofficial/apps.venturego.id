import { NextResponse } from 'next/server'
import { buildAkadDocument } from '@/lib/akad-document'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { deleteDriveFile, uploadDriveFile } from '@/lib/gdrive'
import {
  getExistingStudentNumber,
  peekNextStudentNumber,
  studentNumberSequence,
} from '@/lib/student-number'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession()
  if (!staff) {
    return NextResponse.json({ ok: false, message: 'Tidak diizinkan.' }, { status: 401 })
  }

  const { id } = await params
  if (!APPLICATION_ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, message: 'Pengajuan tidak ditemukan.' }, { status: 404 })
  }

  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(id)
    const applicationSnap = await applicationRef.get()
    if (!applicationSnap.exists) {
      return NextResponse.json(
        { ok: false, message: 'Pengajuan tidak ditemukan.' },
        { status: 404 },
      )
    }

    const applicationData = applicationSnap.data() ?? {}
    const plan = (applicationData.financialPlan ?? {}) as Record<string, unknown>
    const akadDocument = (plan.akadDocument ?? null) as Record<string, unknown> | null

    // 1. Jika sudah diterbitkan, langsung buka berkas resmi di Google Docs
    if (akadDocument && typeof akadDocument.driveFileId === 'string' && akadDocument.driveFileId) {
      return NextResponse.redirect(
        `https://docs.google.com/document/d/${akadDocument.driveFileId}/edit`,
        { status: 302 },
      )
    }

    // 2. Jika masih draft, buat berkas draft .docx terbaru dan simpan sementara di Google Drive
    const ownerUid =
      typeof applicationData.ownerFirebaseUid === 'string' ? applicationData.ownerFirebaseUid : ''
    const existingNumber =
      (typeof applicationData.studentNumber === 'string' ? applicationData.studentNumber : null) ??
      (ownerUid ? await getExistingStudentNumber(ownerUid, applicationData.destination) : null)
    const studentNumber =
      existingNumber ??
      (await peekNextStudentNumber(applicationData.destination, applicationData.createdAt))
    const sequence = (studentNumber ? studentNumberSequence(studentNumber) : null) ?? '0000'

    const built = await buildAkadDocument({
      application: applicationData,
      studentSequence: sequence,
      issuedAt: new Date(),
      draft: true,
    })

    const existingFolderId =
      typeof applicationData.driveFolderId === 'string' ? applicationData.driveFolderId : ''
    const folderId = existingFolderId || (await ensureApplicationDriveFolder(applicationData))

    const applicantName =
      typeof applicationData.applicantName === 'string' ? applicationData.applicantName : 'Siswa'
    const fileName = `[DRAFT] Akad VSV - ${applicantName.trim() || id}.docx`

    // Bersihkan berkas draft sebelumnya jika pernah diunggah agar folder Drive tetap rapi
    const previousDraftFileId =
      typeof plan.draftAkadDriveFileId === 'string' ? plan.draftAkadDriveFileId : null
    if (previousDraftFileId) {
      try {
        await deleteDriveFile(previousDraftFileId)
      } catch {
        // Abaikan jika berkas draft lama sudah tidak ada
      }
    }

    const uploaded = await uploadDriveFile({
      parentFolderId: folderId,
      fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: built.bytes,
    })

    // Simpan referensi draft file ID ke Firestore
    await applicationRef.update({
      'financialPlan.draftAkadDriveFileId': uploaded.fileId,
      ...(existingFolderId ? {} : { driveFolderId: folderId }),
    })

    return NextResponse.redirect(`https://docs.google.com/document/d/${uploaded.fileId}/edit`, {
      status: 302,
    })
  } catch (error) {
    console.error('GDOCS ERROR STACK:', error)
    const message =
      error instanceof Error ? error.message : 'Gagal membuka draft akad di Google Docs.'
    return new Response(
      `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Gagal Membuka Google Docs</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 420px; text-align: center; }
    h1 { font-size: 1.125rem; color: #b91c1c; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #64748b; line-height: 1.5; }
    a { display: inline-block; margin-top: 1.25rem; padding: 0.5rem 1rem; background: #0b57d0; color: white; border-radius: 0.5rem; font-weight: 600; text-decoration: none; font-size: 0.8125rem; }
    a:hover { background: #0842a0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Gagal Membuka Google Docs</h1>
    <p>${message}</p>
    <a href="javascript:window.close()">Tutup Jendela</a>
  </div>
</body>
</html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  }
}
