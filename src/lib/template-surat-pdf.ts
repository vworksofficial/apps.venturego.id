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

const VENTUREGO_LOGO_BOX_SVG = `<svg width="34" height="34" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
  <rect width="512" height="512" rx="112" fill="#0b57d0"/>
  <svg x="120" y="120" width="272" height="272" viewBox="167.5 0 24 23">
    <path fill="#fff" fill-rule="evenodd" d="M180.339 4.48017C180.37 4.67741 180.477 4.81856 180.662 4.90363L181.954 5.50918C182.253 4.79837 182.558 4.20241 182.868 3.7213C183.178 3.24019 183.587 2.71362 184.096 2.1416L183.371 1.97153C183.186 1.92667 183.001 1.92991 182.816 1.98125C182.632 2.0326 182.471 2.12297 182.334 2.25239L180.507 3.98007C180.364 4.11623 180.308 4.28293 180.339 4.48017Z" clip-rule="evenodd"/>
    <path fill="#fff" fill-rule="evenodd" d="M182.834 5.82348C182.837 5.95013 182.884 6.06135 182.975 6.15713L184.683 7.96332C184.774 8.05911 184.882 8.11209 185.008 8.12227C185.135 8.13245 185.258 8.11258 185.38 8.06267C186.026 7.80091 186.59 7.52686 187.071 7.24049C187.552 6.95413 188.056 6.56183 188.583 6.06359C189.349 5.33912 189.95 4.51161 190.385 3.58103C190.821 2.65046 191.031 1.74531 191.016 0.865582C191.019 0.786255 191.001 0.709286 190.962 0.634674C190.924 0.560062 190.879 0.495397 190.828 0.440679C190.777 0.385961 190.715 0.33761 190.642 0.295625C190.57 0.253641 190.494 0.231536 190.414 0.22931C189.536 0.165152 188.621 0.324564 187.668 0.707547C186.715 1.09053 185.855 1.64438 185.089 2.3691C184.568 2.86114 184.15 3.34083 183.834 3.80818C183.518 4.27553 183.212 4.8248 182.914 5.45601C182.858 5.57434 182.831 5.69683 182.834 5.82348Z" clip-rule="evenodd"/>
    <path fill="#fff" fill-rule="evenodd" d="M187.492 4.69466C187.179 4.68568 186.916 4.5683 186.702 4.34252C186.489 4.11888 186.386 3.84971 186.395 3.535C186.404 3.2203 186.521 2.95698 186.747 2.74504C186.973 2.5331 187.242 2.43083 187.555 2.43821C187.868 2.4456 188.131 2.56271 188.344 2.78955C188.558 3.01639 188.66 3.28583 188.652 3.59787C188.643 3.90991 188.526 4.17297 188.3 4.38703C188.074 4.6011 187.805 4.70364 187.492 4.69466Z" clip-rule="evenodd"/>
    <path fill="#fff" fill-rule="evenodd" d="M185.273 9.01893L185.806 10.3427C185.881 10.5316 186.016 10.647 186.211 10.689C186.406 10.7309 186.576 10.6839 186.719 10.548L188.546 8.82036C188.683 8.69122 188.782 8.53584 188.844 8.35424C188.906 8.17263 188.919 7.98809 188.884 7.8006L188.755 7.06758C188.156 7.54409 187.607 7.92356 187.109 8.20599C186.612 8.48842 186 8.7594 185.273 9.01893Z" clip-rule="evenodd"/>
    <path fill="#fff" fill-rule="evenodd" d="M176.712 18.72C179.473 18.72 181.712 16.4814 181.712 13.72C181.712 10.9585 179.473 8.71997 176.712 8.71997C173.95 8.71997 171.712 10.9585 171.712 13.72C171.712 16.4814 173.95 18.72 176.712 18.72ZM167.712 13.72C167.712 8.74941 171.741 4.71997 176.712 4.71997C181.682 4.71997 185.712 8.74941 185.712 13.72C185.712 18.6905 181.682 22.72 176.712 22.72H168.712C168.16 22.72 167.712 22.2723 167.712 21.72V13.72Z" clip-rule="evenodd"/>
  </svg>
</svg>`

