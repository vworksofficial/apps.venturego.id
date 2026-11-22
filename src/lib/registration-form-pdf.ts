import { renderAkadPdf } from './akad-pdf'
import { formatIndonesianDate, type RegistrationFormData } from './registration-form-types'

function renderBoxes(text: string | undefined | null, count: number, extraClass = ''): string {
  const clean = (text ?? '').trim().toUpperCase()
  const boxes: string[] = []
  for (let i = 0; i < count; i++) {
    const char = clean[i] ?? ''
    boxes.push(
      `<span class="char-box ${extraClass}">${char === ' ' || char === '' ? '&nbsp;' : escapeHtml(char)}</span>`,
    )
  }
  return `<span class="box-row">${boxes.join('')}</span>`
}

function renderCheckbox(checked: boolean, label: string): string {
  return `<span class="check-item"><span class="check-box ${checked ? 'checked' : ''}">${checked ? '&#10003;' : '&nbsp;'}</span><span class="check-label">${escapeHtml(label)}</span></span>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatIncomeNumber(val: number): string {
  if (!val || val <= 0) return ''
  return val.toLocaleString('id-ID')
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

export function generateRegistrationFormHtml(
  data: RegistrationFormData,
  financingScheme?: string,
): string {
  const isJapan =
    data.destinationCountry.toUpperCase().includes('JEPANG') ||
    data.destinationCountry.toUpperCase() === 'JAPAN'
  const isTurkiye =
    data.destinationCountry.toUpperCase().includes('TURKI') ||
    data.destinationCountry.toUpperCase() === 'TURKEY'

  const titleSub = isJapan
    ? 'TALANG DANA MAGANG KE JEPANG'
    : isTurkiye
      ? 'TALANG DANA KE TURKIYE'
      : `TALANG DANA KE ${escapeHtml(data.destinationCountry.toUpperCase() || 'LUAR NEGERI')}`

  const timeZone = data.contactTimeZone || (isJapan ? 'Waktu Jepang' : 'WIB')

  // Determine program label for footer (matches akad document style)
  const rawScheme = (financingScheme ?? '').toUpperCase()
  const programLabel =
    rawScheme.includes('FULL') || rawScheme.includes('COVER')
      ? 'Program <i>Full Cover</i>'
      : 'Program <i>Dana Keberangkatan</i>'

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Formulir Aplikasi Talang Dana</title>
  <style>
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
      background-color: #f1f5f9;
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .a4-page {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      padding: 10mm 13mm 8mm 13mm;
      margin: 0 auto;
      background: white;
      position: relative;
      page-break-after: always;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .a4-page:last-child {
      page-break-after: auto;
    }

    /* HEADER — matches akad document header */
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 5px;
      margin-bottom: 8px;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo-img {
      width: 38px;
      height: auto;
    }
    .v-text-block {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .v-brand-name {
      font-size: 13pt;
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
      font-size: 6.5pt;
      color: #000000;
      line-height: 1.4;
      max-width: 280px;
    }
    .header-info .company-name {
      font-weight: 800;
      color: #0b57d0;
      font-size: 9pt;
      font-family: 'Google Sans', Raleway, Arial, sans-serif;
      line-height: 1.2;
    }
    .header-info .company-tagline {
      font-weight: 700;
      color: #0b57d0;
      font-size: 8pt;
      font-family: 'Google Sans', Raleway, Arial, sans-serif;
      line-height: 1.2;
    }

    /* TITLE */
    .title-banner {
      text-align: center;
      margin-bottom: 9px;
    }
    .title-banner h1 {
      font-size: 13.5pt;
      font-weight: 900;
      color: #0d8b82;
      letter-spacing: 0.8px;
      line-height: 1.2;
    }
    .title-banner h2 {
      font-size: 11.5pt;
      font-weight: 900;
      color: #0d8b82;
      letter-spacing: 0.5px;
      line-height: 1.2;
    }

    /* SECTION BANNER */
    .section-banner {
      background-color: #0d8b82;
      color: white;
      font-size: 8.5pt;
      font-weight: 800;
      padding: 3.5px 12px;
      border-radius: 3px;
      display: inline-block;
      margin-bottom: 7px;
      letter-spacing: 0.5px;
    }

    /* FORM ROWS */
    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 3.8px;
      font-size: 7.5pt;
    }
    .form-row {
      display: flex;
      align-items: center;
      min-height: 17px;
    }
    .form-label {
      width: 140px;
      flex-shrink: 0;
      font-weight: 600;
      color: #1e293b;
      padding-right: 6px;
      line-height: 1.2;
    }
    .form-content {
      flex: 1;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 3px;
    }

    /* CHARACTER BOXES */
    .box-row {
      display: inline-flex;
      vertical-align: middle;
    }
    .char-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13.5px;
      height: 15.5px;
      border: 1px solid #475569;
      border-right: none;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 7.8pt;
      font-weight: 700;
      color: #0f172a;
      background: white;
      text-transform: uppercase;
      line-height: 1;
      flex-shrink: 0;
    }
    .box-row .char-box:last-child {
      border-right: 1px solid #475569;
    }

    /* CHECKBOXES */
    .check-item {
      display: inline-flex;
      align-items: center;
      margin-right: 10px;
      gap: 4px;
    }
    .check-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      border: 1.2px solid #475569;
      font-size: 8pt;
      font-weight: 900;
      color: #0d8b82;
      line-height: 1;
      background: white;
      border-radius: 1px;
    }
    .check-box.checked {
      background: #f0fdfa;
      border-color: #0d8b82;
    }
    .check-label {
      font-size: 7.5pt;
      color: #1e293b;
      font-weight: 500;
    }

    .sub-label {
      font-size: 7pt;
      font-weight: 700;
      color: #475569;
      margin-left: 4px;
      margin-right: 3px;
    }

    /* FOOTER — matches akad document footer (no paraf box) */
    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 5px;
      border-top: 1.5px solid #e2e8f0;
      margin-top: 6px;
    }
    .footer-program {
      font-size: 8pt;
      color: #94a3b8;
      font-style: normal;
    }
    .footer-program i {
      font-style: italic;
    }
    .footer-page {
      font-size: 8pt;
      color: #64748b;
    }
    .footer-right {
      width: 80px;
    }
  </style>
</head>
<body>

  <!-- ==================== HALAMAN 1: DATA PEMOHON ==================== -->
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div class="logo-container" style="display:flex; align-items:center; gap:9px;">
          ${VENTUREGO_LOGO_BOX_SVG}
          <div class="v-text-block">
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
      <div class="title-banner">
        <h1>FORMULIR APLIKASI</h1>
        <h2>${titleSub}</h2>
      </div>

      <!-- Section Banner -->
      <div class="section-banner">DATA PEMOHON</div>

      <!-- Form Grid -->
      <div class="form-grid">
        <div class="form-row">
          <div class="form-label">Nama Lengkap</div>
          <div class="form-content">${renderBoxes(data.fullName, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">No. KTP</div>
          <div class="form-content">${renderBoxes(data.idCardNumber, 16)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Nama Gadis Ibu Kandung</div>
          <div class="form-content">${renderBoxes(data.motherMaidenName, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">NPWP</div>
          <div class="form-content">${renderBoxes(data.npwp, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Alamat Rumah Terkini</div>
          <div class="form-content">${renderBoxes(data.address.slice(0, 32), 32)}</div>
        </div>
        ${
          data.address.length > 32
            ? `<div class="form-row">
                <div class="form-label"></div>
                <div class="form-content">${renderBoxes(data.address.slice(32, 64), 32)}</div>
              </div>`
            : ''
        }

        <div class="form-row">
          <div class="form-label"></div>
          <div class="form-content">
            <span class="sub-label">RT</span>
            ${renderBoxes(data.rt, 3)}
            <span class="sub-label" style="margin-left:8px;">RW</span>
            ${renderBoxes(data.rw, 3)}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Kelurahan</div>
          <div class="form-content">${renderBoxes(data.kelurahan, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kecamatan</div>
          <div class="form-content">${renderBoxes(data.kecamatan, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kota/Kabupaten</div>
          <div class="form-content">${renderBoxes(data.city, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kode Pos</div>
          <div class="form-content">${renderBoxes(data.postalCode, 5)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">No. Telp.</div>
          <div class="form-content">${renderBoxes(data.homePhone, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">No. Handphone</div>
          <div class="form-content">${renderBoxes(data.mobilePhone, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Dapat dihubungi pada jam</div>
          <div class="form-content">
            ${renderBoxes(data.contactHourStart.replace(/[^0-9]/g, '').slice(0, 4), 4)}
            <span class="sub-label">-</span>
            ${renderBoxes(data.contactHourEnd.replace(/[^0-9]/g, '').slice(0, 4), 4)}
            <span class="sub-label">${escapeHtml(timeZone)}</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Email</div>
          <div class="form-content">${renderBoxes(data.email, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Tempat Lahir</div>
          <div class="form-content">${renderBoxes(data.birthPlace, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Tanggal Lahir</div>
          <div class="form-content">${renderBoxes(formatIndonesianDate(data.birthDate), 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Jenis Kelamin</div>
          <div class="form-content">
            ${renderCheckbox(data.gender === 'LAKI_LAKI', 'Laki-laki')}
            ${renderCheckbox(data.gender === 'PEREMPUAN', 'Perempuan')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Agama</div>
          <div class="form-content">
            ${renderCheckbox(data.religion === 'ISLAM', 'Islam')}
            ${renderCheckbox(data.religion === 'PROTESTAN', 'Protestan')}
            ${renderCheckbox(data.religion === 'KATHOLIK', 'Katholik')}
            ${renderCheckbox(data.religion === 'HINDU', 'Hindu')}
            ${renderCheckbox(data.religion === 'BUDHA', 'Budha')}
            ${renderCheckbox(data.religion === 'KONG_HU_CHU', 'Kong Hu Chu')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Jumlah tanggungan</div>
          <div class="form-content">
            ${renderBoxes(String(data.dependentsCount || 0), 2)}
            <span class="sub-label">Orang</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Pendidikan Terakhir</div>
          <div class="form-content">
            ${renderCheckbox(data.lastEducation === 'SD', 'SD')}
            ${renderCheckbox(data.lastEducation === 'SMP', 'SMP')}
            ${renderCheckbox(data.lastEducation === 'SMA_SEDERAJAT', 'SMA/Sederajat')}
            ${renderCheckbox(data.lastEducation === 'D1', 'D1')}
            ${renderCheckbox(data.lastEducation === 'D2', 'D2')}
            ${renderCheckbox(data.lastEducation === 'D3', 'D3')}
            ${renderCheckbox(data.lastEducation === 'D4', 'D4')}
            ${renderCheckbox(data.lastEducation === 'S1', 'S1')}
            ${renderCheckbox(data.lastEducation === 'S2', 'S2')}
            ${renderCheckbox(data.lastEducation === 'S3', 'S3')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Negara Tertuju</div>
          <div class="form-content">${renderBoxes(data.destinationCountry, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Nama Perusahaan</div>
          <div class="form-content">${renderBoxes(data.companyName, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Bidang Usaha</div>
          <div class="form-content">${renderBoxes(data.companyBusiness, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Posisi/Peran</div>
          <div class="form-content">${renderBoxes(data.companyRole, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Alamat Perusahaan</div>
          <div class="form-content">${renderBoxes(data.companyAddress.slice(0, 32), 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kota Perusahaan</div>
          <div class="form-content">${renderBoxes(data.companyCity, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">No. Telepon Perusahaan</div>
          <div class="form-content">${renderBoxes(data.companyPhone, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Tanggal Mulai Bekerja</div>
          <div class="form-content">
            ${renderBoxes(data.workStartDate.replace(/[^0-9]/g, '').slice(0, 8), 8)}
            <span class="sub-label">(DDMMYYYY)</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Status Pekerjaan</div>
          <div class="form-content">
            ${renderCheckbox(data.employmentStatus === 'MAGANG', 'Magang')}
            ${renderCheckbox(data.employmentStatus === 'KONTRAK', 'Kontrak')}
            ${renderCheckbox(data.employmentStatus === 'LAINNYA', `Lainnya: ${escapeHtml(data.employmentStatusOther || '')}`)}
            ${
              data.contractDurationYears
                ? `<span class="sub-label" style="margin-left:6px;">Lama Kontrak:</span>${renderBoxes(data.contractDurationYears, 2)}<span class="sub-label">Th.</span>`
                : ''
            }
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Pendapatan Bulanan</div>
          <div class="form-content">
            <span class="sub-label" style="margin-right:4px;">Rp.</span>
            ${renderBoxes(formatIncomeNumber(data.monthlyIncome).replace(/[^0-9]/g, ''), 12)}
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Page 1 -->
    <div class="footer-row">
      <div class="footer-program">${programLabel}</div>
      <div class="footer-page">Halaman 1 dari 2</div>
      <div class="footer-right"></div>
    </div>
  </div>

  <!-- ==================== HALAMAN 2: KONTAK EMERGENCY ==================== -->
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div class="logo-container" style="display:flex; align-items:center; gap:9px;">
          ${VENTUREGO_LOGO_BOX_SVG}
          <div class="v-text-block">
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

      <!-- Section Banner -->
      <div class="section-banner" style="margin-top:12px;">KONTAK EMERGENCY</div>

      <!-- Form Grid Kontak Emergency -->
      <div class="form-grid" style="gap:7px; margin-top:6px;">
        <div class="form-row">
          <div class="form-label">Nama Lengkap</div>
          <div class="form-content">${renderBoxes(data.emergencyName, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Hubungan</div>
          <div class="form-content">
            ${renderCheckbox(data.emergencyRelation === 'ORANG_TUA', 'Orang tua')}
            ${renderCheckbox(data.emergencyRelation === 'ANAK', 'Anak')}
            ${renderCheckbox(data.emergencyRelation === 'SAUDARA_KANDUNG', 'Saudara Kandung')}
          </div>
        </div>
        <div class="form-row">
          <div class="form-label"></div>
          <div class="form-content">
            ${renderCheckbox(data.emergencyRelation === 'SAUDARA_KANDUNG_ORANG_TUA', 'Saudara Kandung dari Orang tua')}
            ${renderCheckbox(data.emergencyRelation === 'LAINNYA', `Lainnya: ${escapeHtml(data.emergencyRelationOther || '')}`)}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">No. Telp.</div>
          <div class="form-content">${renderBoxes(data.emergencyPhone, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">No. HP / WhatsApp</div>
          <div class="form-content">${renderBoxes(data.emergencyMobile, 20)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Jenis Kelamin</div>
          <div class="form-content">
            ${renderCheckbox(data.emergencyGender === 'LAKI_LAKI', 'Laki-laki')}
            ${renderCheckbox(data.emergencyGender === 'PEREMPUAN', 'Perempuan')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Alamat Tempat Tinggal</div>
          <div class="form-content">${renderBoxes(data.emergencyAddress.slice(0, 32), 32)}</div>
        </div>
        ${
          data.emergencyAddress.length > 32
            ? `<div class="form-row">
                <div class="form-label"></div>
                <div class="form-content">${renderBoxes(data.emergencyAddress.slice(32, 64), 32)}</div>
              </div>`
            : ''
        }

        <div class="form-row">
          <div class="form-label"></div>
          <div class="form-content">
            <span class="sub-label">RT</span>
            ${renderBoxes(data.emergencyRt, 3)}
            <span class="sub-label" style="margin-left:8px;">RW</span>
            ${renderBoxes(data.emergencyRw, 3)}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Kelurahan</div>
          <div class="form-content">${renderBoxes(data.emergencyKelurahan, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kecamatan</div>
          <div class="form-content">${renderBoxes(data.emergencyKecamatan, 32)}</div>
        </div>

        <div class="form-row">
          <div class="form-label">Kota</div>
          <div class="form-content">
            ${renderBoxes(data.emergencyCity, 20)}
            <span class="sub-label" style="margin-left:8px;">Kode Pos:</span>
            ${renderBoxes(data.emergencyPostalCode, 5)}
          </div>
        </div>

        <div class="form-row" style="margin-top:4px;">
          <div class="form-label">Domisili</div>
          <div class="form-content">
            ${renderCheckbox(data.emergencyCohabitation === 'TINGGAL_SERUMAH', 'Tinggal Serumah')}
            ${renderCheckbox(data.emergencyCohabitation === 'TIDAK_TINGGAL_SERUMAH', 'Tidak Tinggal Serumah')}
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">Dapat Dihubungi Pada Jam</div>
          <div class="form-content">
            ${renderBoxes(data.emergencyContactHourStart.replace(/[^0-9]/g, '').slice(0, 4), 4)}
            <span class="sub-label">-</span>
            ${renderBoxes(data.emergencyContactHourEnd.replace(/[^0-9]/g, '').slice(0, 4), 4)}
            <span class="sub-label">${escapeHtml(data.emergencyContactTimeZone || 'WIB')}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Page 2 -->
    <div class="footer-row">
      <div class="footer-program">${programLabel}</div>
      <div class="footer-page">Halaman 2 dari 2</div>
      <div class="footer-right"></div>
    </div>
  </div>

</body>
</html>`
}

export async function renderRegistrationFormPdf(
  data: RegistrationFormData,
  financingScheme?: string,
): Promise<Uint8Array> {
  const html = generateRegistrationFormHtml(data, financingScheme)
  return renderAkadPdf(html)
}
