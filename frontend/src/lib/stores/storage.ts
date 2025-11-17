import { openDB, DBSchema, IDBPDatabase } from 'idb'

type StoreKeys = 'chatSessions' | 'systemPrompts' | 'uiSettings' | 'appSettings'

interface BotDB extends DBSchema {
  chatSessions: {
    key: string
    value: any
    indexes: { 'by-updatedAt': number }
  }
  systemPrompts: {
    key: string
    value: any
    indexes: { 'by-updatedAt': string }
  }
  uiSettings: {
    key: string
    value: any
  }
  appSettings: {
    key: string
    value: any
  }
}

// Stores that use key path (where key is part of the value object)
const KEY_PATH_STORES: Set<StoreKeys> = new Set(['chatSessions', 'systemPrompts'])

const DB_NAME = 'bot-storage'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<BotDB>>

function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<BotDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion) {
        console.log(`Upgrading database from ${oldVersion} to ${newVersion}`)

        // Chat sessions store
        if (!db.objectStoreNames.contains('chatSessions')) {
          const chatSessionsStore = db.createObjectStore('chatSessions', { keyPath: 'id' })
          chatSessionsStore.createIndex('by-updatedAt', 'updatedAt')
        }

        // System prompts store
        if (!db.objectStoreNames.contains('systemPrompts')) {
          const promptsStore = db.createObjectStore('systemPrompts', { keyPath: 'id' })
          promptsStore.createIndex('by-updatedAt', 'updatedAt')
        }

        // UI settings store
        if (!db.objectStoreNames.contains('uiSettings')) {
          db.createObjectStore('uiSettings')
        }

        // App settings store
        if (!db.objectStoreNames.contains('appSettings')) {
          db.createObjectStore('appSettings')
        }
      },
      blocked() {
        console.warn('Database upgrade blocked - please close other tabs')
      },
      blocking() {
        console.warn('Blocking database connection - closing existing connections')
        // Close existing database connections
        dbPromise.then(db => db.close())
      }
    })
  }
  return dbPromise
}

// Storage utility class
export class PersistentStorage {
  private static instance: PersistentStorage
  private db: Promise<IDBPDatabase<BotDB>>

