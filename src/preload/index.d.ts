import type { SwingApi } from '@shared/types'

declare global {
  interface Window {
    swing: SwingApi
  }
}

export {}
