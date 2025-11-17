// TypeScript interfaces for Zustand stores

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: string
  retryCount?: number
  isThinking?: boolean
  editedAt?: number
}

export interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  content: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
  errorMessage?: string
}

export interface SearchResult {
  message: Message
  session: ChatSession
  score: number
  highlightedContent: string
}

export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  model: string
  promptId: string
  createdAt: number
  updatedAt: number
}

export interface SystemPrompt {
  id: string
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

// Chat Store Types
export interface ChatState {
  // Current chat state
  messages: Message[]
  input: string
  isLoading: boolean
  abortController: AbortController | null

  // Model and prompt settings
  models: OllamaModel[]
  selectedModel: string
  selectedPromptId: string
  systemPrompts: SystemPrompt[]

  // Session management
  sessions: ChatSession[]
  currentSessionId: string | null

  // UI state
  inputRows: number
  isNearBottom: boolean
  isUserScrolling: boolean

  // Message editing state
  editingMessageId: string | null

  // Conversation branching
  activeBranchId: string | null
  branches: Record<string, Message[]>

  // Enhanced search
  searchQuery: string
  searchResults: SearchResult[]
  isSearching: boolean

  // Actions
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  setInput: (input: string) => void
  setIsLoading: (loading: boolean) => void
  setSelectedModel: (model: string) => void
  setSelectedPromptId: (promptId: string) => void
  addMessage: (message: Message) => void
  updateLastMessage: (content: string) => void

  // Session actions
  loadSessions: () => void
  saveSession: () => void
  createNewSession: () => void
  switchSession: (sessionId: string) => void
  clearCurrentChat: () => void
  renameSession: (sessionId: string, title: string) => void
  deleteSession: (sessionId: string) => void
  clearAllSessions: () => void

  // System prompt actions
  loadSystemPrompts: () => void
  fetchSystemPrompts: () => Promise<void>

  // Model actions
  loadModels: () => Promise<void>

  // UI actions
  setInputRows: (rows: number) => void
  setIsNearBottom: (near: boolean) => void
  setIsUserScrolling: (scrolling: boolean) => void

  // Message editing actions
  setEditingMessageId: (id: string | null) => void
  editMessage: (messageId: string, newContent: string) => void
  regenerateMessage: (messageId: string) => Promise<void>

  // Branching actions
  createBranch: (messageId: string) => Promise<void>
  switchBranch: (branchId: string) => void
  getAvailableBranches: () => string[]
}

// System Prompt Store Types
export interface SystemPromptState {
  prompts: SystemPrompt[]
  isLoading: boolean
  error: string | null

  // Actions
  loadPrompts: () => Promise<void>
  addPrompt: (prompt: Omit<SystemPrompt, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updatePrompt: (id: string, updates: Partial<Omit<SystemPrompt, 'id' | 'createdAt'>>) => Promise<void>
  deletePrompt: (id: string) => Promise<void>
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// UI Settings Store Types
export interface TTSModel {
  name: string
  description?: string
  language?: string
}

export interface UISettingsState {
  // Dialog states
  isEditorOpen: boolean
  isHistoryOpen: boolean
  editingSessionId: string | null
  editingTitle: string

  // TTS settings
  voices: SpeechSynthesisVoice[]
  selectedVoice: string
  playingMessageId: number | null
  voiceEnhancement: boolean
  autoPlayEnabled: boolean

  // Coqui TTS settings
  ttsModels: TTSModel[]
  selectedTTSModel: string
  isTTSLoading: boolean
  ttsLoadingMessages: Set<number>

  // Actions
  setIsEditorOpen: (open: boolean) => void
  setIsHistoryOpen: (open: boolean) => void
  setEditingSessionId: (id: string | null) => void
  setEditingTitle: (title: string) => void

  // TTS actions
  loadVoices: () => void
  setSelectedVoice: (voice: string) => void
  setPlayingMessageId: (id: number | null) => void
  setVoiceEnhancement: (enabled: boolean) => void
  setAutoPlayEnabled: (enabled: boolean) => void

  // Coqui TTS actions
  loadTTSModels: () => Promise<void>
  setSelectedTTSModel: (model: string) => void
  setTTSLoading: (loading: boolean) => void

  // TTS loading message actions
  addTTSLoadingMessage: (messageIndex: number) => void
  removeTTSLoadingMessage: (messageIndex: number) => void
  isMessageTTSLoading: (messageIndex: number) => boolean
}

// App Settings Store Types
export interface AppSettingsState {
  theme: 'light' | 'dark' | 'system'
  soundEnabled: boolean
  notificationsEnabled: boolean

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setSoundEnabled: (enabled: boolean) => void
  setNotificationsEnabled: (enabled: boolean) => void
}