  private constructor() {
    // Check if we're in browser environment
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDB is not available. This class can only be used in browser environments.')
    }
    this.db = initDB()
  }

  static getInstance(): PersistentStorage {
    if (!PersistentStorage.instance) {
      PersistentStorage.instance = new PersistentStorage()
    }
    return PersistentStorage.instance
  }

  // Generic storage methods
  async get<T>(storeName: StoreKeys, key: string): Promise<T | undefined> {
    const db = await this.db
    try {
      return await db.get(storeName, key)
    } catch (error) {
      console.error(`Error getting ${key} from ${storeName}:`, error)
      return undefined
    }
  }

  async set<T>(storeName: StoreKeys, key: string, value: T): Promise<void> {
    const db = await this.db
    try {
      // For stores with key paths, put the value directly (key is part of value)
      // For stores without key paths, provide key as third argument to put()
      if (KEY_PATH_STORES.has(storeName)) {
        // Key path stores: put(value) - key is extracted from value object
        await db.put(storeName, value as any)
      } else {
        // No key path stores: put(value, key) - Key as third parameter
        await db.put(storeName, value as any, key)
      }
    } catch (error) {
      console.error(`Error setting ${key} in ${storeName}:`, error)
    }
  }

  async delete(storeName: StoreKeys, key: string): Promise<void> {
    const db = await this.db
    try {
      await db.delete(storeName, key)
    } catch (error) {
      console.error(`Error deleting ${key} from ${storeName}:`, error)
    }
  }

  async getAll<T>(storeName: StoreKeys): Promise<T[]> {
    const db = await this.db
    try {
      return await db.getAll(storeName)
    } catch (error) {
      console.error(`Error getting all from ${storeName}:`, error)
      return []
    }
  }

  async clear(storeName: StoreKeys): Promise<void> {
    const db = await this.db
    try {
      const tx = db.transaction(storeName, 'readwrite')
      await tx.store.clear()
      await tx.done
    } catch (error) {
      console.error(`Error clearing ${storeName}:`, error)
    }
  }

  // Chat sessions specific methods
  async getChatSessions(): Promise<any[]> {
    return await this.getAll('chatSessions')
  }

  async saveChatSessions(sessions: any[]): Promise<void> {
    const db = await this.db
    const tx = db.transaction('chatSessions', 'readwrite')
    try {
      await tx.store.clear()
      for (const session of sessions) {
        await tx.store.put(session)
      }
      await tx.done
    } catch (error) {
      console.error('Error saving chat sessions:', error)
    }
  }

  async getSystemPrompts(): Promise<any[]> {
    return await this.getAll('systemPrompts')
  }

  async saveSystemPrompts(prompts: any[]): Promise<void> {
    const db = await this.db
    const tx = db.transaction('systemPrompts', 'readwrite')
    try {
      await tx.store.clear()
      for (const prompt of prompts) {
        await tx.store.put(prompt)
      }
      await tx.done
    } catch (error) {
      console.error('Error saving system prompts:', error)
    }
  }

  // Migration utilities
  async migrateFromLocalStorage(): Promise<void> {
    console.log('Checking for localStorage migration...')

    // Migrate chat sessions
    const chatSessions = localStorage.getItem('chat-sessions')
    if (chatSessions) {
      try {
        const parsed = JSON.parse(chatSessions)
        await this.saveChatSessions(parsed)
        console.log('Migrated chat sessions from localStorage to IndexedDB')
        localStorage.removeItem('chat-sessions')
      } catch (error) {
        console.error('Error migrating chat sessions:', error)
      }
    }

    // Migrate system prompts
    const systemPrompts = localStorage.getItem('system-prompts')
    if (systemPrompts) {
      try {
        const parsed = JSON.parse(systemPrompts)
        await this.saveSystemPrompts(parsed)
        console.log('Migrated system prompts from localStorage to IndexedDB')
        localStorage.removeItem('system-prompts')
      } catch (error) {
        console.error('Error migrating system prompts:', error)
      }
    }

    // Migrate UI settings
    const uiSettings = localStorage.getItem('ui-store')
    if (uiSettings) {
      try {
        const parsed = JSON.parse(uiSettings)
        if (parsed.state) {
          await this.set('uiSettings', 'preferences', parsed.state)
          console.log('Migrated UI settings from localStorage to IndexedDB')
        }
        localStorage.removeItem('ui-store')
      } catch (error) {
        console.error('Error migrating UI settings:', error)
      }
    }

    // Migrate chat store settings
    const chatStore = localStorage.getItem('chat-store')
    if (chatStore) {
      try {
        const parsed = JSON.parse(chatStore)
        if (parsed.state) {
          await this.set('appSettings', 'chat-preferences', parsed.state)
          console.log('Migrated chat preferences from localStorage to IndexedDB')
        }
        localStorage.removeItem('chat-store')
      } catch (error) {
        console.error('Error migrating chat preferences:', error)
      }
    }

    console.log('localStorage migration completed')
  }
}

// Lazy singleton getter - safe for SSR
let storageInstance: PersistentStorage | null = null

export function getStorage(): PersistentStorage {
  if (!storageInstance) {
    storageInstance = PersistentStorage.getInstance()
    // Initialize migration on first access (only in browser)
    if (typeof window !== 'undefined') {
      storageInstance.migrateFromLocalStorage().catch(console.error)
    }
  }
  return storageInstance
}

// Legacy export for backward compatibility, but make it lazy
export const storage = {
  get<T>(storeName: StoreKeys, key: string): Promise<T | undefined> {
    return getStorage().get(storeName, key)
  },
  set<T>(storeName: StoreKeys, key: string, value: T): Promise<void> {
    return getStorage().set(storeName, key, value)
  },
  delete(storeName: StoreKeys, key: string): Promise<void> {
    return getStorage().delete(storeName, key)
  },
  getAll<T>(storeName: StoreKeys): Promise<T[]> {
    return getStorage().getAll(storeName)
  },
  clear(storeName: StoreKeys): Promise<void> {
    return getStorage().clear(storeName)
  },
  getChatSessions(): Promise<any[]> {
    return getStorage().getChatSessions()
  },
  saveChatSessions(sessions: any[]): Promise<void> {
    return getStorage().saveChatSessions(sessions)
  },
  getSystemPrompts(): Promise<any[]> {
    return getStorage().getSystemPrompts()
  },
  saveSystemPrompts(prompts: any[]): Promise<void> {
    return getStorage().saveSystemPrompts(prompts)
  },
  migrateFromLocalStorage(): Promise<void> {
    return getStorage().migrateFromLocalStorage()
  }
}
