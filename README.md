# Відлік — AI‑powered Analytics Hub

Цей репозиторій містить модульний моноліт для корпоративної звітності та управління задачами з AI‑шаром, пресетами UI‑дизайну та event‑driven інтеграціями.

## Архітектура
- **Backend**: NestJS + Prisma + PostgreSQL + Redis
- **Frontend**: Next.js (App Router) + Tailwind + shadcn/ui + Zustand + Framer Motion
- **Стиль**: Modular Monolith, домени із чіткими межами

## Нові домени та модулі
- **Approvals**: універсальний рушій погоджень з flow/steps/instances (Prisma) — база для Reports/Tasks та майбутніх сутностей.
- **AI**: резюме звітів, аномалії KPI, UI‑on‑demand конфігурації.
- **UI Presets**: інтеграція пресетів з `ui-ux-pro-max-skill` (MIT, див. `third_party/ui-ux-pro-max-skill.LICENSE`).
- **Event‑Driven**: доменні події (reports/tasks) обробляються listeners у Notifications та Audit.

## Основні API
- `GET /api/v1/ai/ui-config?page=dashboard` — UI‑конфіг для динамічного рендерингу.
- `GET /api/v1/ai/reports/:id/summary` — AI‑резюме звіту.
- `GET /api/v1/ai/kpi-anomalies` — детекція аномалій KPI.

## Пресети UI/UX
Пресети імпортовані з `ui-ux-pro-max-skill`:
- `backend/src/domains/ui-presets/data/*.csv` — стилі, кольори, типографіка, шаблони.

## Запуск (dev)
1. Запустити інфраструктуру: `docker-compose up -d postgres redis`
2. Backend: `cd backend && npm install && npm run start:dev`
3. Frontend: `cd frontend && npm install && npm run dev`

## Безпека
- Всі AI/Presets‑ендпоінти захищені `JwtAuthGuard` + `RolesGuard`.
- Додані права `ai:read` та `ui:read` для ролей.

## AI провайдер (опціонально)
Для підключення зовнішнього LLM використовуйте змінну середовища `AI_PROVIDER_URL`.
Сервіс очікує JSON `{ type: "summary", payload: { title, content, language } }` та повертає `{ summary, highlights, risks, nextSteps }`.

### Gemini (рекомендовано)
Можна підключити Gemini без додаткового сервісу, встановивши `GEMINI_API_KEY` (або `GOOGLE_API_KEY`) та опційно `GEMINI_MODEL` (наприклад `gemini-2.0-flash`). В цьому випадку backend викликає `generateContent` через REST.

## Ліцензії
- Вбудовані пресети UI/UX: MIT. Див. `third_party/ui-ux-pro-max-skill.LICENSE`.
# vidlic
