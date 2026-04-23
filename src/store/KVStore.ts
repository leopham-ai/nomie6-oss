import Storage from '../domains/storage/storage'
import { writable } from 'svelte/store'

type DocStorePropTypes = {
  label: string
  key: string
  itemInitializer?: Function
  itemSerializer?: Function
  initialized?: Function
}

// Debounce window for storage writes (ms)
const DEBOUNCE_MS = 500

// Global registry for beforeunload flush — all created stores register here
const _allStores: Array<{ flush: () => Promise<unknown> }> = []

/**
 * Flush all registered KVStores — call on app beforeunload.
 * @returns promise that resolves when all stores have flushed
 */
export const flushAllKVStores = async (): Promise<void> => {
  await Promise.all(_allStores.map((s) => s.flush()))
}

/**
 * @deprecated use flushAllKVStores — removes a store from the flush registry
 */
export const _unregisterKVStore = (store: { flush: () => Promise<unknown> }) => {
  const idx = _allStores.indexOf(store)
  if (idx >= 0) _allStores.splice(idx, 1)
}

export type KVStoreState = {
  [key: string]: any
}

export const kvToArray = (obj: KVStoreState) => {
  return Object.keys(obj).map((key) => {
    return obj[key]
  })
}

/**
 * Create a Key Value Store
 * // Like People
 * @param path
 * @param props
 * @returns
 */
export const createKVStore = (path: string, props: DocStorePropTypes) => {
  const baseState: KVStoreState = {}
  const { update, subscribe, set } = writable(baseState)
  let data: any = {}

  // Debounce state for storage writes
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let pendingState: KVStoreState | null = null
  let writeResolvers: Array<(state: KVStoreState) => void> = []

  /**
   * Initialize the Store
   */
  const init = async (_data?:any): Promise<KVStoreState> => {
    const timerLabel = `KVStore.init(${props.label})`
    console.timeEnd(timerLabel) // clear if exists from re-entry
    console.time(timerLabel)
    // Get the Map From Storage
    const map = (await Storage.get(path)) || {}
    data = _data || {};
    console.timeLog(timerLabel, 'after Storage.get')
    // Loop over each time
    // initialize if there's an initializer
    Object.keys(map).forEach((key: string) => {
      if (props.itemInitializer) {
        map[key] = props.itemInitializer(map[key], key)
      }
    })
    update((s) => map)

    if(props.initialized) {
      props.initialized(map, data);
    }
    console.timeLog(`KVStore.init(${props.label})`, 'after update')
    console.timeEnd(`KVStore.init(${props.label})`)
    return map
  }

  /**
   * Flush pending state to storage immediately.
   * Called on app unload to ensure data is persisted.
   * @returns promise that resolves when write completes
   */
  const flush = async (): Promise<KVStoreState> => {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    if (pendingState) {
      const state = pendingState
      pendingState = null
      await _doWrite(state)
    }
    return rawState()
  }

  /**
   * Actually write state to storage (called by debounced _write or flush)
   * @param state
   * @returns
   */
  const _doWrite = async (state: KVStoreState): Promise<KVStoreState> => {
    // Clone and serialize
    const _state = JSON.parse(JSON.stringify(state))
    Object.keys(_state).map((key) => {
      const item = props.itemSerializer ? props.itemSerializer(_state[key]) : _state[key]
      _state[key] = item
    })
    // Save to Storage
    await Storage.put(path, _state)
    return state
  }

  /**
   * Debounced write — batches rapid updates into a single storage write.
   * Resolves when the debounced write actually completes.
   * @param state
   * @returns promise
   */
  const _write = async (state: KVStoreState): Promise<KVStoreState> => {
    pendingState = state
    if (writeTimer) clearTimeout(writeTimer)
    return new Promise<KVStoreState>((resolve) => {
      writeResolvers.push(resolve)
      writeTimer = setTimeout(async () => {
        writeTimer = null
        const toWrite = pendingState
        pendingState = null
        if (toWrite) {
          await _doWrite(toWrite)
        }
        // Resolve all waiters with the current raw state
        const current = rawState()
        writeResolvers.forEach((r) => r(current))
        writeResolvers = []
      }, DEBOUNCE_MS)
    })
  }

  /**
   * Upsert and Item
   * @param item
   * @returns  Promise KVStore
   */
  const upsert = async (item: any): Promise<KVStoreState> => {
    let state
    update((s) => {
      const key = item[props.key]
      s[key] = props.itemInitializer ? props.itemInitializer(item) : item
      state = s
      return s
    })
    return await _write(state)
  }

  /**
   * Upsert Many Items
   * @param items
   * @returns Promise KVStore
   */
  const upsertMany = async (items: KVStoreState): Promise<KVStoreState> => {
    let state
    update((s) => {
      Object.keys(items).forEach((key) => {
        const item = items[key]
        s[key] = props.itemInitializer ? props.itemInitializer(item) : item
      })
      state = s
      return s
    })
    return await _write(state)
  }

  /**
   * Update Sync
   * Updates the state and writes to storage
   * @param kvItems
   * @returns promise KVStoreState
   */
  const updateSync = async (updateFunc: Function): Promise<KVStoreState> => {
    let state: KVStoreState
    update((s) => {
      state = updateFunc(s)
      return state
    })
    return await _write(state)
  }

  /**
   * Remove an Item
   * @param item
   * @returns
   */
  const remove = async (item: any): Promise<KVStoreState> => {
    let state
    update((s) => {
      let key = item[props.key]
      if (key && s[key]) {
        delete s[key]
      }
      state = s
      return s
    })

    return await _write(state)
  }

  /**
   * Get Raw State
   * @returns KVStoreState
   */
  const rawState = (): KVStoreState => {
    let state: KVStoreState
    update((s) => {
      state = s
      return s
    })
    return state
  }

  // Register this store for global flushAll
  const storeHandle = { flush }
  _allStores.push(storeHandle)

  // Return base methods
  return {
    init,
    upsert,
    upsertMany,
    remove,
    update,
    updateSync,
    subscribe,
    set,
    rawState,
    flush,
  }
}
