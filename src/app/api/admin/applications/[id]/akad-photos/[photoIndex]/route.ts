import { NextResponse } from 'next/server'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { downloadDriveFile } from '@/lib/gdrive'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; photoIndex: string }> },
) {
  const staff = await getStaffSession()
  if (!staff) return NextResponse.json({ message: 'Tidak diizinkan.' }, { status: 401 })

  const { id, photoIndex: photoIndexStr } = await params
  const index = Number(photoIndexStr)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isInteger(index) || index < 0 || index > 100) {
    return NextResponse.json({ message: 'Foto tidak ditemukan.' }, { status: 404 })
  }

  try {
    const application = await getFirebaseFirestore().collection('applications').doc(id).get()
    const photos = application.data()?.akadPhotos
    const photo = Array.isArray(photos) ? photos[index] : null
    const fileId = photo?.fileId
    if (typeof fileId !== 'string') {
      return NextResponse.json({ message: 'Foto tidak ditemukan.' }, { status: 404 })
    }

    const contents = await downloadDriveFile(fileId)
    const fileName = String(photo.fileName ?? 'foto-dokumentasi-akad.jpg').replace(
      /[\r\n"\\/]/g,
      '_',
    )
    const inline = new URL(request.url).searchParams.get('inline') !== '0'

    return new Response(contents as unknown as BodyInit, {
      headers: {
        'Content-Type': String(photo.mimeType ?? 'image/jpeg'),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ message: 'Foto dokumentasi belum dapat diunduh.' }, { status: 404 })
  }
}
