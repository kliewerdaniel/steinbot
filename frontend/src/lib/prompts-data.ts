import fs from 'fs'
import path from 'path'

export interface SystemPrompt {
  id: string
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

const PROMPTS_DATA_PATH = path.join(process.cwd(), 'data', 'system-prompts.json')

// Ensure data directory exists
function ensureDataDirectory() {
  const dataDir = path.dirname(PROMPTS_DATA_PATH)
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

// Read all prompts from storage
export function readPrompts(): SystemPrompt[] {
  try {
    ensureDataDirectory()
    if (!fs.existsSync(PROMPTS_DATA_PATH)) {
      // Create default data if file doesn't exist
      const defaultPrompt: SystemPrompt = {
        id: 'default',
        name: 'Default System Prompt',
        content: `# Default System Prompt

This is a default system prompt. You can create and manage multiple system prompts from the UI.

## Usage
- Create new prompts for different use cases
- Switch between prompts in conversations
- Edit and delete prompts as needed
`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      fs.writeFileSync(PROMPTS_DATA_PATH, JSON.stringify([defaultPrompt], null, 2))
      return [defaultPrompt]
    }
    const data = fs.readFileSync(PROMPTS_DATA_PATH, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading prompts:', error)
    return []
  }
}

// Write prompts to storage
export function writePrompts(prompts: SystemPrompt[]): void {
  try {
    ensureDataDirectory()
    fs.writeFileSync(PROMPTS_DATA_PATH, JSON.stringify(prompts, null, 2))
  } catch (error) {
    console.error('Error writing prompts:', error)
    throw error
  }
}

// Get a specific prompt by ID
export function getPromptById(id: string): SystemPrompt | null {
  const prompts = readPrompts()
  return prompts.find(p => p.id === id) || null
}

// Create a new prompt
export function createPrompt(name: string, content: string): SystemPrompt {
  const prompts = readPrompts()
  const newPrompt: SystemPrompt = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    name,
    content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  prompts.push(newPrompt)
  writePrompts(prompts)
  return newPrompt
}

// Update an existing prompt
export function updatePrompt(id: string, name: string, content: string): SystemPrompt | null {
  const prompts = readPrompts()
  const index = prompts.findIndex(p => p.id === id)
  if (index === -1) return null

  prompts[index] = {
    ...prompts[index],
    name,
    content,
    updatedAt: new Date().toISOString()
  }
  writePrompts(prompts)
  return prompts[index]
}

// Delete a prompt
export function deletePrompt(id: string): boolean {
  const prompts = readPrompts()
  const filteredPrompts = prompts.filter(p => p.id !== id)
  if (filteredPrompts.length === prompts.length) return false // No prompt found

  writePrompts(filteredPrompts)
  return true
}
