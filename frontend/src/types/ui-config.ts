export type UiWidgetType = 'stat' | 'list' | 'chart' | 'action' | 'timeline'

export interface UiWidgetConfig {
  id: string
  type: UiWidgetType
  title: string
  span: { col: number; row: number }
  dataSource?: string
  variant?: string
}

export interface UiLayoutConfig {
  id: string
  grid: { columns: number; gap: number; rowHeight: number }
  widgets: UiWidgetConfig[]
}

export interface UiPresetConfig {
  role?: string
  page: string
  query: string
  category: string
  pattern: string
  style: {
    name: string
    keywords: string
    effects: string
    bestFor: string
  }
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  typography: {
    heading: string
    body: string
    mood: string
  }
  effects: string[]
  antiPatterns: string[]
  layout: UiLayoutConfig
}
