import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const assignments = [
  'Natalis Riski',
  'Agung Adhi Prasetyo',
  'Hadari Adrian',
  'Ade Yudianto',
  'Rian Ardiansah',
  'Athian',
  'Riski',
  'Yudha Wicaksana',
  'Desi Safitri',
  'Rangga Adi Ansah',
  'Raditya Maulana Iryanto',
  'Emanueel Haryanto',
  'Carelino Bintang Sahid Syabana',
  'Juwandi',
  'Ali Aljihad',
  'Bachtiar Mahendra Mukti',
  'Haikal Yudistira Aziz',
  'Rizal Nur Afhani',
  'Thoriq Azizi',
  'Firstiawan Hafids Bakhrizal',
  'Luthfie Adiansyah Surya',
  'Dika Nata Nael',
  'Doni Agus Setiawan',
  'Fandy Akhmad Nur Ikhsan',
  'Septyan Aditya Pradhana',
  'Muhammad Faruq Al Bara',
  'Alvin Farhan',
]

const apply = process.argv.includes('--apply')
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const oauthClientId = process.env.GDRIVE_OAUTH_CLIENT_ID
const oauthClientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET
const refreshToken = process.env.GDRIVE_REFRESH_TOKEN
if (
  !projectId ||
  !clientEmail ||
  !privateKey ||
  !oauthClientId ||
  !oauthClientSecret ||
  !refreshToken
) {
  throw new Error('Firebase Admin atau Google Drive belum dikonfigurasi di environment.')
}

const appName = 'assign-country-student-numbers'
const firebaseApp =
  getApps().find((app) => app.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, appName)
const firestore = getFirestore(firebaseApp)
const normalize = (value) =>
  String(value ?? '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]/g, '')
const toMillis = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}
const toJakartaYear = (value) => {
  const millis = toMillis(value)
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
  }).format(millis ? new Date(millis) : new Date())
}
const countryCode = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLocaleUpperCase('id-ID')
  if (['JAPAN', 'JEPANG', 'JPN'].includes(normalized)) return 'JPN'
  if (['TURKEY', 'TURKIYE', 'TÜRKİYE', 'TURKI', 'TUR'].includes(normalized)) return 'TUR'
  return null
}
const destinationOf = (data) =>
  data.destination ??
  data.registrationForm?.destinationCountry ??
  data.personalDetails?.destinationCountry ??
  data.legacy?.destination ??
  data.legacy?.destinationCountry
const stageForStatus = (status) =>
  status === 'ACTIVE' ? 'active' : status === 'COMPLETED' ? 'alumni' : 'processing'
const folderColor = (stage) =>
  stage === 'alumni' ? '#8f8f8f' : stage === 'active' ? '#16a765' : '#f83a22'