function escapeHtml(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Format teks dengan huruf kapital di setiap awal kata (Title Case).
 */
function formatCapitalizedWords(str: string | undefined | null): string {
  if (!str) return ''
  const trimmed = str.trim()
  if (!trimmed) return ''
  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return ''
      // Pertahankan singkatan umum jika ada (KTP, LPK, RT, RW, SD, SMP, SMA)
      const upper = word.toUpperCase()
      if (
        [
          'KTP',
          'LPK',
          'RT',
          'RW',
          'SD',
          'SMP',
          'SMA',
          'SMK',
          'D1',
          'D2',
          'D3',
          'D4',
          'S1',
          'S2',
          'S3',
        ].includes(upper)
      ) {
        return upper
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
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
    return `Program Persiapan dan Penempatan Kerja ke ${formatCapitalizedWords(destinationCountry)}`
  }
  return 'Program Persiapan dan Penempatan Kerja ke Luar Negeri'
}

function resolveGenderText(gender?: string): string {
  if (!gender) return '........................................'
  const g = gender.toUpperCase()
  if (g === 'LAKI_LAKI' || g === 'MALE' || g === 'L') return 'Laki-laki'
  if (g === 'PEREMPUAN' || g === 'FEMALE' || g === 'P') return 'Perempuan'
  return formatCapitalizedWords(gender)
}

function resolveEducationText(education?: string): string {
  if (!education) return '........................................'
  const e = education.toUpperCase()
  if (e === 'SMA_SEDERAJAT') return 'SMA / Sederajat'
  if (['SD', 'SMP', 'SMA', 'SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3'].includes(e)) return e
  return formatCapitalizedWords(education)
}

/**
 * Bagian tempat dikosongkan (diubah menjadi titik-titik) sebelum koma dan tanggal.
 * Contoh: "...................................., 22 November 2026"
 */
function resolveTitimangsa(): string {
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
  return `...................................., ${d} ${m} ${y}`
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
  .logo-container {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .v-brand-name {
    font-size: 13.5pt;
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
    margin-bottom: 12px;
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
    margin-bottom: 10px;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  .ident-table td {
    padding: 2.5px 0;
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
    margin-top: 5px;
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
  /* SIGNATURE — Extra vertical space for physical signature */
  .sig-container {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
  }
  .sig-block {
    width: 250px;
    text-align: center;
    font-size: 9.5pt;
  }
  .sig-title {
    margin-top: 4px;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .meterai-box {
    margin: 18px auto 26px auto;
    width: 115px;
    height: 72px;
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
    margin-top: 6px;
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
  const applicantName = formatCapitalizedWords(data.applicantName)
  const birthPlace = formatCapitalizedWords(data.birthPlace)
  const ttl = [birthPlace, formatIndonesianDate(data.birthDate)].filter(Boolean).join(', ')
  const gender = resolveGenderText(data.gender)
  const address = formatCapitalizedWords(data.address)
  const titimangsa = resolveTitimangsa()

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
      <!-- Header with Logo Box VentureGo -->
      <div class="header-row">
        <div class="logo-container">
          ${VENTUREGO_LOGO_BOX_SVG}
          <div style="display:flex; flex-direction:column; line-height:1.1;">
            <span class="v-brand-name">Vworks</span>
            <span class="v-brand-sub">Student Venture</span>
          </div>
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
          <td class="ident-val">${escapeHtml(applicantName) || '................................................'}</td>
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
          <td class="ident-val">${escapeHtml(address) || '................................................'}</td>
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

      <p style="font-size:9.5pt; text-align:justify; margin-top:8px;">
        Demikian surat pernyataan kesediaan mengangsur dan pemberian kuasa ini saya buat dengan sebenar-benarnya, dalam keadaan sehat jasmani dan rohani, serta tanpa adanya paksaan atau tekanan dari pihak manapun.
      </p>

      <!-- Tanda Tangan dengan jarak vertikal lega -->
      <div class="sig-container">
        <div class="sig-block">
          <div>${escapeHtml(titimangsa)}</div>
          <div class="sig-title">Yang Membuat Pernyataan,</div>
          <div class="meterai-box">Meterai Rp10.000</div>
          <div class="sig-name">( ${escapeHtml(applicantName) || '........................................'} )</div>
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
  const guardianName = formatCapitalizedWords(data.guardianName)
  const applicantName = formatCapitalizedWords(data.applicantName)
  const birthPlace = formatCapitalizedWords(data.birthPlace)
  const ttl = [birthPlace, formatIndonesianDate(data.birthDate)].filter(Boolean).join(', ')
  const gender = resolveGenderText(data.gender)
  const education = resolveEducationText(data.lastEducation)
  const address = formatCapitalizedWords(data.address)
  const titimangsa = resolveTitimangsa()

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
      <!-- Header with Logo Box VentureGo -->
      <div class="header-row">
        <div class="logo-container">
          ${VENTUREGO_LOGO_BOX_SVG}
          <div style="display:flex; flex-direction:column; line-height:1.1;">
            <span class="v-brand-name">Vworks</span>
            <span class="v-brand-sub">Student Venture</span>
          </div>
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

      <p style="font-size:9.5pt; margin-bottom:5px;">Yang bertanda tangan di bawah ini:</p>

      <!-- Identity Orang Tua -->
      <table class="ident-table" style="margin-bottom:6px;">
        <tr>
          <td class="ident-label">Nama Lengkap Orang Tua / Wali</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(guardianName) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Induk KTP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">................................................</td>
        </tr>
        <tr>
          <td class="ident-label">Alamat Rumah Tinggal</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(address) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Telepon / HP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">................................................</td>
        </tr>
      </table>

      <p style="font-size:9.5pt; margin-bottom:5px;">Dengan ini menyatakan bahwa saya adalah orang tua / wali yang sah dari peserta:</p>

      <!-- Identity Peserta -->
      <table class="ident-table" style="margin-bottom:6px;">
        <tr>
          <td class="ident-label">Nama Lengkap Peserta</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(applicantName) || '................................................'}</td>
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
          <td class="ident-val">${escapeHtml(education)}</td>
        </tr>
        <tr>
          <td class="ident-label">Alamat Rumah Tinggal</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(address) || '................................................'}</td>
        </tr>
        <tr>
          <td class="ident-label">Nomor Telepon / HP</td>
          <td class="ident-sep">:</td>
          <td class="ident-val">${escapeHtml(data.phone) || '................................................'}</td>
        </tr>
      </table>

      <p style="font-size:9.5pt; text-align:justify; margin-bottom:5px;">
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

      <p style="font-size:9.5pt; text-align:justify; margin-top:8px;">
        Demikian pernyataan ini saya buat dengan sebenar-benarnya tanpa adanya tekanan dan paksaan dari pihak manapun.
      </p>

      <!-- Tanda Tangan dengan jarak vertikal lega -->
      <div class="sig-container">
        <div class="sig-block">
          <div>${escapeHtml(titimangsa)}</div>
          <div class="sig-title">Yang Membuat Pernyataan (Orang Tua/Wali),</div>
          <div class="meterai-box">Meterai Rp10.000</div>
          <div class="sig-name">( ${escapeHtml(guardianName) || '........................................'} )</div>
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
