import { create } from 'zustand'
import { SystemPromptState } from './types'

export const usePromptStore = create<SystemPromptState>()(
  (set) => ({
    prompts: [],
    isLoading: false,
    error: null,

    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    loadPrompts: async () => {
      try {
        set({ isLoading: true, error: null })
        const response = await fetch('/api/system-prompts')
        if (response.ok) {
          const data = await response.json()
          set({ prompts: data.prompts || [] })
        } else {
          set({ error: 'Failed to fetch system prompts' })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unknown error' })
      } finally {
        set({ isLoading: false })
      }
    },

    addPrompt: async (promptData) => {
      try {
        set({ isLoading: true, error: null })
        const response = await fetch('/api/system-prompts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(promptData),
        })

        if (response.ok) {
          const data = await response.json()
          set((state) => ({ prompts: [...state.prompts, data.prompt] }))
        } else {
          const errorData = await response.json()
          set({ error: errorData.error || 'Failed to create prompt' })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unknown error' })
      } finally {
        set({ isLoading: false })
      }
    },

    updatePrompt: async (id, updates) => {
      try {
        set({ isLoading: true, error: null })
        const response = await fetch(`/api/system-prompts/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (response.ok) {
          const data = await response.json()
          set((state) => ({
            prompts: state.prompts.map(p => p.id === id ? data.prompt : p)
          }))
        } else {
          const errorData = await response.json()
          set({ error: errorData.error || 'Failed to update prompt' })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unknown error' })
      } finally {
        set({ isLoading: false })
      }
    },

    deletePrompt: async (id) => {
      if (id === 'default') return // Prevent deleting default

      try {
        set({ isLoading: true, error: null })
        const response = await fetch(`/api/system-prompts/${id}`, {
          method: 'DELETE',
        })

        if (response.ok) {
          set((state) => ({ prompts: state.prompts.filter(p => p.id !== id) }))
        } else {
          const errorData = await response.json()
          set({ error: errorData.error || 'Failed to delete prompt' })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unknown error' })
      } finally {
        set({ isLoading: false })
      }
    },
  })
)