const folderNameFor = (studentNumber, applicantName, applicationId) => {
  const suffix = applicationId.includes('ADE-YULIANTO-DARURAT') ? ' - Darurat' : ''
  return `${studentNumber} - ${applicantName}${suffix}`.replace(/[\\/:*?"<>|]/g, '-').trim()
}

let accessToken
const getAccessToken = async () => {
  if (accessToken) return accessToken
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: oauthClientId,
      client_secret: oauthClientSecret,
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) throw new Error('Autentikasi Google Drive gagal.')
  accessToken = payload.access_token
  return accessToken
}

const driveRequest = async (path, init) => {
  const token = await getAccessToken()
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Google Drive menolak operasi (${response.status}).`)
  return payload
}

const snapshots = await firestore.collection('applications').get()
const roster = new Map(assignments.map((name, index) => [normalize(name), index]))
const missingNames = assignments.filter(
  (name) =>
    !snapshots.docs.some(
      (snapshot) => normalize(snapshot.data().applicantName) === normalize(name),
    ),
)
const groups = new Map()
const unnumberedEligible = []

for (const snapshot of snapshots.docs) {
  const data = snapshot.data()
  const name = String(data.applicantName ?? '').trim()
  const order = roster.get(normalize(name))
  const status = String(data.status ?? '')
  const hasIssuedAkad = Boolean(data.financialPlan?.akadDocument)
  const hasExistingNumber = typeof data.studentNumber === 'string' && data.studentNumber.length > 0
  if (
    order === undefined &&
    !hasExistingNumber &&
    !hasIssuedAkad &&
    !['ACTIVE', 'COMPLETED'].includes(status)
  ) {
    continue
  }

  const country = countryCode(destinationOf(data))
  if (!country) {
    if (
      order !== undefined ||
      hasExistingNumber ||
      hasIssuedAkad ||
      ['ACTIVE', 'COMPLETED'].includes(status)
    ) {
      unnumberedEligible.push(snapshot.id)
    }
    continue
  }

  const identity =
    typeof data.ownerFirebaseUid === 'string' && data.ownerFirebaseUid
      ? data.ownerFirebaseUid
      : normalize(name)
  const groupKey = `${identity}:${country}`
  const timestamp = toMillis(data.createdAt)
  const year = toJakartaYear(data.createdAt)
  const previous = groups.get(groupKey)
  const entry = {
    identity,
    country,
    year,
    order: order ?? Number.MAX_SAFE_INTEGER,
    firstCreatedAt: timestamp || Number.MAX_SAFE_INTEGER,
    records: [],
    latestCreatedAt: timestamp,
  }
  if (previous) {
    previous.records.push(snapshot)
    if (timestamp && (!previous.firstCreatedAt || timestamp < previous.firstCreatedAt)) {
      previous.firstCreatedAt = timestamp
      previous.year = year
    }
    previous.order = Math.min(previous.order, entry.order)
    previous.latestCreatedAt = Math.max(previous.latestCreatedAt, timestamp)
  } else {
    entry.records.push(snapshot)
    groups.set(groupKey, entry)
  }
}

const orderedGroups = [...groups.values()].sort(
  (left, right) =>
    left.country.localeCompare(right.country) ||
    left.order - right.order ||
    left.firstCreatedAt - right.firstCreatedAt,
)
const sequenceByCountry = new Map()
for (const group of orderedGroups) {
  const sequence = (sequenceByCountry.get(group.country) ?? 0) + 1
  sequenceByCountry.set(group.country, sequence)
  group.studentNumber = `VSV-${String(sequence).padStart(4, '0')}-${group.year}-${group.country}`
}

const planned = orderedGroups.flatMap((group) =>
  group.records.map((snapshot) => ({
    ref: snapshot.ref,
    data: snapshot.data(),
    docId: snapshot.id,
    studentNumber: group.studentNumber,
    country: group.country,
    groupKey: `${group.identity}:${group.country}`,
  })),
)
const studentNumberByGroup = new Map(
  orderedGroups.map((group) => [`${group.identity}:${group.country}`, group.studentNumber]),
)
const profileTargets = new Map()
for (const item of planned) {
  const uid = typeof item.data.ownerFirebaseUid === 'string' ? item.data.ownerFirebaseUid : ''
  if (!uid) continue
  const current = profileTargets.get(uid) ?? { byCountry: {}, latestAt: -1, latestNumber: '' }
  current.byCountry[item.country] = studentNumberByGroup.get(item.groupKey)
  const createdAt = toMillis(item.data.createdAt)
  if (createdAt >= current.latestAt) {
    current.latestAt = createdAt
    current.latestNumber = item.studentNumber
  }
  profileTargets.set(uid, current)
}

const folderTargets = new Map()
for (const item of planned) {
  const folderId =
    (typeof item.data.driveFolderId === 'string' && item.data.driveFolderId) ||
    (typeof item.data.legacy?.driveFolderId === 'string' && item.data.legacy.driveFolderId) ||
    ''
  if (!folderId) continue
  const applicationId = String(item.data.applicationId ?? item.docId)
  const target = {
    folderId,
    name: folderNameFor(item.studentNumber, String(item.data.applicantName ?? ''), applicationId),
    color: folderColor(stageForStatus(item.data.status)),
    createdAt: toMillis(item.data.createdAt),
  }
  const previous = folderTargets.get(folderId)
  if (!previous || target.createdAt >= previous.createdAt) folderTargets.set(folderId, target)
}

let accessErrors = 0
const folderUpdates = []
for (const target of folderTargets.values()) {
  try {
    const current = await driveRequest(
      `/files/${target.folderId}?fields=id,name,mimeType,trashed,folderColorRgb`,
      { method: 'GET' },
    )
    if (current.trashed || current.mimeType !== 'application/vnd.google-apps.folder') continue
    if (current.name !== target.name || current.folderColorRgb !== target.color) {
      folderUpdates.push(target)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('(404)')) {
      accessErrors += 1
      continue
    }
    throw error
  }
}

const alreadyCorrect = planned.filter(
  (item) => item.data.studentNumber === item.studentNumber,
).length
const byCountry = Object.fromEntries(sequenceByCountry)
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(
  `Siswa/negara yang mendapat NIS: ${groups.size}; record pengajuan yang dipertahankan: ${planned.length}.`,
)
console.log(`Urutan terakhir per negara: ${JSON.stringify(byCountry)}.`)
console.log(`Record yang NIS-nya sudah sesuai: ${alreadyCorrect}/${planned.length}.`)
console.log(`Folder yang perlu disesuaikan: ${folderUpdates.length}/${folderTargets.size}.`)
console.log(`Referensi folder yang sudah tidak ditemukan: ${accessErrors}.`)
console.log(
  `Nama tanpa record: ${missingNames.length}; record tanpa kode negara yang dikenali: ${unnumberedEligible.length}.`,
)
console.log(
  'Tidak ada record aplikasi atau folder baru yang dibuat; ID dan berkas yang ada dipertahankan.',
)

if (!apply) {
  console.log('Tidak ada perubahan yang ditulis. Tambahkan --apply untuk menjalankan pemetaan.')
  process.exit(0)
}

for (const target of folderUpdates) {
  await driveRequest(`/files/${target.folderId}?fields=id,name,folderColorRgb`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: target.name, folderColorRgb: target.color }),
  })
}

for (const [country, lastIssued] of sequenceByCountry) {
  await firestore.collection('systemCounters').doc(`student-numbers-${country}`).set(
    {
      country,
      lastIssued,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

for (let offset = 0; offset < planned.length; offset += 400) {
  const batch = firestore.batch()
  for (const item of planned.slice(offset, offset + 400)) {
    const update = { studentNumber: item.studentNumber }
    if (item.data.financialPlan?.akadDocument) {
      update['financialPlan.akadDocument.studentNumber'] = item.studentNumber
    }
    batch.update(item.ref, update)
  }
  await batch.commit()
}

for (let offset = 0; offset < profileTargets.size; offset += 400) {
  const batch = firestore.batch()
  for (const [uid, target] of [...profileTargets].slice(offset, offset + 400)) {
    batch.set(
      firestore.collection('studentProfiles').doc(uid),
      {
        ownerFirebaseUid: uid,
        studentNumber: target.latestNumber,
        studentNumbersByCountry: target.byCountry,
      },
      { merge: true },
    )
  }
  await batch.commit()
}

console.log(
  `Selesai: ${planned.length - alreadyCorrect} record diperbarui; ${alreadyCorrect} sudah sesuai; ${folderUpdates.length} folder disesuaikan.`,
)
