import { google } from 'googleapis'

function getDriveClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET und GOOGLE_REFRESH_TOKEN müssen gesetzt sein'
    )
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })

  return google.drive({ version: 'v3', auth })
}

export interface DriveFile {
  id: string
  name: string
  folderName: string
  createdTime: string | null
}

/** Find all Excel files in Google Drive folders whose names end with "Order" */
export async function findOrderFiles(): Promise<DriveFile[]> {
  const drive = getDriveClient()

  // Search for folders containing "Order" in the name, then filter client-side
  const foldersRes = await drive.files.list({
    q: "mimeType = 'application/vnd.google-apps.folder' and name contains 'Order' and trashed = false",
    fields: 'files(id, name)',
    pageSize: 100,
  })

  const orderFolders = (foldersRes.data.files ?? []).filter(
    (f) => f.name?.endsWith('Order') || f.name?.endsWith('order')
  )

  if (orderFolders.length === 0) return []

  const result: DriveFile[] = []

  for (const folder of orderFolders) {
    if (!folder.id || !folder.name) continue

    const filesRes = await drive.files.list({
      q: `'${folder.id}' in parents and (mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.ms-excel') and trashed = false`,
      fields: 'files(id, name, createdTime)',
      pageSize: 100,
    })

    for (const file of filesRes.data.files ?? []) {
      if (!file.id || !file.name) continue
      result.push({
        id: file.id,
        name: file.name,
        folderName: folder.name,
        createdTime: file.createdTime ?? null,
      })
    }
  }

  return result
}

/** Download a file from Google Drive as a Buffer */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}
