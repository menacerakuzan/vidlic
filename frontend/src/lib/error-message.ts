export function extractApiErrorMessage(status: number, body?: any, fallback = 'Не вдалося виконати запит.'): string {
  const raw = body?.message || body?.error?.message || body?.error
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase()
    if (lower.includes('unauthorized')) return 'Сесія завершилась або доступ не авторизовано. Увійдіть повторно.'
    if (lower.includes('forbidden')) return 'У вас недостатньо прав для цієї дії.'
    if (lower.includes('not found')) return 'Запитаний ресурс не знайдено.'
    if (lower.includes('internal server error')) return 'Внутрішня помилка сервера. Спробуйте пізніше.'
    return raw
  }

  if (status === 400) return 'Запит містить помилку у даних. Перевірте поля.'
  if (status === 401) return 'Сесія завершилась або доступ не авторизовано. Увійдіть повторно.'
  if (status === 403) return 'У вас недостатньо прав для цієї дії.'
  if (status === 404) return 'Запитаний ресурс не знайдено.'
  if (status === 409) return 'Конфлікт даних. Перевірте, чи не дублюється запис.'
  if (status === 422) return 'Не вдалося обробити запит через невалідні дані.'
  if (status >= 500) return 'Внутрішня помилка сервера. Спробуйте пізніше.'

  return fallback
}
