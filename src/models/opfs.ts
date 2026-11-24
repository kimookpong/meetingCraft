/** Helpers for the Origin Private File System, usable from window and workers. */

export async function modelDir(modelId: string, create = false): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  const models = await root.getDirectoryHandle('models', { create: true })
  return models.getDirectoryHandle(modelId, { create })
}

export async function readFile(modelId: string, name: string): Promise<File> {
  const dir = await modelDir(modelId)
  const h = await dir.getFileHandle(name)
  return h.getFile()
}

/** Complete = marker present and every expected file on disk (manifest may gain files over time). */
export async function isComplete(modelId: string, names: string[] = []): Promise<boolean> {
  try {
    const dir = await modelDir(modelId)
    await dir.getFileHandle('.complete')
    for (const n of names) await dir.getFileHandle(n)
    return true
  } catch {
    return false
  }
}

export async function removeModel(modelId: string) {
  const root = await navigator.storage.getDirectory()
  const models = await root.getDirectoryHandle('models', { create: true })
  await models.removeEntry(modelId, { recursive: true }).catch(() => {})
}
