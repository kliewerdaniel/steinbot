import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { ChatState, ChatSession } from './types'
import { storage } from './storage'

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
      // Initial state
      messages: [],
      input: '',
      isLoading: false,
      abortController: null,

      models: [],
      selectedModel: 'granite4:micro-h',
      selectedPromptId: 'default',
      systemPrompts: [],

      sessions: [],
      currentSessionId: null,

      inputRows: 3,
      isNearBottom: true,
      isUserScrolling: false,

      // Message editing state
      editingMessageId: null,

      // Conversation branching
      activeBranchId: null,
      branches: {},

      // Enhanced search
      searchQuery: '',
      searchResults: [],
      isSearching: false,

      // Basic setters
      setMessages: (messages) => set({ messages: typeof messages === 'function' ? messages(get().messages) : messages }),
      setInput: (input) => set({ input }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setSelectedPromptId: (selectedPromptId) => set({ selectedPromptId }),
      setInputRows: (inputRows) => set({ inputRows }),
      setIsNearBottom: (isNearBottom) => set({ isNearBottom }),
      setIsUserScrolling: (isUserScrolling) => set({ isUserScrolling }),

      // Message editing setters
      setEditingMessageId: (editingMessageId) => set({ editingMessageId }),

      // Message editing functions
      editMessage: (messageId: string, newContent: string) => {
        const { messages } = get()
        const updatedMessages = messages.map(msg =>
          msg.id === messageId
            ? { ...msg, content: newContent, editedAt: Date.now() }
            : msg
        )
        set({ messages: updatedMessages })
        get().saveSession() // Auto-save after editing
      },

      regenerateMessage: async (messageId: string) => {
        const { messages, selectedModel, selectedPromptId } = get()
        const messageIndex = messages.findIndex(msg => msg.id === messageId)

        if (messageIndex === -1 || messages[messageIndex].role !== 'assistant') {
          console.error('Cannot regenerate: message not found or not an assistant message')
          return
        }

        // Cancel any existing request
        get().abortController?.abort()
        const abortController = new AbortController()
        set({ abortController, isLoading: true })

        try {
          // Get all messages before this one for context plus the user message that prompted this assistant response
          const contextMessages = messages.slice(0, messageIndex + 1).map(msg => ({
            role: msg.role,
            content: msg.content
          }))

          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: contextMessages,
              model: selectedModel,
              promptId: selectedPromptId,
              regenerate: true
            }),
            signal: abortController.signal
          })

          if (!response.ok) {
            throw new Error('Failed to regenerate response')
          }

          // Replace the assistant message with a new one
          let newAssistantMessage = ''
          set({ messages: messages.slice(0, messageIndex) })

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('No response stream')
          }

          let newMessage: any = null
          const decoder = new TextDecoder()

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')

              for (const line of lines) {
                if (line.trim() === '') continue

                try {
                  const data = JSON.parse(line)
                  if (data.message && data.message.content) {
                    newAssistantMessage += data.message.content
                    if (!newMessage) {
                      newMessage = { id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, role: 'assistant', content: newAssistantMessage }
                      set({ messages: [...messages.slice(0, messageIndex), newMessage] })
                    } else {
                      set({ messages: messages.slice(0, messageIndex + 1).concat({ ...newMessage, content: newAssistantMessage }) })
                    }
                  }
                  if (data.done) break
                } catch {
                  continue
                }
              }
            }
          } finally {
            reader.releaseLock()
          }

        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('Error regenerating message:', error)
            const errorMessage = { id: `msg-${Date.now()}`, role: 'assistant' as const, content: 'Sorry, I encountered an error while regenerating the response.' }
            set({ messages: messages.slice(0, messageIndex).concat(errorMessage) })
          }
        } finally {
          set({ isLoading: false, abortController: null })
        }
      },

      // Message management
      addMessage: (message) => set((state) => {
        const id = message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        return {
          messages: [...state.messages, { id, role: message.role, content: message.content }]
        }
      }),
      updateLastMessage: (content) => set((state) => ({
        messages: state.messages.map((msg, idx) =>
          idx === state.messages.length - 1 ? { ...msg, content } : msg
        )
      })),

      // System prompt management
      loadSystemPrompts: async () => {
        const prompts = typeof window !== 'undefined' ? await storage.getSystemPrompts() : []
        set({ systemPrompts: prompts })
      },

      fetchSystemPrompts: async () => {
        try {
          const response = await fetch('/api/system-prompts')
          if (response.ok) {
            const data = await response.json()
            const prompts = data.prompts || []
            set({ systemPrompts: prompts })
            if (typeof window !== 'undefined') await storage.saveSystemPrompts(prompts)
          } else {
            console.error('Failed to fetch system prompts')
          }
        } catch (error) {
          console.error('Error fetching system prompts:', error)
        }
      },

      // Model management
      loadModels: async () => {
        try {
          const response = await fetch('/api/models')
          if (response.ok) {
            const data = await response.json()
            if (data.models) {
              set({ models: data.models })
            }
          }
        } catch (error) {
          console.error('Failed to fetch models:', error)
        }
      },

      // Session management
      loadSessions: async () => {
        const sessions = typeof window !== 'undefined' ? await storage.getChatSessions() : []
        if (sessions.length > 0) {
          console.log('Loading sessions:', sessions.length, 'sessions')
          sessions.forEach((s, i) => console.log(`Session ${i}: ${s.id} - ${s.title} - ${s.messages.length} messages`))
          set({ sessions })
          // Load the most recent session
          const last = sessions[0]
          set({
            messages: last.messages,
            selectedModel: last.model,
            selectedPromptId: last.promptId,
            currentSessionId: last.id
          })
        } else {
          get().createNewSession()
        }
      },

      saveSession: async () => {
        const { currentSessionId, sessions, messages, selectedModel, selectedPromptId } = get()
        if (!currentSessionId) return
        const updated = sessions.map(s => s.id === currentSessionId ? { ...s, messages, model: selectedModel, promptId: selectedPromptId, updatedAt: Date.now() } : s)
        set({ sessions: updated })
        if (typeof window !== 'undefined') await storage.saveChatSessions(updated)
      },

      createNewSession: async () => {
        const { selectedModel, selectedPromptId, sessions } = get()
        const newSession: ChatSession = {
          id: 'session-' + Date.now(),
          title: 'New Chat',
          messages: [],
          model: selectedModel,
          promptId: selectedPromptId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        const updatedSessions = [newSession, ...sessions]
        set({
          sessions: updatedSessions,
          currentSessionId: newSession.id,
          messages: []
        })
        if (typeof window !== 'undefined') await storage.saveChatSessions(updatedSessions)
      },

      switchSession: (sessionId: string) => {
        const { sessions } = get()
        const session = sessions.find(s => s.id === sessionId)
        if (!session) return
        set({
          currentSessionId: sessionId,
          messages: session.messages,
          selectedModel: session.model,
          selectedPromptId: session.promptId
        })
      },

      clearCurrentChat: async () => {
        const { messages, currentSessionId, sessions } = get()
        if (messages.length === 0) return
        if (typeof window === 'undefined' || confirm('Are you sure you want to clear the current chat? This action cannot be undone.')) {
          set({ messages: [] })
          // Update the current session with empty messages
          const updatedSessions = sessions.map(s =>
            s.id === currentSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s
          )
          set({ sessions: updatedSessions })
          if (typeof window !== 'undefined') await storage.saveChatSessions(updatedSessions)
        }
      },

      renameSession: async (sessionId: string, title: string) => {
        const { sessions } = get()
        const updated = sessions.map(s =>
          s.id === sessionId ? { ...s, title } : s
        )
        set({ sessions: updated })
        if (typeof window !== 'undefined') await storage.saveChatSessions(updated)
      },

      deleteSession: async (sessionId: string) => {
        const { sessions, currentSessionId, selectedModel, selectedPromptId } = get()
        const updated = sessions.filter(s => s.id !== sessionId)

        if (currentSessionId === sessionId) {
          if (updated.length > 0) {
            // Switch to the first remaining session
            const nextSession = updated[0]
            set({
              currentSessionId: nextSession.id,
              messages: nextSession.messages,
              selectedModel: nextSession.model,
              selectedPromptId: nextSession.promptId,
              sessions: updated
            })
          } else {
            // No sessions left, create a new one
            const newSessionId = 'session-' + Date.now()
            const newSession: ChatSession = {
              id: newSessionId,
              title: 'New Chat',
              messages: [],
              model: selectedModel,
              promptId: selectedPromptId,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
            updated.push(newSession)
            set({
              sessions: updated,
              currentSessionId: newSessionId,
              messages: []
            })
          }
        } else {
          set({ sessions: updated })
        }
        if (typeof window !== 'undefined') await storage.saveChatSessions(updated)
      },

      clearAllSessions: async () => {
        if (typeof window !== 'undefined') await storage.clear('chatSessions')
        get().createNewSession()
      },

      // Branching actions
      createBranch: async (messageId: string) => {
        const { messages, branches } = get()
        const branchId = `branch-${Date.now()}`
        const messageIndex = messages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return
        set({
          branches: {
            ...branches,
            [branchId]: messages.slice(messageIndex + 1)
          },
          activeBranchId: branchId
        })
      },

      switchBranch: (branchId: string) => {
        const { branches, messages } = get()
        const branchMessages = branches[branchId]
        if (!branchMessages) return
        set({
          messages: [...messages, ...branchMessages],
          activeBranchId: branchId
        })
      },

      getAvailableBranches: () => {
        return Object.keys(get().branches)
      },
    })
  )
)

// Auto-persist session changes to IndexedDB
useChatStore.subscribe(
  (state) => state.sessions,
  async (sessions) => {
    if (sessions.length > 0 && typeof window !== 'undefined') {
      await storage.saveChatSessions(sessions)
    }
  }
)
