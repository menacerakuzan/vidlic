import { create } from 'zustand'

interface UiState {
  modals: {
    createReport: boolean
    createTask: boolean
  }
  filters: {
    reportsStatus?: string
    tasksPriority?: string
  }
  openModal: (key: keyof UiState['modals']) => void
  closeModal: (key: keyof UiState['modals']) => void
  setFilter: (key: keyof UiState['filters'], value?: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  modals: {
    createReport: false,
    createTask: false,
  },
  filters: {},
  openModal: (key) =>
    set((state) => ({
      modals: { ...state.modals, [key]: true },
    })),
  closeModal: (key) =>
    set((state) => ({
      modals: { ...state.modals, [key]: false },
    })),
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
}))
