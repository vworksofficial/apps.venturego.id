import { renderAkadPdf } from './akad-pdf'
import { formatIndonesianDate } from './registration-form-types'

export type TemplateSuratData = {
  applicantName: string
  idCardNumber?: string
  birthPlace?: string
  birthDate?: string
  gender?: string
  address?: string
  phone?: string
  guardianName?: string
  lastEducation?: string
  destinationCountry?: string
  product?: string
  city?: string
}

function escapeHtml(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function resolveProgramTitle(destinationCountry?: string): string {
  const dest = (destinationCountry ?? '').toUpperCase()
  if (dest.includes('TURKI') || dest === 'TURKEY') {
    return 'Program Persiapan dan Penempatan Kerja ke Turkiye'
  }
  if (dest.includes('JEPANG') || dest === 'JAPAN') {
    return 'Program Persiapan dan Penempatan Kerja ke Jepang'
  }
  if (dest) {
    return `Program Persiapan dan Penempatan Kerja ke ${escapeHtml(destinationCountry)}`
  }
  return 'Program Persiapan dan Penempatan Kerja ke Luar Negeri'
}

function resolveGenderText(gender?: string): string {
  if (!gender) return '........................................'
  const g = gender.toUpperCase()
  if (g === 'LAKI_LAKI' || g === 'MALE' || g === 'L') return 'Laki-laki'
  if (g === 'PEREMPUAN' || g === 'FEMALE' || g === 'P') return 'Perempuan'
  return gender
}

function resolveTitimangsa(city?: string): string {
  const now = new Date()
  const d = now.getDate()
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ]
  const m = months[now.getMonth()]
  const y = now.getFullYear()
  const cityName = city && city.trim() ? city.trim() : 'Wonosobo'
  return `${cityName}, ${d} ${m} ${y}`
}

const COMMON_CSS = `
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    background-color: #f8fafc;
    color: #0f172a;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 10pt;
    line-height: 1.5;
  }
  .a4-page {
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    padding: 12mm 18mm 12mm 18mm;
    margin: 0 auto;
    background: white;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  /* HEADER */
  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0b57d0;
    padding-bottom: 6px;
    margin-bottom: 14px;
  }
  .v-brand-name {
    font-size: 14pt;
    font-weight: 800;
    color: #0b57d0;
    font-family: 'Google Sans', Raleway, Arial, sans-serif;
    line-height: 1.1;
  }
  .v-brand-sub {
    font-size: 9pt;
    font-weight: 700;
    color: #0b57d0;
    font-family: 'Google Sans', Raleway, Arial, sans-serif;
    line-height: 1.1;
  }
  .header-info {
    text-align: right;
    font-size: 6.8pt;
    color: #000000;
    line-height: 1.4;
    max-width: 300px;
  }
  .header-info .company-name {
    font-weight: 800;
    color: #0b57d0;
    font-size: 9pt;
    font-family: 'Google Sans', Raleway, Arial, sans-serif;
  }
  .header-info .company-tagline {
    font-weight: 700;
    color: #0b57d0;
    font-size: 8pt;
    font-family: 'Google Sans', Raleway, Arial, sans-serif;
  }
  /* TITLE */
  .doc-title-container {
    text-align: center;
    margin-bottom: 14px;
  }
  .doc-title {
    font-size: 11.5pt;
    font-weight: 800;
    text-transform: uppercase;
    color: #0f172a;
    letter-spacing: 0.5px;
    line-height: 1.3;
  }
  .doc-subtitle {
    font-size: 9.5pt;
    font-weight: 700;
    color: #0b57d0;
    margin-top: 2px;
  }
  /* TABLE IDENTITY */
  .ident-table {
    width: 100%;
    margin-bottom: 12px;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .ident-table td {
    padding: 2px 0;
    vertical-align: top;
  }
  .ident-label {
    width: 165px;
    color: #334155;
  }
  .ident-sep {
    width: 15px;
    text-align: center;
    color: #64748b;
  }
  .ident-val {
    color: #0f172a;
    font-weight: 600;
  }
  /* CLAUSES */
  .clause-item {
    display: flex;
    gap: 8px;
    margin-top: 6px;
    font-size: 9.5pt;
    text-align: justify;
    line-height: 1.45;
  }
  .clause-num {
    font-weight: bold;
    min-width: 16px;
  }
  .clause-text {
    flex: 1;
  }
  /* SIGNATURE */
  .sig-container {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
  }
  .sig-block {
    width: 230px;
    text-align: center;
    font-size: 9.5pt;
  }
  .meterai-box {
    margin: 10px auto;
    width: 110px;
    height: 58px;
    border: 1px dashed #94a3b8;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7.5pt;
    color: #64748b;
    font-weight: 600;
    background: #f8fafc;
  }
  .sig-name {
    font-weight: bold;
    text-decoration: underline;
  }
  /* FOOTER */
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 5px;
    border-top: 1.5px solid #e2e8f0;
    margin-top: 8px;
    font-size: 7.5pt;
    color: #64748b;
  }
`

