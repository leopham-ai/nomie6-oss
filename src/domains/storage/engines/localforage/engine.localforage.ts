import localforage from 'localforage'
import type { IStorage } from '../../storage'

let listeners = []

/**
 * Safely parse JSON with error recovery for corrupt data
 * Returns null on parse failure instead of throwing
 */
function safeJsonParse(content: any): any {
  if (!content) return null
  if (typeof content === 'object') return content // Already parsed
  try {
    return JSON.parse(content)
  } catch (e) {
    console.error('localforage: Failed to parse JSON', e)
    return null
  }
}

export const LocalForageEngine: IStorage = {
  onReady(func) {
    // No need to setup just call the function
    if (listeners.indexOf(func) == -1) {
      listeners.push(func)
    }
  },
  basePath(path) {
    return path
  },
  fireReady() {
    listeners.forEach((func) => {
      func()
    })
    listeners = []
  },
  async init() {
    /**
     * Request the browser persist the data
     */
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        await navigator.storage.persist();
      }
    }
    return this.fireReady()
  },
  async getProfile() {
    return {
      username: 'Local User',
    }
  },
  async put(path, content) {
    // Avoid re-stringifying already-stringified content
    const serialized = typeof content === 'string' ? content : JSON.stringify(content)
    return localforage.setItem(path, serialized)
  },
  async get(path) {
    return localforage.getItem(path).then((content: any) => {
      return safeJsonParse(content)
    })
  },
  async list() {
    return localforage.keys().then((keys) => {
      return keys
    })
  },
  async delete(path) {
    return localforage.removeItem(path)
  },
}
