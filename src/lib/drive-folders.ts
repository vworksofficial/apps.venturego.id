import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { buildDocumentFileName } from './documents'
import { getFirebaseFirestore } from './firebase-admin'
import {
  DRIVE_FOLDER_COLOR_ACTIVE,
  DRIVE_FOLDER_COLOR_ALUMNI,
  DRIVE_FOLDER_COLOR_DRAFT,
  DRIVE_STAGE_FOLDER_NAMES,
  GDriveError,
  getOrCreateChildFolder,
  getRootFolderId,
  moveDriveFolder,
  renameDriveFile,
  sanitizeDriveFolderName,
  setDriveFolderColor,
} from './gdrive'
import { getExistingStudentNumber, STUDENT_NUMBER_PATTERN } from './student-number'

const joinFolderName = (parts: string[]) =>
  sanitizeDriveFolderName(
    parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' - '),
  )

export const buildDraftFolderName = (applicantName: string, lpkName: string) =>
  joinFolderName([applicantName, lpkName])

export const buildActiveFolderName = (studentNumber: string, applicantName: string) => {
  const namePart = studentNumber.match(/^VSV-\d{4,}-(.+)$/)?.[1]
  const normalize = (value: string) => value.toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '')
  return namePart && normalize(namePart) === normalize(applicantName)
    ? sanitizeDriveFolderName(studentNumber)
    : joinFolderName([studentNumber, applicantName])
}

export type DriveApplicationStage = 'processing' | 'active' | 'alumni'

export const getDriveApplicationStage = (status: unknown): DriveApplicationStage =>
  status === 'ACTIVE' ? 'active' : status === 'COMPLETED' ? 'alumni' : 'processing'

export const ensureDriveStageFolder = async (stage: DriveApplicationStage): Promise<string> => {
  const rootId = await getRootFolderId()
  const colorRgb =
    stage === 'active'
      ? DRIVE_FOLDER_COLOR_ACTIVE
      : stage === 'alumni'
        ? DRIVE_FOLDER_COLOR_ALUMNI
        : DRIVE_FOLDER_COLOR_DRAFT
  return getOrCreateChildFolder(rootId, DRIVE_STAGE_FOLDER_NAMES[stage], { colorRgb })
}

export const ensureApplicationDriveFolder = async (application: {
  ownerFirebaseUid?: unknown
  applicantName?: unknown
  lpkName?: unknown
  status?: unknown
  studentNumber?: unknown
  destination?: unknown
}): Promise<string> => {
  const ownerUid =
    typeof application.ownerFirebaseUid === 'string' ? application.ownerFirebaseUid : ''
  const applicantName =
    typeof application.applicantName === 'string' ? application.applicantName : ''
  const lpkName = typeof application.lpkName === 'string' ? application.lpkName : ''
  const stage = getDriveApplicationStage(application.status)
  const stageFolderId = await ensureDriveStageFolder(stage)

  if (stage === 'active' || stage === 'alumni') {
    const storedStudentNumber =
      typeof application.studentNumber === 'string' &&
      STUDENT_NUMBER_PATTERN.test(application.studentNumber)
        ? application.studentNumber
        : null
    const studentNumber =
      storedStudentNumber ?? (await getExistingStudentNumber(ownerUid, application.destination))
    const officialName = studentNumber ? buildActiveFolderName(studentNumber, applicantName) : ''
    if (officialName) {
      return getOrCreateChildFolder(stageFolderId, officialName, {
        colorRgb: stage === 'active' ? DRIVE_FOLDER_COLOR_ACTIVE : DRIVE_FOLDER_COLOR_ALUMNI,
        createOnly: true,
      })
    }
  }

  const name = buildDraftFolderName(applicantName, lpkName)
  if (!name) throw new GDriveError('Nama pemohon belum diisi.', 'INVALID')
  return getOrCreateChildFolder(stageFolderId, name, {
    colorRgb: DRIVE_FOLDER_COLOR_DRAFT,
    createOnly: true,
  })
}

export const moveApplicationDriveFolderToStatus = async (params: {
  folderId: string
  ownerUid: string
  applicantName: string
  lpkName: string
  status: unknown
  studentNumber?: string
  destination?: unknown
}): Promise<boolean> => {
  try {
    if (!params.folderId) return false
    const stage = getDriveApplicationStage(params.status)
    const targetFolderId = await ensureDriveStageFolder(stage)
    const existingStudentNumber =
      stage === 'active' || stage === 'alumni'
        ? await getExistingStudentNumber(params.ownerUid, params.destination)
        : null
    const studentNumber =
      params.studentNumber && STUDENT_NUMBER_PATTERN.test(params.studentNumber)
        ? params.studentNumber
        : existingStudentNumber
    const folderName = studentNumber
      ? buildActiveFolderName(studentNumber, params.applicantName)
      : buildDraftFolderName(params.applicantName, params.lpkName)
    if (!folderName) return false
    const folderColor =
      stage === 'active'
        ? DRIVE_FOLDER_COLOR_ACTIVE
        : stage === 'alumni'
          ? DRIVE_FOLDER_COLOR_ALUMNI
          : DRIVE_FOLDER_COLOR_DRAFT
    await moveDriveFolder(params.folderId, targetFolderId)
    await renameDriveFile(params.folderId, folderName)
    await setDriveFolderColor(params.folderId, folderColor)
    if (params.ownerUid) {
      await getFirebaseFirestore()
        .collection('driveFolders')
        .doc(params.ownerUid)
        .set(
          {
            ownerUid: params.ownerUid,
            folderId: params.folderId,
            folderName,
            stage,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        .catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

export const promoteApplicationFolder = async (params: {
  folderId: string
  ownerUid: string
  applicantName: string
  files: { fileId: string; fileName?: string; label: string }[]
  studentNumber?: string
  destination?: unknown
}): Promise<void> => {
  try {
    const moved = await moveApplicationDriveFolderToStatus({
      ...params,
      lpkName: '',
      status: 'ACTIVE',
      studentNumber: params.studentNumber,
      destination: params.destination,
    })
    if (moved) {
      await Promise.allSettled(
        params.files
          .filter((file) => file.fileId && file.label)
          .map((file) =>
            renameDriveFile(
              file.fileId,
              buildDocumentFileName(file.label, params.applicantName, file.fileName ?? ''),
            ),
          ),
      )
    }
  } catch {}
}

export const revertApplicationFolderToDraft = async (params: {
  folderId: string
  ownerUid: string
  applicantName: string
  lpkName: string
}): Promise<void> => {
  try {
    await moveApplicationDriveFolderToStatus({ ...params, status: 'CONTRACT_PREPARATION' })
  } catch {}
}
