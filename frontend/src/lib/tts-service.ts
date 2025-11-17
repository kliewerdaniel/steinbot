import path from 'path'
import fs from 'fs'

export interface TTSOptions {
  text: string
  model?: string
  outputPath?: string
}

export class TTSService {
  private ttsServerUrl: string

  constructor() {
    // Use the Coqui TTS server running on port 8080
    this.ttsServerUrl = 'http://localhost:8080'
  }

  async generateSpeech(options: TTSOptions): Promise<string> {
    const { text, model = 'tts_models/en/ljspeech/tacotron2-DDC', outputPath } = options

    // Generate unique filename if not provided
    const filename = outputPath || `tts_${Date.now()}.wav`
    const fullOutputPath = path.join(process.cwd(), 'public', 'audio', filename)

    // Ensure the audio directory exists
    const audioDir = path.dirname(fullOutputPath)
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true })
    }

    try {
      // Check if TTS server is available
      const isServerAvailable = await this.checkServerHealth()

      if (!isServerAvailable || model === 'browser-tts') {
        // Fall back to browser TTS - create a simple audio file or return a placeholder
        console.log('Using browser TTS fallback')
        // For browser TTS, we'll create a minimal audio file or just return the filename
        // The actual TTS will happen in the browser
        return filename
      }

      // Use the Coqui TTS server API
      const response = await fetch(`${this.ttsServerUrl}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          text: text,
          speaker_id: '', // Use default speaker
          style_wav: '',
          language_id: ''
        })
      })

      if (!response.ok) {
        throw new Error(`TTS server responded with status: ${response.status}`)
      }

      // Check if response is actually audio data or an error
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('audio')) {
        const errorText = await response.text()
        throw new Error(`TTS server returned non-audio response: ${errorText}`)
      }

      // Get the audio data as blob
      const audioBlob = await response.blob()

      // Check if blob is actually audio data
      if (audioBlob.size === 0) {
        throw new Error('TTS server returned empty audio file')
      }

      // Convert blob to buffer and save to file
      const arrayBuffer = await audioBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      fs.writeFileSync(fullOutputPath, buffer)

      console.log(`✅ TTS audio saved to ${fullOutputPath} (${buffer.length} bytes)`)
      return filename

    } catch (error) {
      console.error('TTS generation failed:', error)
      // Return the filename anyway so the frontend can fall back to browser TTS
      return filename
    }
  }

  async listAvailableModels(): Promise<Array<{name: string, description: string, language: string}>> {
    try {
      // Attempt to fetch models dynamically from the TTS server
      const response = await fetch(`${this.ttsServerUrl}/api/tts/models`)
      if (response.ok) {
        const serverModels = await response.json()
        if (Array.isArray(serverModels)) {
          return serverModels.map((model: Record<string, unknown>) => ({
            name: String(model.name || model.model_name || model),
            description: String(model.description || `Model ${model.name || model.model_name || 'Unknown'}`),
            language: String(model.language || 'en')
          }))
        }
      }
    } catch (error) {
      console.log('Failed to fetch models from server, using curated list:', error)
    }

    // Return a comprehensive curated list of popular Coqui TTS models
    const models = [
      // English models
      {
        name: 'tts_models/en/ljspeech/tacotron2-DDC',
        description: 'Tacotron2 DDC • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/tacotron2-DDC_ph',
        description: 'Tacotron2 DDC Phonemes • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/glow-tts',
        description: 'Glow TTS • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/speedy-speech',
        description: 'Speedy Speech • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/tacotron2-DCA',
        description: 'Tacotron2 DCA • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/neural_hmm',
        description: 'Neural HMM • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ljspeech/overflow',
        description: 'Overflow • English • LJSpeech',
        language: 'en'
      },
      {
        name: 'tts_models/en/ek1/tacotron2',
        description: 'Tacotron2 • English • EK1',
        language: 'en'
      },
      {
        name: 'tts_models/en/ek1/tacotron2-DCA',
        description: 'Tacotron2 DCA • English • EK1',
        language: 'en'
      },
      {
        name: 'tts_models/en/ek1/neon',
        description: 'Neon • English • EK1',
        language: 'en'
      },
      {
        name: 'tts_models/en/vctk/vits',
        description: 'VITS • English • VCTK',
        language: 'en'
      },
      {
        name: 'tts_models/en/vctk/captain-cook',
        description: 'Captain Cook • English • VCTK',
        language: 'en'
      },
      {
        name: 'tts_models/en/vctk/sc-glow-tts',
        description: 'Glow TTS Speedy • English • VCTK',
        language: 'en'
      },
      {
        name: 'tts_models/en/vctk/sc-glow-tts',
        description: 'Glow TTS Speedy • English • VCTK',
        language: 'en'
      },
      {
        name: 'tts_models/en/blizzard2013/capacitron-t2-c50',
        description: 'Capacitron • English • Blizzard 2013',
        language: 'en'
      },
      {
        name: 'tts_models/en/blizzard2013/capacitron-t2-c150_v2',
        description: 'Capacitron v2 • English • Blizzard 2013',
        language: 'en'
      },
      // Multi-language and other languages
      {
        name: 'tts_models/multilingual/multi-dataset/xtts_v2',
        description: 'XTTS v2 • Multilingual • Multi-dataset',
        language: 'mul'
      },
      {
        name: 'tts_models/multilingual/multi-dataset/xtts_v1.1',
        description: 'XTTS v1.1 • Multilingual • Multi-dataset',
        language: 'mul'
      },
      {
        name: 'tts_models/multilingual/multi-dataset/your_tts',
        description: 'YourTTS • Multilingual • Multi-dataset',
        language: 'mul'
      },
      {
        name: 'tts_models/multilingual/multi-dataset/bark',
        description: 'Bark • Multilingual • Multi-dataset',
        language: 'mul'
      },
      {
        name: 'tts_models/es/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • Spanish • MAI',
        language: 'es'
      },
      {
        name: 'tts_models/es/css10/vits',
        description: 'VITS • Spanish • CSS10',
        language: 'es'
      },
      {
        name: 'tts_models/fr/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • French • MAI',
        language: 'fr'
      },
      {
        name: 'tts_models/fr/css10/vits',
        description: 'VITS • French • CSS10',
        language: 'fr'
      },
      {
        name: 'tts_models/de/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • German • MAI',
        language: 'de'
      },
      {
        name: 'tts_models/de/css10/vits-neon',
        description: 'VITS Neon • German • CSS10',
        language: 'de'
      },
      {
        name: 'tts_models/de/thorsten/tacotron2-DDC',
        description: 'Tacotron2 DDC • German • Thorsten',
        language: 'de'
      },
      {
        name: 'tts_models/de/thorsten/vits',
        description: 'VITS • German • Thorsten',
        language: 'de'
      },
      {
        name: 'tts_models/de/thorsten/tacotron2-DCA',
        description: 'Tacotron2 DCA • German • Thorsten',
        language: 'de'
      },
      {
        name: 'tts_models/it/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • Italian • MAI',
        language: 'it'
      },
      {
        name: 'tts_models/pt/cv/vits',
        description: 'VITS • Portuguese • Common Voice',
        language: 'pt'
      },
      {
        name: 'tts_models/pl/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • Polish • MAI',
        language: 'pl'
      },
      {
        name: 'tts_models/tr/common-voice/glow-tts',
        description: 'Glow TTS • Turkish • Common Voice',
        language: 'tr'
      },
      {
        name: 'tts_models/tr/common-voice/vits',
        description: 'VITS • Turkish • Common Voice',
        language: 'tr'
      },
      {
        name: 'tts_models/ru/multi-dataset/tacotron2-DDC',
        description: 'Tacotron2 DDC • Russian • Multi-dataset',
        language: 'ru'
      },
      {
        name: 'tts_models/nl/mai/tacotron2-DDC',
        description: 'Tacotron2 DDC • Dutch • MAI',
        language: 'nl'
      },
      {
        name: 'tts_models/ca/custom/vits',
        description: 'VITS • Catalan • Custom',
        language: 'ca'
      },
      {
        name: 'tts_models/ar/pischek/wavenet',
        description: 'WaveNet • Arabic • Pischek',
        language: 'ar'
      },
      {
        name: 'tts_models/cs/cv/vits',
        description: 'VITS • Czech • Common Voice',
        language: 'cs'
      },
      {
        name: 'tts_models/zh-cn/tmp/tacotron2-DDC',
        description: 'Tacotron2 DDC • Chinese • TMP',
        language: 'zh-cn'
      },
      {
        name: 'tts_models/ja/kokoro/tacotron2-DDC',
        description: 'Tacotron2 DDC • Japanese • Kokoro',
        language: 'ja'
      },
      {
        name: 'tts_models/hu/css10/vits',
        description: 'VITS • Hungarian • CSS10',
        language: 'hu'
      },
      {
        name: 'tts_models/ko/kss/tacotron2-DDC',
        description: 'Tacotron2 DDC • Korean • KSS',
        language: 'ko'
      }
    ]

    return models
  }

  async checkServerHealth(): Promise<boolean> {
    try {
      // Try checking the root endpoint first
      let rootResponse;
      try {
        rootResponse = await fetch(this.ttsServerUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        })
        if (rootResponse && rootResponse.ok) {
          return true
        }
      } catch (fetchError) {
        console.log('TTS server root endpoint not accessible:', fetchError instanceof Error ? fetchError.message : String(fetchError))
      }

      // Fallback to trying a POST request with test data
      try {
        const testResponse = await fetch(`${this.ttsServerUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            text: 'test',
            speaker_id: '',
            style_wav: '',
            language_id: ''
          }),
          signal: AbortSignal.timeout(2000) // 2 second timeout
        })
        return testResponse && testResponse.status !== 500 // Accept any response that's not a server error
      } catch (fetchError) {
        console.log('TTS server API endpoint not accessible:', fetchError instanceof Error ? fetchError.message : String(fetchError))
      }

      return false
    } catch (error) {
      console.log('TTS server health check failed:', error)
      return false
    }
  }
}
