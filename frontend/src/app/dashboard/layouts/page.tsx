'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuthStore } from '@/store/auth-store'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { UiPresetConfig, UiWidgetConfig } from '@/types/ui-config'
import { GlassCard } from '@/components/ui/glass-card'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LayoutBuilderPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [config, setConfig] = useState<UiPresetConfig | null>(null)
  const [widgets, setWidgets] = useState<UiWidgetConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalSteps, setApprovalSteps] = useState<Array<{ order: number; role: 'manager' | 'director'; required: boolean }>>([])
  const [savingFlow, setSavingFlow] = useState(false)
  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('vidlik-accessToken') : null

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      if (!accessToken) return
      setLoading(true)
      const res = await fetch('/api/v1/ai/ui-config?page=dashboard', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        if (!cancelled) setLoading(false)
        return
      }
      const data = await res.json()
      if (!cancelled) {
        setConfig(data)
        setWidgets(data.layout?.widgets || [])
        setLoading(false)
      }
    }

    if (isAuthenticated) loadConfig()
    return () => {
      cancelled = true
    }
  }, [accessToken, isAuthenticated])

  useEffect(() => {
    let cancelled = false
    async function loadFlow() {
      if (!accessToken || user?.role === 'specialist') return
      const res = await fetch('/api/v1/approvals/flows/report', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (!cancelled) {
        const steps = (data.steps || []).map((s: any) => ({
          order: s.order,
          role: s.role,
          required: s.required !== false,
        }))
        setApprovalSteps(steps.length ? steps : [
          { order: 1, role: 'manager', required: true },
          { order: 2, role: 'director', required: true },
        ])
      }
    }
    loadFlow()
    return () => {
      cancelled = true
    }
  }, [accessToken, user?.role])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = widgets.findIndex(w => w.id === active.id)
    const newIndex = widgets.findIndex(w => w.id === over.id)

    const updated = [...widgets]
    const [moved] = updated.splice(oldIndex, 1)
    updated.splice(newIndex, 0, moved)
    setWidgets(updated)
  }

  const updateSpan = (id: string, col?: number, row?: number) => {
    setWidgets(prev =>
      prev.map(widget =>
        widget.id === id
          ? { ...widget, span: { col: col ?? widget.span.col, row: row ?? widget.span.row } }
          : widget
      )
    )
  }

  const saveLayout = async () => {
    if (!accessToken || !config) return
    await fetch('/api/v1/ai/ui-config?page=dashboard', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: config.layout.id,
        widgets,
      }),
    })
  }

  const saveFlow = async () => {
    if (!accessToken || !approvalSteps.length) return
    setSavingFlow(true)
    await fetch('/api/v1/approvals/flows/report', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ steps: approvalSteps }),
    })
    setSavingFlow(false)
  }

  const updateStepRole = (index: number, role: 'manager' | 'director') => {
    setApprovalSteps((prev) => prev.map((step, i) => (i === index ? { ...step, role } : step)))
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold font-display">Конструктор дашборду</h1>
            <p className="text-slate-500 mt-1">Перетягуйте віджети та змінюйте розміри</p>
          </div>
          <Button className="rounded-full" onClick={saveLayout}>
            <Save className="w-4 h-4 mr-2" />
            Зберегти
          </Button>
        </div>

        {loading && <div className="glass-card p-6 text-sm text-slate-500">Завантаження...</div>}

        {!loading && (
          <div className="space-y-6">
            <DndContext onDragEnd={handleDragEnd}>
              <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {widgets.map(widget => (
                    <WidgetRow key={widget.id} widget={widget} onSpanChange={updateSpan} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {user?.role !== 'specialist' && (
              <GlassCard className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Конструктор погодження звітів</h2>
                    <p className="text-sm text-slate-500">Налаштуйте послідовність: керівник/директор</p>
                  </div>
                  <Button onClick={saveFlow} disabled={savingFlow}>
                    {savingFlow ? 'Збереження...' : 'Зберегти flow'}
                  </Button>
                </div>
                <div className="space-y-2">
                  {approvalSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-sm text-slate-600 min-w-10">Крок {step.order}</span>
                      <select
                        value={step.role}
                        onChange={(e) => updateStepRole(idx, e.target.value as 'manager' | 'director')}
                        className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
                      >
                        <option value="manager">Керівник</option>
                        <option value="director">Директор</option>
                      </select>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function WidgetRow({ widget, onSpanChange }: { widget: UiWidgetConfig; onSpanChange: (id: string, col?: number, row?: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: widget.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GlassCard className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-grab">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{widget.title}</p>
          <p className="text-xs text-slate-500">{widget.type}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500">Col</label>
          <input
            type="number"
            min={1}
            max={12}
            value={widget.span.col}
            onChange={(e) => onSpanChange(widget.id, Number(e.target.value), undefined)}
            className="w-16 rounded-lg bg-white/70 px-2 py-1 text-xs"
          />
          <label className="text-xs text-slate-500">Row</label>
          <input
            type="number"
            min={1}
            max={6}
            value={widget.span.row}
            onChange={(e) => onSpanChange(widget.id, undefined, Number(e.target.value))}
            className="w-16 rounded-lg bg-white/70 px-2 py-1 text-xs"
          />
        </div>
      </GlassCard>
    </div>
  )
}
