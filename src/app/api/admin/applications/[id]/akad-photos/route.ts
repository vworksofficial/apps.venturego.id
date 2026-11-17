import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseFirestore } from '@/lib/firebase-admin'
import { getStaffSession } from '@/lib/firebase-session'
import { ensureApplicationDriveFolder } from '@/lib/drive-folders'
import { deleteDriveFile, getOrCreateChildFolder, uploadDriveFile } from '@/lib/gdrive'
import type { AkadPhotoRecord } from '@/lib/firebase-data'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const errorResponse = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })

const safeFileName = (value: string) =>
  value
    .replace(/[\r\n"\\/\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffSession()
  if (!staff) return errorResponse('Tidak diizinkan.', 401)

  const { id } = await params
  if (!APPLICATION_ID_PATTERN.test(id)) return errorResponse('Pengajuan tidak ditemukan.', 404)

  try {
    const formData = await request.formData()
    const files = formData.getAll('photos') as File[]

    if (!files || files.length === 0) {
      return errorResponse('Pilih setidaknya satu file foto dokumentasi akad.')
    }

    const firestore = getFirebaseFirestore()
    const applicationRef = firestore.collection('applications').doc(id)
    const snapshot = await applicationRef.get()
    if (!snapshot.exists) {
      return errorResponse('Pengajuan tidak ditemukan.', 404)
    }

    const application = snapshot.data() ?? {}
    const applicantName =
      typeof application.applicantName === 'string' ? application.applicantName : ''

    // Pastikan folder root siswa di Drive tersedia
    const existingFolderId =
      typeof application.driveFolderId === 'string' ? application.driveFolderId : ''
    const studentFolderId = existingFolderId || (await ensureApplicationDriveFolder(application))

    // Dapatkan atau buat subfolder 'Dokumentasi Akad' di dalam folder siswa
    const docsFolderId = await getOrCreateChildFolder(studentFolderId, 'Dokumentasi Akad')

    const uploadedRecords: AkadPhotoRecord[] = []

    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== 'function') continue
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        continue
      }
      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        continue
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_SIZE_BYTES) continue

      const originalName = safeFileName(file.name || 'foto-dokumentasi-akad.jpg')
      const driveFileName = `Dokumentasi Akad - ${applicantName.trim() || id} - ${originalName}`

      const uploaded = await uploadDriveFile({
        parentFolderId: docsFolderId,
        fileName: driveFileName,
        mimeType: file.type,
        bytes,
      })

      uploadedRecords.push({
        fileId: uploaded.fileId,
        fileName: originalName,
        mimeType: file.type,
        size: uploaded.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: staff.email ?? staff.uid,
      })
    }

    if (uploadedRecords.length === 0) {
      return errorResponse(
        'Tidak ada file foto yang valid untuk diunggah (JPG, PNG, atau WEBP maks 10 MB).',
      )
    }

    // Simpan ke Firestore
    await applicationRef.update({
      ...(existingFolderId ? {} : { driveFolderId: studentFolderId }),
      akadPhotos: FieldValue.arrayUnion(...uploadedRecords),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: staff.email ?? staff.uid,
    })

    return NextResponse.json({
      ok: true,
      message: `${uploadedRecords.length} foto dokumentasi berhasil diunggah.`,
      uploaded: uploadedRecords,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Foto dokumentasi akad belum dapat diunggah.'
    return errorResponse(msg, 500)
  }
}
