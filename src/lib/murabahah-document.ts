import 'server-only'

import { terbilang } from './terbilang'
import type { MurabahahFinancialPlan, AlumniBusinessDetails } from './murabahah-financing'

export type RenderMurabahahDocumentOptions = {
  contractNumber: string // "014/MRB-JPN/VSV-WSB/VIII/2026"
  dateDayName?: string // "Jumat"
  dateFormatted?: string // "28 Agustus 2026"
  agreementCity?: string // "Wonosobo"
  firstParty: {
    companyName: string // "Vworks Student Venture (PT Vworks Kolaborasi Bersama)"
    companyAddress: string // "Perum Bumi Dieng Indah 2 blok. G5 no. 2 & 3. RW. 4, Andongsili, Kec. Mojotengah, Kabupaten Wonosobo, Jawa Tengah 56351"
    representativeName: string // "Adam Doni Mauladi, S.T."
    representativeKtp: string // "3307100507990001"
    representativePhone: string // "082213072665"
  }
  secondParty: {
    applicantName: string
    birthPlaceAndDate: string
    address: string
    religion: string
    ktpNumber: string
    phone: string
  }
  witness: {
    name: string // "Panut, S.Hum."
    institution: string // "V-works Student Venture"
  }
  businessDetails?: AlumniBusinessDetails
  financialPlan: MurabahahFinancialPlan
}

function formatRupiah(amount: number): string {
  return `Rp${Number(amount || 0).toLocaleString('id-ID')}`
}

function formatRupiahWithWords(amount: number): string {
  const rupiahText = formatRupiah(amount)
  const words = terbilang(amount).toLowerCase()
  return `${rupiahText} (${words} rupiah)`
}

/**
 * Render naskah resmi Akad Murabahah (Perjanjian Kerjasama Jual Beli Barang Modal Usaha)
 * dalam format HTML A4 multi-halaman yang identik dengan dokumen fisik VentureGo.
 */
