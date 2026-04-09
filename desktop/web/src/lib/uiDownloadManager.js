const inflightByKey = new Map()
const serialByLock = new Map()

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function makeInflightKey(parts) {
  return (Array.isArray(parts) ? parts : [parts]).map((part) => normalizeKeyPart(part)).join("|")
}

async function runSingleflight(key, runner) {
  const normalizedKey = normalizeKeyPart(key)
  if (!normalizedKey) {
    return await runner()
  }
  const existing = inflightByKey.get(normalizedKey)
  if (existing) return existing

  const nextPromise = (async () => {
    try {
      return await runner()
    } finally {
      if (inflightByKey.get(normalizedKey) === nextPromise) {
        inflightByKey.delete(normalizedKey)
      }
    }
  })()

  inflightByKey.set(normalizedKey, nextPromise)
  return nextPromise
}

async function runSerial(lockKey, task) {
  const normalizedLock = normalizeKeyPart(lockKey)
  if (!normalizedLock) {
    return await task()
  }
  const previous = serialByLock.get(normalizedLock) || Promise.resolve()
  const current = previous
    .catch(() => {})
    .then(task)
  serialByLock.set(normalizedLock, current)
  try {
    return await current
  } finally {
    if (serialByLock.get(normalizedLock) === current) {
      serialByLock.delete(normalizedLock)
    }
  }
}

export const uiDownloadManager = {
  makeInflightKey,
  runSingleflight,
  runSerial,
}