export function generateSuratKesediaanHtml(data: TemplateSuratData): string {
  const programTitle = resolveProgramTitle(data.destinationCountry)
  const ttl = [data.birthPlace, formatIndonesianDate(data.birthDate)].filter(Boolean).join(', ')
  const gender = resolveGenderText(data.gender)
  const titimangsa = resolveTitimangsa(data.city)

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Surat Kesediaan Mengangsur dan Pemberian Kuasa</title>
  <style>${COMMON_CSS}</style>
</head>
<body>
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div style="display:flex; flex-direction:column; line-height:1.1;">
          <span class="v-brand-name">Vworks</span>
          <span class="v-brand-sub">Student Venture</span>
        </div>
        <div class="header-info">
          <div class="company-name">PT VWORKS KOLABORASI BERSAMA</div>
          <div class="company-tagline">Your Partner to Leap Together</div>
          <div>Perum Bumi Dieng Indah 2, Blok G5 No. 2 &amp; 3, RW 4</div>
          <div>Andongsili, Kec. Mojotengah, Kabupaten Wonosobo, Jawa Tengah 56351</div>
          <div>082213072665</div>
        </div>
      </div>

      <!-- Title -->
      <div class="doc-title-container">
        <h1 class="doc-title">SURAT KESEDIAAN DAN KESANGGUPAN MENGANGSUR<br/>SERTA PEMBERIAN KUASA (WAKALAH)</h1>
        <div class="doc-subtitle">${escapeHtml(programTitle)}</div>
      </div>

      <p style="font-size:9.5pt; margin-bottom:8px;">Yang bertanda tangan di bawah ini:</p>

      <!-- Identity Table -->
      <table class="ident-table">
        <tr>
          <td class="ident-label">Nama Lengkap</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.applicantName) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Induk KTP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.idCardNumber) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Tempat / Tanggal Lahir</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(ttl) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Jenis Kelamin</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(gender)}</td>
        </tr>
        <tr>
          <td class="ident-label">Alamat Rumah Tinggal</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.address) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Telepon / HP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.phone) || '................................................'}</td>
        </tr>
      </table>

      <p style="font-size:9.5pt; text-align:justify; margin-bottom:6px;">
        Dengan ini menyatakan secara sadar dan sukarela kepada pihak <strong>PT VWORKS KOLABORASI BERSAMA (V-works Student Venture)</strong>:
      </p>

      <!-- Poin Pernyataan & Wakalah -->
      <div class="clause-item">
        <div class="clause-num">1.</div>
        <div class="clause-text">
          <strong>Pemberian Kuasa (Wakalah):</strong> Memberikan kuasa dan wewenang penuh (Wakalah) kepada PT Vworks Kolaborasi Bersama untuk bertindak untuk dan atas nama saya dalam melakukan pengurusan, penyaluran dana talangan, serta pembayaran biaya fasilitas program kepada Lembaga Pelatihan Khusus (LPK) dan/atau mitra penyelenggara terkait berdasarkan prinsip syariah <em>Wakalah bil Ujrah</em>.
        </div>
      </div>

      <div class="clause-item">
        <div class="clause-num">2.</div>
        <div class="clause-text">
          <strong>Kesanggupan Mengangsur:</strong> Menyatakan bersedia dan sanggup untuk membayar kembali seluruh kewajiban angsuran atas fasilitas pembiayaan yang telah disalurkan oleh V-works Student Venture, tepat waktu sebagaimana rincian jadwal dan ketentuan yang disepakati dalam Perjanjian / Dokumen Akad.
        </div>
      </div>

      <div class="clause-item">
        <div class="clause-num">3.</div>
        <div class="clause-text">
          <strong>Konsekuensi Hukum:</strong> Apabila saya lalai atau tidak memenuhi kewajiban pembayaran angsuran tersebut, maka saya bersedia dilaporkan kepada pihak yang berwenang dan bersedia dituntut di muka hukum sesuai ketentuan peraturan perundang-undangan yang berlaku di Republik Indonesia.
        </div>
      </div>

      <p style="font-size:9.5pt; text-align:justify; margin-top:10px;">
        Demikian surat pernyataan kesediaan mengangsur dan pemberian kuasa ini saya buat dengan sebenar-benarnya, dalam keadaan sehat jasmani dan rohani, serta tanpa adanya paksaan atau tekanan dari pihak manapun.
      </p>

      <!-- Tanda Tangan -->
      <div class="sig-container">
        <div class="sig-block">
          <div>${escapeHtml(titimangsa)}</div>
          <div style="margin-top:2px; font-weight:600;">Yang Membuat Pernyataan,</div>
          <div class="meterai-box">Meterai Rp10.000</div>
          <div class="sig-name">( ${escapeHtml(data.applicantName) || '........................................'} )</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-row">
      <div>Dokumen Persyaratan Pembiayaan · PT Vworks Kolaborasi Bersama</div>
      <div>Surat Kesediaan Mengangsur &amp; Kuasa Wakalah</div>
    </div>
  </div>
