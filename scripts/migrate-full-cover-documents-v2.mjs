import { readFileSync } from 'node:fs'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const envFile = new URL('../.env.local', import.meta.url)
try {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=(.*)$/)
    if (!match) continue
    const key = match[1]
    if (process.env[key]) continue
    const raw = match[2].trim()
    const value =
      (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw
    process.env[key] = value.replace(/\\n/g, '\n')
  }
} catch {
  // .env.local is optional when the environment is already provided.
}

const NEW_FULL_COVER_LABELS = [
  'Pas Foto',
  'Scan KTP',
  'Scan Akta Kelahiran',
  'Scan KK (Kartu Keluarga)',
  'Ijazah SD/MI',
  'Ijazah SMP/MTs/SLTP',
  'Ijazah SMA/SMK/MA/SLTA',
  'Scan SKCK (Jika ada)',
  'Scan KTP Orang Tua / Wali',
  'Scan Surat Nikah Orang Tua / Wali',
  'Scan Passport',
  'Scan Kontrak Kerja',
  'Scan Visa Kerja atau COE',
  'Scan Surat Rekomendasi LPK',
  'Scan Form Pendaftaran',
  'Scan Surat Kesediaan Mengangsur',
  'Scan Surat Mengetahui Orang Tua',
]

const LEGACY_LABEL_MAP = {
  'KTP siswa': 'Scan KTP',
  'Kartu Keluarga': 'Scan KK (Kartu Keluarga)',
  'Rekomendasi LPK': 'Scan Surat Rekomendasi LPK',
  'Akta kelahiran': 'Scan Akta Kelahiran',
}

const writeMode = process.argv.includes('--write')
const projectId = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
if (!projectId || !clientEmail || !privateKey) {
  console.error('Firebase Admin environment variables are missing.')
  process.exit(1)
}

const app =
  getApps().find((existing) => existing.name === 'migrate-full-cover-documents') ??
  initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), projectId },
    'migrate-full-cover-documents',
  )
const firestore = getFirestore(app)

const snapshot = await firestore
  .collection('applications')
  .where('product', '==', 'FULL_COVER')
  .get()

let migrated = 0
let alreadyCurrent = 0

for (const document of snapshot.docs) {
  const data = document.data()
  const current = Array.isArray(data.documents) ? data.documents : []
  if (current.length === NEW_FULL_COVER_LABELS.length) {
    alreadyCurrent += 1
    console.log(`skip  ${document.id} (sudah ${NEW_FULL_COVER_LABELS.length} slot)`)
    continue
  }

  const byLabel = new Map()
  for (const entry of current) {
    if (entry && typeof entry.documentType === 'string') byLabel.set(entry.documentType, entry)
  }

  const carriedLabels = new Set([
    ...NEW_FULL_COVER_LABELS,
    ...Object.keys(LEGACY_LABEL_MAP),
    ...Object.values(LEGACY_LABEL_MAP),
  ])
  const unmappedUploaded = current.filter(
    (entry) =>
      entry && entry.fileId && entry.documentType && !carriedLabels.has(entry.documentType),
  )
  if (unmappedUploaded.length > 0) {
    console.error(
      `ABORT ${document.id}: berkas terunggah tanpa padanan label baru: ${unmappedUploaded
        .map((entry) => entry.documentType)
        .join(', ')}`,
    )
    process.exit(1)
  }

  const nextDocuments = NEW_FULL_COVER_LABELS.map((label) => {
    const legacyLabel =
      current.find((entry) => LEGACY_LABEL_MAP[entry.documentType] === label)?.documentType ??
      Object.entries(LEGACY_LABEL_MAP).find(([, target]) => target === label)?.[0]
    const entry = byLabel.get(label) ?? (legacyLabel ? byLabel.get(legacyLabel) : undefined)
    if (entry && (entry.status !== 'NOT_UPLOADED' || entry.fileId)) {
      return { ...entry, documentType: label }
    }
    return { documentType: label, status: 'NOT_UPLOADED' }
  })

  const uploaded = nextDocuments.filter((entry) => entry.status !== 'NOT_UPLOADED')
  console.log(
    `${writeMode ? 'write' : 'plan'} ${document.id}: ${current.length} slot -> ${nextDocuments.length} slot (${uploaded.length} terunggah)`,
  )
  for (const entry of uploaded) {
    console.log(`       ${entry.documentType} -> ${entry.status}`)
  }

  if (writeMode) {
    await document.ref.update({ documents: nextDocuments })
    migrated += 1
  }
}

console.log(
  `${writeMode ? 'Selesai.' : 'Dry-run.'} ${migrated} dimigrasi, ${alreadyCurrent} dilewati, total ${snapshot.size} pengajuan Full Cover.`,
)
if (!writeMode) console.log('Jalankan ulang dengan argumen --write untuk menyimpan perubahan.')
