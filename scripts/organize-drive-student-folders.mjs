import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const rootName = 'VSV.VentureGo.id [database]'
const stageNames = {
  processing: 'Proses Pengajuan',
  active: 'Siswa Aktif',
  alumni: 'Alumni',
}
const stageColors = { processing: '#f83a22', active: '#16a765', alumni: '#8f8f8f' }
const driveFolderMime = 'application/vnd.google-apps.folder'
const apply = process.argv.includes('--apply')
const apiBase = 'https://www.googleapis.com/drive/v3'

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

const appName = 'organize-drive-student-folders'
const firebaseApp =
  getApps().find((app) => app.name === appName) ??
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId }, appName)
const firestore = getFirestore(firebaseApp)

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
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Google Drive menolak operasi (${response.status}).`)
  return payload
}

const escapeQuery = (value) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const listDriveFiles = async (query) => {
  const files = []
  let pageToken = ''
  do {
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,parents,trashed)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await driveRequest(`/files?${params}`, { method: 'GET' })
    files.push(...(page.files ?? []))
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return files
}

const findRootFolder = async () => {
  if (process.env.GDRIVE_ROOT_FOLDER_ID?.trim()) return process.env.GDRIVE_ROOT_FOLDER_ID.trim()
  for (const name of [rootName, 'VentureGo Berkas']) {
    const matches = await listDriveFiles(
      `mimeType='${driveFolderMime}' and name='${escapeQuery(name)}' and trashed=false`,
    )
    if (matches[0]?.id) return matches[0].id
  }
  throw new Error('Folder root database tidak ditemukan.')
}

const statusToStage = (status) =>
  status === 'ACTIVE' ? 'active' : status === 'COMPLETED' ? 'alumni' : 'processing'
const timestampValue = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value === 'string') return Date.parse(value) || 0
  return 0
}

const rootId = await findRootFolder()
const rootChildren = await listDriveFiles(
  `'${escapeQuery(rootId)}' in parents and mimeType='${driveFolderMime}' and trashed=false`,
)
const categoryByName = new Map(rootChildren.map((folder) => [folder.name, folder.id]))
const stageFolderIds = new Map()
if (apply) {
  for (const [stage, name] of Object.entries(stageNames)) {
    let folderId = categoryByName.get(name)
    if (!folderId) {
      const created = await driveRequest('/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: driveFolderMime, parents: [rootId] }),
      })
      folderId = created.id
    }
    stageFolderIds.set(stage, folderId)
  }
}

const folderTargets = new Map()
const latestApplicationByOwner = new Map()
const appSnapshots = await firestore.collection('applications').get()
for (const snapshot of appSnapshots.docs) {
  const data = snapshot.data()
  const ownerUid = typeof data.ownerFirebaseUid === 'string' ? data.ownerFirebaseUid : ''
  const updatedAt = Math.max(timestampValue(data.updatedAt), timestampValue(data.createdAt))
  if (ownerUid) {
    const previousOwnerApplication = latestApplicationByOwner.get(ownerUid)
    if (!previousOwnerApplication || updatedAt >= previousOwnerApplication.updatedAt) {
      latestApplicationByOwner.set(ownerUid, {
        stage: statusToStage(data.status),
        updatedAt,
        applicantName: typeof data.applicantName === 'string' ? data.applicantName : '',
        lpkName: typeof data.lpkName === 'string' ? data.lpkName : '',
      })
    }
  }
  const folderId =
    (typeof data.driveFolderId === 'string' && data.driveFolderId) ||
    (typeof data.legacy?.driveFolderId === 'string' && data.legacy.driveFolderId) ||
    ''
  if (!folderId) continue
  const candidate = {
    stage: statusToStage(data.status),
    updatedAt,
    ownerUid,
  }
  const previous = folderTargets.get(folderId)
  if (!previous || candidate.updatedAt >= previous.updatedAt) {
    folderTargets.set(folderId, candidate)
  }
}

const studentProfiles = await firestore.collection('studentProfiles').get()
const studentNumberByOwner = new Map(
  studentProfiles.docs
    .map((snapshot) => [
      snapshot.id,
      typeof snapshot.data().studentNumber === 'string' ? snapshot.data().studentNumber : '',
    ])
    .filter(([, studentNumber]) => studentNumber),
)

const mappingSnapshots = await firestore.collection('driveFolders').get()
const ownerByFolder = new Map()
for (const snapshot of mappingSnapshots.docs) {
  const data = snapshot.data()
  const folderId = typeof data.folderId === 'string' ? data.folderId : ''
  if (!folderId) continue
  ownerByFolder.set(folderId, snapshot.id)
  if (!folderTargets.has(folderId)) {
    const mappedStage =
      data.stage === 'active' ? 'active' : data.stage === 'alumni' ? 'alumni' : 'processing'
    folderTargets.set(folderId, { stage: mappedStage, updatedAt: 0, ownerUid: snapshot.id })
  }
}

const categoryIds = new Set(
  Object.values(stageNames)
    .map((name) => categoryByName.get(name))
    .filter(Boolean),
)
const folderNameCandidates = new Map()
const normalizeFolderName = (value) => value.toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '')
for (const [ownerUid, application] of latestApplicationByOwner) {
  const studentNumber = studentNumberByOwner.get(ownerUid)
  const folderName =
    studentNumber && application.stage !== 'processing'
      ? `${studentNumber} - ${application.applicantName}`
      : `${application.applicantName} - ${application.lpkName}`
  if (!application.applicantName || !folderName.trim()) continue
  const candidates = folderNameCandidates.get(folderName) ?? []
  candidates.push({ stage: application.stage, ownerUid, updatedAt: application.updatedAt })
  folderNameCandidates.set(folderName, candidates)
}
for (const folder of rootChildren) {
  if (categoryIds.has(folder.id) || folderTargets.has(folder.id)) continue
  let candidates = folderNameCandidates.get(folder.name) ?? []
  if (candidates.length !== 1) {
    const normalizedFolderName = normalizeFolderName(folder.name)
    const normalizedMatches = [...latestApplicationByOwner].filter(([ownerUid, application]) => {
      const name = normalizeFolderName(application.applicantName)
      const studentNumber = normalizeFolderName(studentNumberByOwner.get(ownerUid) ?? '')
      return (
        (name.length >= 6 && normalizedFolderName.includes(name)) ||
        (studentNumber.length >= 8 && normalizedFolderName.includes(studentNumber))
      )
    })
    candidates = normalizedMatches.map(([ownerUid, application]) => ({
      stage: application.stage,
      ownerUid,
      updatedAt: application.updatedAt,
    }))
  }
  if (candidates.length !== 1) continue
  folderTargets.set(folder.id, candidates[0])
  ownerByFolder.set(folder.id, candidates[0].ownerUid)
}
const unmappedRootFolders = rootChildren.filter(
  (folder) => !categoryIds.has(folder.id) && !folderTargets.has(folder.id),
)
const counts = { processing: 0, active: 0, alumni: 0 }
let moved = 0
let unchanged = 0
let missing = 0
for (const [folderId, target] of folderTargets) {
  counts[target.stage] += 1
  try {
    const info = await driveRequest(
      `/files/${folderId}?fields=id,name,mimeType,parents,trashed,folderColorRgb`,
      {
        method: 'GET',
      },
    )
    if (info.trashed || info.mimeType !== driveFolderMime) {
      missing += 1
      continue
    }
    const targetFolderId =
      stageFolderIds.get(target.stage) ?? categoryByName.get(stageNames[target.stage])
    const isAlreadyInTarget = targetFolderId && (info.parents ?? []).includes(targetFolderId)
    if (isAlreadyInTarget) {
      if (apply) {
        if (info.folderColorRgb !== stageColors[target.stage]) {
          await driveRequest(`/files/${folderId}?fields=id,folderColorRgb`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderColorRgb: stageColors[target.stage] }),
          })
        }
        const ownerUid = target.ownerUid || ownerByFolder.get(folderId)
        if (ownerUid) {
          await firestore
            .collection('driveFolders')
            .doc(ownerUid)
            .set(
              { ownerUid, folderId, stage: target.stage, updatedAt: new Date() },
              { merge: true },
            )
        }
      }
      unchanged += 1
      continue
    }
    if (apply) {
      const params = new URLSearchParams({
        addParents: targetFolderId,
        fields: 'id,parents,folderColorRgb',
      })
      if (info.parents?.length) params.set('removeParents', info.parents.join(','))
      await driveRequest(`/files/${folderId}?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderColorRgb: stageColors[target.stage] }),
      })
      const ownerUid = target.ownerUid || ownerByFolder.get(folderId)
      if (ownerUid) {
        await firestore
          .collection('driveFolders')
          .doc(ownerUid)
          .set({ ownerUid, folderId, stage: target.stage, updatedAt: new Date() }, { merge: true })
      }
    }
    moved += 1
  } catch {
    missing += 1
  }
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(
  `Folder dipetakan — Proses Pengajuan: ${counts.processing}, Siswa Aktif: ${counts.active}, Alumni: ${counts.alumni}`,
)
console.log(
  `Akan dipindah/berhasil dipindah: ${moved}; sudah sesuai: ${unchanged}; tidak tersedia/gagal: ${missing}`,
)
console.log(`Folder root tanpa pasangan status pengajuan: ${unmappedRootFolders.length}`)
if (!apply)
  console.log(
    'Tidak ada folder yang dipindahkan. Jalankan ulang dengan --apply untuk menerapkan pemindahan.',
  )
if (unmappedRootFolders.length) {
  console.log('Folder yang tidak cocok dibiarkan di root agar tidak salah dikategorikan.')
}
