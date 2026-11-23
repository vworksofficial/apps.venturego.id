import { renderAkadPreviewHtml } from '@/lib/akad-preview'
import { NextResponse } from 'next/server'
import { buildAkadDocument, refreshAkadPreviewHeader } from '@/lib/akad-document'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import {
  deleteDriveFile,
  downloadDriveFile,
  exportDriveFileAsPdf,
  uploadDocxAsGoogleDoc,
} from '@/lib/gdrive'
import {
  getExistingStudentNumber,
  peekNextStudentNumber,
  studentNumberSequence,
} from '@/lib/student-number'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const runtime = 'nodejs'

const errorResponse = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })

const safeFileName = (value: string) =>
  value
    .replace(/[\r\n"\\\/\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160)

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession()
  if (!staff) return errorResponse('Tidak diizinkan.', 401)

  const { id } = await params
  if (!APPLICATION_ID_PATTERN.test(id)) return errorResponse('Pengajuan tidak ditemukan.', 404)

  const mode = new URL(request.url).searchParams.get('mode')

  try {
    const applicationRef = getFirebaseFirestore().collection('applications').doc(id)
    const application = await applicationRef.get()
    if (!application.exists) return errorResponse('Pengajuan tidak ditemukan.', 404)
    const applicationData = application.data() ?? {}
    const plan = (applicationData.financialPlan ?? {}) as Record<string, unknown>
    const akadDocument = (plan.akadDocument ?? null) as Record<string, unknown> | null

    const applicantName =
      typeof applicationData.applicantName === 'string' ? applicationData.applicantName : 'Siswa'

    // ── Mode PDF: ekspor via Google Drive — hasil identik dengan tampilan Google Docs ──
    if (mode === 'pdf') {
      const productLabel =
        applicationData.product === 'FULL_COVER'
          ? "Program Full Cover - Wakalah bil Ujrah + Ju'alah"
          : 'Program Dana Keberangkatan - Wakalah bil Ujrah'
      const pdfFileName = safeFileName(`Draft Akad VSV - ${applicantName} (${productLabel}).pdf`)
      const asciiFileName = pdfFileName.replace(/[^\x20-\x7e]/g, '_')

      let pdfBytes: Uint8Array

      if (
        akadDocument &&
        typeof akadDocument.driveFileId === 'string' &&
        akadDocument.driveFileId
      ) {
        // Dokumen sudah diterbitkan — download DOCX dari Drive, convert ke Google Docs, export PDF
        const docxBytes = await downloadDriveFile(akadDocument.driveFileId)
        const existingFolderId =
          typeof applicationData.driveFolderId === 'string' ? applicationData.driveFolderId : ''
        const folderId = existingFolderId || (await ensureApplicationDriveFolder(applicationData))
        const tempFileName = `[PREVIEW PDF] Akad VSV - ${applicantName.trim() || id}`
        const uploaded = await uploadDocxAsGoogleDoc({
          parentFolderId: folderId,
          fileName: tempFileName,
          bytes: docxBytes,
        })
        try {
          pdfBytes = await exportDriveFileAsPdf(uploaded.fileId)
        } finally {
          void deleteDriveFile(uploaded.fileId).catch(() => {})
        }
      } else {
        // Draft — build DOCX, upload sementara ke Drive, ekspor sebagai PDF, lalu hapus
        const ownerUid =
          typeof applicationData.ownerFirebaseUid === 'string'
            ? applicationData.ownerFirebaseUid
            : ''
        const existingNumber =
          (typeof applicationData.studentNumber === 'string'
            ? applicationData.studentNumber
            : null) ??
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

        const tempFileName = `[PREVIEW PDF] Akad VSV - ${applicantName.trim() || id}`
        // Upload dan konversi ke Google Docs format agar bisa di-export sebagai PDF
        const uploaded = await uploadDocxAsGoogleDoc({
          parentFolderId: folderId,
          fileName: tempFileName,
          bytes: built.bytes,
        })

        try {
          pdfBytes = await exportDriveFileAsPdf(uploaded.fileId)
        } finally {
          // Hapus file sementara dari Drive (fire and forget)
          void deleteDriveFile(uploaded.fileId).catch(() => {})
        }

        if (!existingFolderId) {
          void applicationRef.update({ driveFolderId: folderId }).catch(() => {})
        }
      }

      return new Response(pdfBytes as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    // ── Mode DOCX / HTML: alur lama ──
    let bytes: Uint8Array
    let fileName: string
    let draftBuild = false

    if (akadDocument && typeof akadDocument.driveFileId === 'string') {
      bytes = await downloadDriveFile(akadDocument.driveFileId)
      fileName =
        typeof akadDocument.fileName === 'string' && akadDocument.fileName
          ? akadDocument.fileName
          : `${id}-akad.docx`
    } else {
      const ownerUid =
        typeof applicationData.ownerFirebaseUid === 'string' ? applicationData.ownerFirebaseUid : ''
      const existingNumber =
        (typeof applicationData.studentNumber === 'string'
          ? applicationData.studentNumber
          : null) ??
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
      bytes = built.bytes
      fileName = `${id}-draft-akad.docx`
      draftBuild = true
    }

    if (mode === 'docx') {
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': DOCX_MIME,
          'Content-Disposition': `attachment; filename="${safeFileName(fileName)}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    bytes = await refreshAkadPreviewHeader(bytes)
    const previewHtml = await renderAkadPreviewHtml(bytes, { draft: draftBuild })
    return new Response(previewHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return errorResponse('Pratinjau dokumen akad belum dapat dibuat. Coba lagi.', 502)
  }
}
