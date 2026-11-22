import { NextResponse } from 'next/server'
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import { DOCUMENT_DEFINITIONS, isFormPendaftaranLabel } from '@/lib/documents'
import { downloadDriveFile } from '@/lib/gdrive'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const errorResponse = (message: string, status = 404) => NextResponse.json({ message }, { status })
const safeFileName = (value: string) => value.replace(/[\r\n"\\/\u0000-\u001f]/g, '_').slice(0, 160)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || token.length > 10_000) return errorResponse('Sesi tidak valid.', 401)

  const { id, index: indexValue } = await params
  const index = Number(indexValue)
  if (
    !APPLICATION_ID_PATTERN.test(id) ||
    !/^\d{1,2}$/.test(indexValue) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 60
  ) {
    return errorResponse('Berkas tidak ditemukan.')
  }

  try {
    const identity = await getFirebaseAuth().verifyIdToken(token, true)
    if (!isAllowedSignInProvider(identity.firebase?.sign_in_provider)) {
      return errorResponse('Akun ini tidak dapat mengakses dokumen.', 403)
    }

    const application = await getFirebaseFirestore().collection('applications').doc(id).get()
    const data = application.data()
    if (!application.exists || data?.ownerFirebaseUid !== identity.uid) {
      return errorResponse('Berkas tidak ditemukan pada akun ini.')
    }

    const product = data?.product as keyof typeof DOCUMENT_DEFINITIONS
    const definitions = DOCUMENT_DEFINITIONS[product]
    const def = definitions?.[index]
    const rawDocuments = Array.isArray(data.documents)
      ? (data.documents as Array<{
          documentType?: string
          status?: string
          fileId?: string
          fileName?: string
          mimeType?: string
        }>)
      : []
    const file = def
      ? (rawDocuments.find(
          (item) =>
            item.documentType === def.label ||
            (isFormPendaftaranLabel(def.label) && isFormPendaftaranLabel(item.documentType ?? '')),
        ) ?? rawDocuments[index])
      : rawDocuments[index]
    if (
      !file ||
      (file.status !== 'VERIFIED' && file.status !== 'UPLOADED') ||
      typeof file.fileId !== 'string' ||
      !file.fileId
    ) {
      return errorResponse('Berkas yang sesuai belum tersedia.')
    }

    const bytes = await downloadDriveFile(file.fileId)
    const fileName = safeFileName(String(file.fileName ?? 'dokumen-terverifikasi'))
    const fileMime = typeof file.mimeType === 'string' ? file.mimeType : ''
    const mimeType = ['application/pdf', 'image/jpeg', 'image/png'].includes(fileMime)
      ? fileMime
      : 'application/octet-stream'
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return errorResponse('Berkas belum dapat diunduh.')
  }
}
