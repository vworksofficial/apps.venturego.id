import { NextResponse } from 'next/server'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { downloadDriveFile } from '@/lib/gdrive'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getStaffSession())) {
    return NextResponse.json({ message: 'Tidak diizinkan.' }, { status: 401 })
  }
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return NextResponse.json({ message: 'Bukti pembayaran tidak ditemukan.' }, { status: 404 })
  }
  try {
    const snapshot = await getFirebaseFirestore().collection('paymentProofs').doc(id).get()
    const proof = snapshot.data()
    if (!snapshot.exists || typeof proof?.fileId !== 'string') {
      return NextResponse.json({ message: 'Bukti pembayaran tidak ditemukan.' }, { status: 404 })
    }
    const mimeType = ['application/pdf', 'image/jpeg', 'image/png'].includes(String(proof.mimeType))
      ? String(proof.mimeType)
      : 'application/octet-stream'
    const fileName = String(proof.fileName ?? 'bukti-pembayaran').replace(/[\r\n"\\/]/g, '_')
    const contents = await downloadDriveFile(proof.fileId)
    return new Response(contents as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ message: 'Bukti pembayaran belum dapat dibuka.' }, { status: 404 })
  }
}