export function renderMurabahahAkadHtml(options: RenderMurabahahDocumentOptions): string {
  const {
    contractNumber,
    dateDayName = 'Jumat',
    dateFormatted = '28 Agustus 2026',
    agreementCity = 'Wonosobo',
    firstParty,
    secondParty,
    witness,
    businessDetails,
    financialPlan,
  } = options

  const p = financialPlan.principal
  const adm = financialPlan.adminFeeAmount
  const net = financialPlan.netDisbursedAmount
  const margin = financialPlan.marginAmount
  const total = financialPlan.totalObligation
  const monthly = financialPlan.monthlyInstallment
  const tenor = financialPlan.tenorMonths

  const items =
    financialPlan.itemProcurementPlan.length > 0
      ? financialPlan.itemProcurementPlan
      : [
          {
            itemName: 'Tambahan material bangunan peternakan kandang peternak',
            estimatedCost: Math.round(p * 0.6),
          },
          {
            itemName: 'Tambahan pengadaan bibit unggas peternakan',
            estimatedCost: Math.round(p * 0.4),
          },
        ]

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Perjanjian Kerjasama Akad Murabahah - ${secondParty.applicantName}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 20mm 20mm 20mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #111;
      margin: 0;
      padding: 0;
      background: #f1f5f9;
    }
    .page-container {
      width: 210mm;
      min-height: 297mm;
      padding: 22mm 22mm 20mm 22mm;
      margin: 10mm auto;
      background: white;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
      position: relative;
      page-break-after: always;
    }
    @media print {
      body { background: transparent; }
      .page-container {
        margin: 0;
        box-shadow: none;
        width: 100%;
        min-height: 100%;
        padding: 0;
      }
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .logo-v {
      width: 44px;
      height: 48px;
    }
    .brand-text h1 {
      font-family: Arial, sans-serif;
      font-size: 13pt;
      font-weight: 900;
      margin: 0;
      color: #127c56;
      letter-spacing: 0.5px;
    }
    .brand-text p {
      font-family: Arial, sans-serif;
      font-size: 8.5pt;
      font-weight: 800;
      margin: 0;
      color: #1a202c;
      letter-spacing: 1.5px;
    }
    .doc-title {
      text-align: center;
      margin-bottom: 20px;
    }
    .doc-title h2 {
      font-size: 13pt;
      font-weight: bold;
      text-decoration: underline;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .doc-title p {
      font-size: 10pt;
      margin: 4px 0 0 0;
    }
    .verse-quote {
      text-align: center;
      font-style: italic;
      font-size: 9.5pt;
      margin: 12px 15px;
      line-height: 1.4;
    }
    .opening-text {
      text-align: justify;
      margin-bottom: 12px;
    }
    .ident-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px 0;
    }
    .ident-table td {
      vertical-align: top;
      padding: 2px 0;
      font-size: 10.5pt;
    }
    .ident-table td.num { width: 22px; }
    .ident-table td.lbl { width: 180px; }
    .ident-table td.col { width: 12px; }
    .article-title {
      text-align: center;
      font-weight: bold;
      margin: 16px 0 8px 0;
    }
    .article-title .pasal { font-size: 11pt; display: block; }
    .article-title .judul { font-size: 10.5pt; text-transform: uppercase; }
    ol.pasal-list, ol.sub-list {
      margin: 0;
      padding-left: 20px;
      text-align: justify;
    }
    ol.pasal-list > li {
      margin-bottom: 6px;
    }
    ol.sub-list {
      list-style-type: lower-alpha;
      margin-top: 4px;
      padding-left: 18px;
    }
    .highlight-box {
      background: #e6f4ea;
      padding: 1px 4px;
      font-weight: bold;
      border-radius: 2px;
    }
    .paraf-box {
      position: absolute;
      bottom: 18mm;
      right: 22mm;
      border: 1.5px solid #222;
      width: 90px;
      height: 38px;
      text-align: center;
      font-size: 8pt;
      font-family: Arial, sans-serif;
    }
    .paraf-box .lbl {
      border-bottom: 1px solid #444;
      padding: 2px 0;
      background: #fafafa;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      text-align: center;
      margin-top: 40px;
      gap: 20px;
    }
    .sig-name {
      margin-top: 75px;
      font-weight: bold;
      text-decoration: underline;
    }
    .witness-section {
      text-align: center;
      margin-top: 35px;
    }
    .watermark-bg {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.05;
      pointer-events: none;
      width: 320px;
    }
  </style>
</head>
<body>

  <!-- HALAMAN 1 -->
  <div class="page-container">
    <div class="header-logo">
      <svg class="logo-v" viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 10 L45 92 L62 92 L95 10 L75 10 L54 68 L32 10 Z" fill="#127c56"/>
      </svg>
      <div class="brand-text">
        <h1>V-WORKS</h1>
        <p>STUDENT VENTURE</p>
      </div>
    </div>

    <div class="doc-title">
      <h2>PERJANJIAN KERJASAMA</h2>
      <p>No. ${contractNumber}</p>
    </div>

    <div class="verse-quote">
      <div style="font-size: 16pt; margin-bottom: 4px;">🙛</div>
      “...... hai orang-orang yang beriman, janganlah kalian saling memakan (mengambil) harta sesamamu dengan jalan batil kecuali dengan jalan perniagaan yang berlaku dengan sukarela diantaramu....”<br/>
      <strong>(QS. An – Nisa’ (4): 29)</strong>
    </div>

    <div class="opening-text">
      Dengan berlindung kepada Allah SWT dan senantiasa memohon Rahmat-Nya. Akad ini dibuat dan ditandatangani pada:<br/>
      <table style="width: 100%; margin: 4px 0;">
        <tr><td style="width: 80px;">Hari</td><td style="width: 12px;">:</td><td><strong>${dateDayName}</strong></td></tr>
        <tr><td>Tanggal</td><td>:</td><td><strong>${dateFormatted}</strong></td></tr>
        <tr><td style="vertical-align: top;">Tempat</td><td style="vertical-align: top;">:</td><td>Kantor Vworks Student Venture, Perum Bumi Dieng Indah 2 blok. G5 no. 2 &amp; 3. RW. 4, Andongsili, Kec. Mojotengah, Kabupaten Wonosobo, Jawa Tengah 56351</td></tr>
      </table>
      kami yang bertanda tangan di bawah ini:
    </div>

    <table class="ident-table">
      <tr>
        <td class="num">1.</td>
        <td class="lbl">Nama Perusahaan</td>
        <td class="col">:</td>
        <td><strong>${firstParty.companyName}</strong></td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Alamat</td>
        <td class="col">:</td>
        <td>${firstParty.companyAddress}</td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Nama Penanggung Jawab</td>
        <td class="col">:</td>
        <td><strong>${firstParty.representativeName}</strong></td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">No. KTP</td>
        <td class="col">:</td>
        <td>${firstParty.representativeKtp}</td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Nomor HP</td>
        <td class="col">:</td>
        <td>${firstParty.representativePhone}</td>
      </tr>
    </table>
    <div style="text-align: justify; margin-bottom: 12px;">
      Dalam hal ini bertindak untuk dan atas nama PT Vworks Kolaborasi Bersama dan untuk selanjutnya disebut <strong>PIHAK PERTAMA</strong>.
    </div>

    <table class="ident-table">
      <tr>
        <td class="num">2.</td>
        <td class="lbl">Nama</td>
        <td class="col">:</td>
        <td><strong>${secondParty.applicantName}</strong></td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Tempat dan Tanggal Lahir</td>
        <td class="col">:</td>
        <td>${secondParty.birthPlaceAndDate}</td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Alamat</td>
        <td class="col">:</td>
        <td>${secondParty.address}</td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">Agama</td>
        <td class="col">:</td>
        <td>${secondParty.religion}</td>
      </tr>
      <tr>
        <td></td>
        <td class="lbl">No. KTP</td>
        <td class="col">:</td>
        <td>${secondParty.ktpNumber}</td>
      </tr>
    </table>
    <div style="text-align: justify; margin-bottom: 14px;">
      Dalam hal ini berwenang bertindak untuk dan atas nama diri sendiri dan untuk selanjutnya disebut <strong>PIHAK KEDUA</strong>.
    </div>

    <div style="text-align: justify;">
      Selanjutnya para pihak bersama ini menerangkan bahwa telah saling setuju dan mufakat untuk mengadakan perjanjian-perjanjian dengan syarat-syarat dan ketentuan-ketentuan sebagai berikut:
    </div>

    <div class="article-title">
      <span class="pasal">Pasal 1</span>
      <span class="judul">PENGANTAR AKAD JUAL BELI (MURABAHAH)</span>
    </div>
    <ol class="pasal-list">
      <li><strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong> sepakat untuk mengadakan Perjanjian Jual Beli Barang Modal Usaha dengan cara angsuran, yang dalam prinsip Syariah disebut sebagai akad <em>Murabahah</em>.</li>
      <li>Melalui akad <em>Murabahah</em> ini, <strong>PIHAK PERTAMA</strong> akan membelikan barang modal sesuai permintaan <strong>PIHAK KEDUA</strong> (yang detailnya terdapat pada Pasal 2), dan kemudian menjualnya kembali kepada <strong>PIHAK KEDUA</strong> dengan harga yang sudah ditambahkan keuntungan (<em>Margin</em>) yang disepakati bersama.</li>
      <li><strong>PIHAK PERTAMA</strong> berstatus sebagai Penjual Barang Modal dan berhak menerima pelunasan. <strong>PIHAK KEDUA</strong> berstatus sebagai Pembeli Barang Modal dan berkewajiban membayar melalui skema angsuran.</li>
    </ol>

    <div class="paraf-box">
      <div class="lbl">Paraf</div>
    </div>
  </div>

  <!-- HALAMAN 2 -->
  <div class="page-container">
    <div class="article-title" style="margin-top: 0;">
      <span class="pasal">Pasal 2</span>
      <span class="judul">OBJEK JUAL BELI DAN CARA MEMBELI</span>
    </div>
    <ol class="pasal-list">
      <li>
        Untuk keperluan dagangnya, <strong>PIHAK KEDUA</strong> meminta <strong>PIHAK PERTAMA</strong> untuk membelikan barang-barang yang akan digunakan sebagai modal usaha, yaitu untuk membeli:
        <ol class="sub-list">
          ${items.map((item) => `<li>${item.itemName}${item.specification ? ` (${item.specification})` : ''}.</li>`).join('')}
        </ol>
      </li>
      <li>Nilai atau harga beli barang-barang modal ini yang dibayarkan oleh <strong>PIHAK PERTAMA</strong> kepada toko atau supplier adalah sebesar <span class="highlight-box">${formatRupiahWithWords(p)}</span>.</li>
      <li>Karena <strong>PIHAK KEDUA</strong> berada di tempat usaha, <strong>PIHAK PERTAMA</strong> menunjuk <strong>PIHAK KEDUA</strong> sebagai perwakilan (agen) untuk menerima dan membelanjakan uang pembelian barang modal sebesar <span class="highlight-box">${formatRupiahWithWords(p)}</span> tersebut, atas nama <strong>PIHAK PERTAMA</strong>.</li>
      <li>Penyerahan barang (jual beli) dianggap terjadi ketika uang <span class="highlight-box">${formatRupiahWithWords(p)}</span> ditransfer oleh <strong>PIHAK PERTAMA</strong> kepada <strong>PIHAK KEDUA</strong> sebagai perwakilan.</li>
      <li>Dalam menjalankan perannya sebagai perwakilan (<em>Wakalah</em>), <strong>PIHAK KEDUA</strong> menyetujui bahwa akan dikenakan Biaya Administrasi Pencairan sebesar <span class="highlight-box">${formatRupiahWithWords(adm)}</span> atau ${financialPlan.adminFeePercentage}% dari Harga Pokok Barang, yang akan dipotong langsung dari uang pembelian barang sebesar <span class="highlight-box">${formatRupiahWithWords(p)}</span>.</li>
      <li>Dengan adanya pemotongan biaya administrasi, maka uang bersih yang diterima <strong>PIHAK KEDUA</strong> sebagai perwakilan (<em>Wakil</em>) untuk membelikan barang modal adalah sebesar <span class="highlight-box">${formatRupiahWithWords(net)}</span>.</li>
      <li>Penyerahan barang (jual beli) dianggap terjadi ketika uang <span class="highlight-box">${formatRupiahWithWords(net)}</span> ditransfer oleh <strong>PIHAK PERTAMA</strong> kepada <strong>PIHAK KEDUA</strong> sebagai perwakilan.</li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 3</span>
      <span class="judul">HARGA JUAL DAN KEUNTUNGAN</span>
    </div>
    <ol class="pasal-list">
      <li>Harga Jual ini ditetapkan dan disepakati di awal akad serta tidak akan berubah sampai lunas.</li>
      <li>
        Rincian Harga Jual:
        <ol class="sub-list">
          <li>Harga Pokok Barang (<em>Tsamān</em>): <span class="highlight-box">${formatRupiahWithWords(p)}</span></li>
          <li>Keuntungan (<em>Margin/Ribh</em>) <strong>PIHAK PERTAMA</strong>: <span class="highlight-box">${formatRupiahWithWords(margin)}</span></li>
          <li>Total Harga Jual (<em>Harga Murabahah</em>): <span class="highlight-box">${formatRupiahWithWords(total)}</span></li>
        </ol>
      </li>
      <li><strong>PIHAK KEDUA</strong> menyetujui total Harga Jual sebesar <span class="highlight-box">${formatRupiahWithWords(total)}</span> ini.</li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 4</span>
      <span class="judul">KEWAJIBAN PEMBAYARAN (ANGSURAN)</span>
    </div>
    <ol class="pasal-list">
      <li><strong>PIHAK KEDUA</strong> berkewajiban membayar lunas Total Harga Jual (Harga Murabahah) sebesar <span class="highlight-box">${formatRupiahWithWords(total)}</span> kepada <strong>PIHAK PERTAMA</strong>.</li>
      <li>Pembayaran Total Harga Jual dilakukan secara angsuran sebanyak <strong>${tenor} (${terbilang(tenor).toLowerCase()}) kali</strong>.</li>
      <li>
        Jadwal Angsuran:
        <ol class="sub-list">
          <li>Angsuran Bulanan: <span class="highlight-box">${formatRupiahWithWords(monthly)}</span>.</li>
          <li>Jangka waktu angsuran adalah <strong>${tenor} (${terbilang(tenor).toLowerCase()}) Bulan</strong>.</li>
          <li>Angsuran wajib dibayarkan setiap tanggal <strong>25 (dua puluh lima)</strong> bulan berjalan.</li>
        </ol>
      </li>
    </ol>

    <div class="paraf-box">
      <div class="lbl">Paraf</div>
    </div>
  </div>

  <!-- HALAMAN 3 -->
  <div class="page-container">
    <div class="article-title" style="margin-top: 0;">
      <span class="pasal">Pasal 5</span>
      <span class="judul">RISIKO DAN TANGGUNG JAWAB USAHA</span>
    </div>
    <ol class="pasal-list">
      <li>Sejak barang modal usaha diserahkan dan diterima oleh <strong>PIHAK KEDUA</strong>, segala risiko yang terjadi pada barang tersebut (kerusakan, kehilangan, atau penurunan nilai) sepenuhnya menjadi tanggung jawab <strong>PIHAK KEDUA</strong>.</li>
      <li><strong>PIHAK PERTAMA</strong> tidak terlibat dalam keuntungan atau kerugian usaha <strong>PIHAK KEDUA</strong>. Kewajiban untuk membayar angsuran tetap berlaku tanpa memperhatikan apakah usahanya untung atau rugi.</li>
      <li>Kewajiban <strong>PIHAK KEDUA</strong> kepada <strong>PIHAK PERTAMA</strong> hanyalah melunasi Total Harga Jual (Harga Murabahah) sesuai Pasal 4.</li>
      <li>
        Hak dan Batasan Penjualan Inventaris:
        <ol class="sub-list">
          <li><strong>PIHAK KEDUA</strong> berhak dan wajib menjual Barang Modal Usaha (Stok/Inventaris) ini dalam rangka menjalankan usaha dan memenuhi kewajiban angsuran.</li>
          <li>Namun, <strong>PIHAK KEDUA</strong> tidak diperkenankan untuk menjaminkan (mengagunkan) Stok/Inventaris yang dibiayai oleh akad ini kepada pihak ketiga manapun sebelum kewajiban pelunasan kepada <strong>PIHAK PERTAMA</strong> diselesaikan secara penuh.</li>
        </ol>
      </li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 6</span>
      <span class="judul">DOKUMEN PERSYARATAN ADMINISTRASI</span>
    </div>
    <ol class="pasal-list">
      <li>Dalam rangka memenuhi kelengkapan administrasi dan verifikasi data <strong>PIHAK KEDUA</strong> sebagai Pembeli dalam Akad Murabahah ini, <strong>PIHAK KEDUA</strong> wajib menyerahkan dokumen-dokumen pendukung sebagai persyaratan.</li>
      <li>Dokumen persyaratan yang wajib diserahkan oleh <strong>PIHAK KEDUA</strong> kepada <strong>PIHAK PERTAMA</strong> meliputi: Dokumen asli (Akta Kelahiran asli, Kartu Keluarga Asli, serta Ijazah Asli SD, SMP, dan SMA) dan juga dokumen pendukung lainnya (tertera pada form pendaftaran Vworks Students Venture).</li>
      <li><strong>PIHAK PERTAMA</strong> mengakui telah menerima dokumen-dokumen tersebut dengan merujuk pada tanggal penandatanganan Surat Tanda Terima Dokumen terpisah yang merupakan bagian integral dari perjanjian ini.</li>
      <li>Dokumen-dokumen sebagaimana dimaksud pada Poin 2 berfungsi semata-mata sebagai <strong>kelengkapan administrasi dan alat verifikasi data</strong>. Dokumen-dokumen ini <strong>bukan merupakan aset jaminan (Rahn)</strong> yang dapat dinilai, dijual, atau dikelola untuk pelunasan utang, dan <strong>PIHAK PERTAMA</strong> tidak memiliki kuasa untuk melakukan pengelolaan atau penjualan atas dokumen tersebut.</li>
      <li>
        Sehubungan dengan penyerahan dokumen ini, <strong>PIHAK PERTAMA</strong> bertanggung jawab penuh untuk:
        <ol class="sub-list">
          <li>Menjaga keamanan dan menjamin kerahasiaan dokumen-dokumen tersebut selama jangka waktu berlakunya perjanjian ini.</li>
          <li>Mengembalikan seluruh dokumen asli kepada <strong>PIHAK KEDUA</strong> tanpa syarat, segera setelah seluruh kewajiban Total Harga Jual (Harga Murabahah) dilunasi secara penuh oleh <strong>PIHAK KEDUA</strong>.</li>
        </ol>
      </li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 7</span>
      <span class="judul">KELALAIAN (WANPRESTASI)</span>
    </div>
    <ol class="pasal-list">
      <li>Jika <strong>PIHAK KEDUA</strong> lalai atau tidak dapat memenuhi seluruh kewajibannya sebagaimana ditetapkan dalam Surat Perjanjian ini (yaitu tidak membayar angsuran tepat waktu), maka <strong>PIHAK PERTAMA</strong> berhak menagih segera secara sekaligus sisa seluruh kewajiban Total Harga Jual (Harga Murabahah) kepada <strong>PIHAK KEDUA</strong>.</li>
      <li>Pelaksanaan penagihan sekaligus sisa kewajiban ini dapat dilakukan setelah <strong>PIHAK KEDUA</strong> dinyatakan lalai yaitu setelah melakukan <strong>3 kali penunggakan</strong> (tidak membayar angsuran selama 3 bulan berturut-turut) dan <strong>PIHAK PERTAMA</strong> telah memberikan Surat Peringatan secara tertulis.</li>
    </ol>

    <div class="paraf-box">
      <div class="lbl">Paraf</div>
    </div>
  </div>

  <!-- HALAMAN 4 -->
  <div class="page-container">
    <div class="article-title" style="margin-top: 0;">
      <span class="pasal">Pasal 8</span>
      <span class="judul">HAL-HAL YANG TIDAK DIINGINKAN</span>
    </div>
    <ol class="pasal-list">
      <li>
        <strong>PIHAK PERTAMA</strong> berhak menagih seluruh sisa kewajiban angsuran Total Harga Jual (Harga Murabahah) kepada <strong>PIHAK KEDUA</strong> secara sekaligus, apabila:
        <ol class="sub-list">
          <li><strong>PIHAK KEDUA</strong> dinyatakan bangkrut atau pailit oleh Pengadilan sebelum tanggal jatuh tempo perjanjian ini dicapai.</li>
          <li><strong>PIHAK KEDUA</strong> meninggal dunia sebelum tanggal jatuh tempo perjanjian ini, kecuali jika ahli waris <strong>PIHAK KEDUA</strong> sanggup dan bersedia memenuhi kewajiban-kewajiban yang berkaitan dengan isi Surat Perjanjian ini.</li>
        </ol>
      </li>
      <li>Sisa kewajiban sebagaimana dimaksud pada Poin 1b wajib dilunasi oleh ahli waris <strong>PIHAK KEDUA</strong> dari harta peninggalan (<em>Tirkah</em>) yang tersedia. Apabila harta peninggalan tidak mencukupi, ahli waris dianjurkan untuk bersedia melunasinya secara sukarela (<em>Tabarru'</em>).</li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 9</span>
      <span class="judul">BIAYA PENAGIHAN &amp; PENYELESAIAN PERSELISIHAN</span>
    </div>
    <ol class="pasal-list">
      <li>Semua biaya penagihan sisa kewajiban angsuran Total Harga Jual (Harga Murabahah) yang disebabkan oleh kelalaian <strong>PIHAK KEDUA</strong>, termasuk biaya juru sita, biaya kuasa <strong>PIHAK PERTAMA</strong>, dan biaya-biaya riil lainnya, menjadi tanggungan dan wajib dibayarkan oleh <strong>PIHAK KEDUA</strong>.</li>
      <li>Biaya penagihan yang dimaksud adalah biaya riil (<em>actual cost incurred</em>) yang dikeluarkan <strong>PIHAK PERTAMA</strong>, dan bukan merupakan denda atau tambahan berupa persentase dari sisa pokok kewajiban.</li>
      <li><strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong> yang telah mengikatkan diri dalam perjanjian <em>Murabahah</em> ini telah bersepakat untuk menempuh jalan kekeluargaan atau musyawarah untuk mufakat guna menyelesaikan hal-hal atau perselisihan yang mungkin timbul.</li>
      <li>Apabila ternyata jalan musyawarah dianggap tidak berhasil untuk mendapatkan penyelesaian yang melegakan kedua belah pihak, kedua belah pihak bersepakat untuk menempuh upaya hukum dengan memilih domisili pada kantor <strong>pengadilan/pengadilan agama ${agreementCity}, Jawa Tengah</strong> dengan segala akibatnya.</li>
    </ol>

    <div class="article-title">
      <span class="pasal">Pasal 10</span>
      <span class="judul">ADDENDUM</span>
    </div>
    <div style="text-align: justify; margin-bottom: 12px;">
      Kedua belah pihak telah bersepakat, bahwa segala sesuatu yang belum diatur dalam surat perjanjian ini, akan diatur dalam <em>addendum-addendum</em> dan atau surat-surat dan atau lampiran-lampiran yang akan dibuat dan menjadi bagian yang tidak terpisahkan dari perjanjian ini.
    </div>

    <div class="article-title">
      <span class="pasal">Pasal 11</span>
      <span class="judul">PENUTUP</span>
    </div>
    <div style="text-align: justify; margin-bottom: 24px;">
      Surat perjanjian ini dibuat di atas kertas bermaterei secukupnya yang ditandatangani dan dibuat rangkap dua berkekuatan hukum yang sama serta masing-masing dipegang oleh <strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong>.
    </div>

    <table style="width: 100%; margin-top: 15px;">
      <tr>
        <td style="width: 50%;"></td>
        <td style="width: 50%; text-align: left; padding-left: 20px;">
          Dibuat di : ${agreementCity}<br/>
          Tanggal : ${dateFormatted}
        </td>
      </tr>
    </table>

    <div class="paraf-box">
      <div class="lbl">Paraf</div>
    </div>
  </div>

  <!-- HALAMAN 5 -->
  <div class="page-container">
    <div class="signature-grid">
      <div>
        <strong>PIHAK PERTAMA</strong>
        <div class="sig-name">${firstParty.representativeName}</div>
      </div>
      <div>
        <strong>PIHAK KEDUA</strong>
        <div class="sig-name">${secondParty.applicantName}</div>
      </div>
    </div>

    <div class="witness-section">
      <p style="margin-bottom: 6px;">Saksi-saksi:</p>
      <strong>${witness.institution}</strong>
      <div class="sig-name" style="margin-top: 65px;">${witness.name}</div>
    </div>

    <div class="paraf-box">
      <div class="lbl">Paraf</div>
    </div>
  </div>

</body>
</html>`
}