</body>
</html>`
}

export function generateSuratOrangTuaHtml(data: TemplateSuratData): string {
  const programTitle = resolveProgramTitle(data.destinationCountry)
  const ttl = [data.birthPlace, formatIndonesianDate(data.birthDate)].filter(Boolean).join(', ')
  const gender = resolveGenderText(data.gender)
  const titimangsa = resolveTitimangsa(data.city)

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Surat Pernyataan Persetujuan Orang Tua / Wali</title>
  <style>${COMMON_CSS}</style>
</head>
<body>
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div style="display:flex; flex-direction:column; line-height:1.1;">
          <span class="v-brand-name">Vworks</span>
          <span class="v-brand-sub">Student Venture</span>
        </div>
        <div class="header-info">
          <div class="company-name">PT VWORKS KOLABORASI BERSAMA</div>
          <div class="company-tagline">Your Partner to Leap Together</div>
          <div>Perum Bumi Dieng Indah 2, Blok G5 No. 2 &amp; 3, RW 4</div>
          <div>Andongsili, Kec. Mojotengah, Kabupaten Wonosobo, Jawa Tengah 56351</div>
          <div>082213072665</div>
        </div>
      </div>

      <!-- Title -->
      <div class="doc-title-container">
        <h1 class="doc-title">SURAT PERNYATAAN ORANG TUA / WALI</h1>
        <div class="doc-subtitle">PERSETUJUAN DAN DUKUNGAN PROGRAM</div>
      </div>

      <p style="font-size:9.5pt; margin-bottom:6px;">Yang bertanda tangan di bawah ini:</p>

      <!-- Identity Orang Tua -->
      <table class="ident-table" style="margin-bottom:8px;">
        <tr>
          <td class="ident-label">Nama Lengkap Orang Tua / Wali</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.guardianName) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Induk KTP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">................................................</td>
        </tr>
        <tr>
          <td class="ident-label">Alamat Rumah</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.address) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Telepon / HP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">................................................</td>
        </tr>
      </table>

      <p style="font-size:9.5pt; margin-bottom:6px;">Dengan ini menyatakan bahwa saya adalah orang tua / wali yang sah dari peserta:</p>

      <!-- Identity Peserta -->
      <table class="ident-table" style="margin-bottom:8px;">
        <tr>
          <td class="ident-label">Nama Lengkap Peserta</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.applicantName) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Induk KTP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.idCardNumber) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Tempat / Tanggal Lahir</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(ttl) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Jenis Kelamin</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(gender)}</td>
        </tr>
        <tr>
          <td class="ident-label">Pendidikan Terakhir</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.lastEducation) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Alamat Rumah</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.address) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Telepon / HP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.phone) || '................................................'}</td>
        </tr>
      </table>

      <p style="font-size:9.5pt; text-align:justify; margin-bottom:6px;">
        Melalui surat ini, saya menyatakan:
      </p>

      <!-- Poin Pernyataan Orang Tua -->
      <div class="clause-item">
        <div class="clause-num">1.</div>
        <div class="clause-text">
          Mengetahui, menyetujui, dan memberikan izin sepenuhnya kepada anak saya untuk mengikuti serta menerima fasilitas pembiayaan <strong>${escapeHtml(programTitle)}</strong> yang disediakan melalui V-works Student Venture (PT Vworks Kolaborasi Bersama).
        </div>
      </div>

      <div class="clause-item">
        <div class="clause-num">2.</div>
        <div class="clause-text">
          Mengetahui serta turut mendukung komitmen anak saya dalam menyelesaikan seluruh kewajiban program dan kewajiban angsuran pembiayaan yang telah disepakati bersama hingga selesai.
        </div>
      </div>

      <p style="font-size:9.5pt; text-align:justify; margin-top:10px;">
        Demikian pernyataan ini saya buat dengan sebenar-benarnya tanpa adanya tekanan dan paksaan dari pihak manapun.
      </p>

      <!-- Tanda Tangan -->
      <div class="sig-container">
        <div class="sig-block">
          <div>${escapeHtml(titimangsa)}</div>
          <div style="margin-top:2px; font-weight:600;">Yang Membuat Pernyataan (Orang Tua/Wali),</div>
          <div class="meterai-box">Meterai Rp10.000</div>
          <div class="sig-name">( ${escapeHtml(data.guardianName) || '........................................'} )</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-row">
      <div>Dokumen Persyaratan Pembiayaan · PT Vworks Kolaborasi Bersama</div>
      <div>Surat Pernyataan Orang Tua / Wali</div>
    </div>
  </div>
</body>
</html>`
}

export async function renderSuratKesediaanPdf(data: TemplateSuratData): Promise<Uint8Array> {
  const html = generateSuratKesediaanHtml(data)
  return renderAkadPdf(html)
}

export async function renderSuratOrangTuaPdf(data: TemplateSuratData): Promise<Uint8Array> {
  const html = generateSuratOrangTuaHtml(data)
  return renderAkadPdf(html)
}
