import { renderAkadPdf } from './akad-pdf'
import type { RegistrationFormData } from './registration-form-types'

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

export function generateRegistrationFormHtml(data: RegistrationFormData): string {
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

    /* HEADER */
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
      gap: 7px;
    }
    .v-logo {
      font-size: 34pt;
      font-weight: 900;
      font-style: italic;
      color: #0d8b82;
      line-height: 0.9;
      font-family: 'Arial Black', Arial, sans-serif;
    }
    .v-text-block {
      display: flex;
      flex-direction: column;
    }
    .v-title {
      font-size: 11pt;
      font-weight: 900;
      letter-spacing: 0.8px;
      color: #1e293b;
      line-height: 1.1;
    }
    .v-subtitle {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #334155;
    }
    .header-info {
      text-align: right;
      font-size: 6.8pt;
      color: #334155;
      line-height: 1.35;
      max-width: 320px;
    }
    .header-info .powered {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 1px;
    }
    .header-info .koperasi-title {
      font-weight: 800;
      color: #0d8b82;
      font-size: 7.5pt;
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

    /* FOOTER */
    .footer-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 18px;
      padding-top: 5px;
      border-top: 1.5px solid #e2e8f0;
      margin-top: 6px;
    }
    .koperasi-footer {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .koperasi-sun-badge {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #eab308;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11pt;
      font-weight: 900;
    }
    .koperasi-footer-text {
      font-size: 6.5pt;
      line-height: 1.2;
      color: #475569;
      font-weight: 600;
    }
    .v-footer {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .v-footer-mark {
      font-size: 18pt;
      font-weight: 900;
      font-style: italic;
      color: #0d8b82;
      line-height: 0.9;
      font-family: 'Arial Black', Arial, sans-serif;
    }
    .v-footer-text {
      display: flex;
      flex-direction: column;
      font-size: 5.5pt;
      line-height: 1.1;
      font-weight: 800;
      color: #1e293b;
    }
  </style>
</head>
<body>

  <!-- ==================== HALAMAN 1: DATA PEMOHON ==================== -->
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div class="logo-container">
          <div class="v-logo">V</div>
          <div class="v-text-block">
            <span class="v-title">V-WORKS</span>
            <span class="v-subtitle">STUDENT VENTURE</span>
          </div>
        </div>
        <div class="header-info">
          <div class="powered">Powered by :</div>
          <div class="koperasi-title">Koperasi Konsumen Mentari Jaya Husada</div>
          <div>Sekretariat: Jalan Kyai Wonosobo, RT/RW 08/01 Kel. Kejiwan,</div>
          <div>Kec. Wonosobo, Kab. Wonosobo, Jawa tengah 56311</div>
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
      <div class="koperasi-footer">
        <div class="koperasi-sun-badge">&#9728;</div>
        <div class="koperasi-footer-text">
          <div>Koperasi Konsumen</div>
          <div style="font-weight:800; color:#0d8b82;">Mentari Jaya Husada</div>
        </div>
      </div>
      <div class="v-footer">
        <div class="v-footer-mark">V</div>
        <div class="v-footer-text">
          <span>V-WORKS</span>
          <span style="color:#0d8b82;">STUDENT VENTURE</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== HALAMAN 2: KONTAK EMERGENCY ==================== -->
  <div class="a4-page">
    <div>
      <!-- Header -->
      <div class="header-row">
        <div class="logo-container">
          <div class="v-logo">V</div>
          <div class="v-text-block">
            <span class="v-title">V-WORKS</span>
            <span class="v-subtitle">STUDENT VENTURE</span>
          </div>
        </div>
        <div class="header-info">
          <div class="powered">Powered by :</div>
          <div class="koperasi-title">Koperasi Konsumen Mentari Jaya Husada</div>
          <div>Sekretariat: Jalan Kyai Wonosobo, RT/RW 08/01 Kel. Kejiwan,</div>
          <div>Kec. Wonosobo, Kab. Wonosobo, Jawa tengah 56311</div>
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
      <div class="koperasi-footer">
        <div class="koperasi-sun-badge">&#9728;</div>
        <div class="koperasi-footer-text">
          <div>Koperasi Konsumen</div>
          <div style="font-weight:800; color:#0d8b82;">Mentari Jaya Husada</div>
        </div>
      </div>
      <div class="v-footer">
        <div class="v-footer-mark">V</div>
        <div class="v-footer-text">
          <span>V-WORKS</span>
          <span style="color:#0d8b82;">STUDENT VENTURE</span>
        </div>
      </div>
    </div>
  </div>

</body>
</html>`
}

export async function renderRegistrationFormPdf(data: RegistrationFormData): Promise<Uint8Array> {
  const html = generateRegistrationFormHtml(data)
  return renderAkadPdf(html)
}
