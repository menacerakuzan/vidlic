import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_manager: 'bg-yellow-100 text-yellow-700',
    pending_clerk: 'bg-violet-100 text-violet-700',
    pending_director: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }
  return colors[status] || 'bg-gray-100 text-gray-700'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Чернетка',
    pending_manager: 'Фінальне погодження керівника',
    pending_clerk: 'На погодженні у діловода',
    pending_director: 'На погодженні у директора',
    approved: 'Затверджено',
    rejected: 'Відхилено',
  }
  return labels[status] || status
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-orange-100 text-orange-600',
    critical: 'bg-red-100 text-red-600',
  }
  return colors[priority] || 'bg-gray-100 text-gray-600'
}

export function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: 'Низький',
    medium: 'Середній',
    high: 'Високий',
    critical: 'Критичний',
  }
  return labels[priority] || priority
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    specialist: 'Спеціаліст',
    manager: 'Керівник',
    clerk: 'Діловод',
    director: 'Директор',
    admin: 'Адмін',
  }
  return labels[role] || role
}
