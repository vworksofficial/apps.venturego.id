import { NextResponse } from 'next/server'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { DOCUMENT_DEFINITIONS, isFormPendaftaranLabel } from '@/lib/documents'
import { downloadDriveFile } from '@/lib/gdrive'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const staff = await getStaffSession()
  if (!staff) return NextResponse.json({ message: 'Tidak diizinkan.' }, { status: 401 })

  const { id, index: indexValue } = await params
  const index = Number(indexValue)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isInteger(index) || index < 0 || index > 60) {
    return NextResponse.json({ message: 'Berkas tidak ditemukan.' }, { status: 404 })
  }

  try {
    const application = await getFirebaseFirestore().collection('applications').doc(id).get()
    const appData = application.data()
    const product = appData?.product as keyof typeof DOCUMENT_DEFINITIONS
    const definitions = DOCUMENT_DEFINITIONS[product]
    const def = definitions?.[index]
    const documents = Array.isArray(appData?.documents)
      ? (appData.documents as Array<{
          documentType?: string
          status?: string
          fileId?: string
          fileName?: string
          mimeType?: string
        }>)
      : []
    const document = def
      ? (documents.find(
          (item) =>
            item.documentType === def.label ||
            (isFormPendaftaranLabel(def.label) && isFormPendaftaranLabel(item.documentType ?? '')),
        ) ?? documents[index])
      : documents[index]
    const fileId = document?.fileId
    if (typeof fileId !== 'string') {
      return NextResponse.json({ message: 'Berkas tidak ditemukan.' }, { status: 404 })
    }

    const contents = await downloadDriveFile(fileId)
    const fileName = String(document.fileName ?? 'dokumen').replace(/[\r\n"\\/]/g, '_')
    const inline = new URL(request.url).searchParams.get('inline') === '1'
    return new Response(contents as unknown as BodyInit, {
      headers: {
        'Content-Type': String(document.mimeType ?? 'application/octet-stream'),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ message: 'Berkas belum dapat diunduh.' }, { status: 404 })
  }
}
