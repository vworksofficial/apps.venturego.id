import { NextResponse } from 'next/server'
import { getFirebaseAuth, getFirebaseFirestore } from '@/lib/firebase-admin'
import { isAllowedSignInProvider } from '@/lib/auth-shared'
import {
  renderSuratKesediaanPdf,
  renderSuratOrangTuaPdf,
  type TemplateSuratData,
} from '@/lib/template-surat-pdf'

const APPLICATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const errorResponse = (message: string, status = 400) => NextResponse.json({ message }, { status })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || token.length > 10_000) return errorResponse('Sesi tidak valid.', 401)

  const { id, type } = await params
  if (!APPLICATION_ID_PATTERN.test(id)) {
    return errorResponse('ID pengajuan tidak valid.', 400)
  }

  if (type !== 'kesediaan-mengangsur' && type !== 'pernyataan-orang-tua') {
    return errorResponse('Jenis template tidak valid.', 400)
  }

  try {
    const identity = await getFirebaseAuth().verifyIdToken(token, true)
    if (!isAllowedSignInProvider(identity.firebase?.sign_in_provider)) {
      return errorResponse('Akses akun tidak diizinkan.', 403)
    }

    const applicationDoc = await getFirebaseFirestore().collection('applications').doc(id).get()
    if (!applicationDoc.exists) {
      return errorResponse('Pengajuan tidak ditemukan.', 404)
    }

    const data = applicationDoc.data() ?? {}
    if (data.ownerFirebaseUid !== identity.uid) {
      return errorResponse('Akses pengajuan ditolak.', 403)
    }

    const personal = (data.personalDetails ?? {}) as Record<string, unknown>
    const destination = String(data.destination ?? '')
    const destinationCountry =
      destination === 'JAPAN' ? 'JEPANG' : destination === 'TURKEY' ? 'TURKIYE' : destination

    const regForm = (data.registrationForm ?? {}) as Record<string, unknown>

    const templateData: TemplateSuratData = {
      applicantName: String(data.applicantName ?? ''),
      idCardNumber: String(personal.idCardNumber ?? regForm.idCardNumber ?? ''),
      birthPlace: String(personal.birthPlace ?? regForm.birthPlace ?? ''),
      birthDate: String(personal.birthDate ?? regForm.birthDate ?? ''),
      gender: String(personal.gender ?? regForm.gender ?? ''),
      address: String(personal.domicileAddress ?? personal.idCardAddress ?? regForm.address ?? ''),
      phone: String(data.phone ?? regForm.mobilePhone ?? ''),
      guardianName: String(data.guardianName ?? regForm.emergencyName ?? ''),
      lastEducation: String(regForm.lastEducation ?? ''),
      destinationCountry,
      product: String(data.product ?? ''),
      city: String(personal.city ?? regForm.city ?? ''),
    }

    let pdfBytes: Uint8Array
    let fileName: string

    if (type === 'kesediaan-mengangsur') {
      pdfBytes = await renderSuratKesediaanPdf(templateData)
      fileName = `Template Surat Kesediaan Mengangsur - ${templateData.applicantName || id}.pdf`
    } else {
      pdfBytes = await renderSuratOrangTuaPdf(templateData)
      fileName = `Template Surat Pernyataan Orang Tua - ${templateData.applicantName || id}.pdf`
    }

    const safeFileName = fileName.replace(/[\r\n"\\/]/g, '_')

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Template belum dapat dibuat.'
    return errorResponse(msg, 500)
  }
}
