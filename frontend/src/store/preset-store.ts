import { create } from 'zustand'
import type { UiPresetConfig } from '@/types/ui-config'

interface PresetState {
  config: UiPresetConfig | null
  loading: boolean
  setConfig: (config: UiPresetConfig) => void
  setLoading: (loading: boolean) => void
}

export const usePresetStore = create<PresetState>((set) => ({
  config: null,
  loading: false,
  setConfig: (config) => set({ config }),
  setLoading: (loading) => set({ loading }),
}))
