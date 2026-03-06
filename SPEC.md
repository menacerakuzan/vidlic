# SPEC.md — Corporate Reporting & Task Management System "Відлік"

## 1. Project Overview

**Назва системи:** Відлік (Vidlik)  
**Тип:** Enterprise Web Application  
**Мова інтерфейсу:** Українська  
**Мова технічної документації:** Російська

### Суть продукту
Корпоративна платформа для підготовки звітності (тижневих/місячних), управління задачами підрозділів та прийняття управлінських рішень в ієрархічних організаціях (державні структури, великі корпорації).

### Цільова аудиторія
- **Specialist** — рядові співробітники, творці звітів та виконавці задач
- **Manager** — керівники підрозділів, погоджувачі звітів
- **Director** — топ-менеджмент, фінальне затвердження, аналітика
- **Admin** — системні адміністратори, безпека, аудит

---

## 2. User Stories & Функціональні Вимоги

### 2.1 Звітність (Reports)

| ID | Story | Пріоритет |
|----|-------|-----------|
| R01 | Як Specialist, я хочу створювати тижневі звіти з полями: назва, опис роботи, досягнення, проблеми, план на наступний тиждень | Must |
| R02 | Як Specialist, я хочу зберігати звіт як чернетку перед відправкою | Must |
| R03 | Як Specialist, я хочу редагувати свій чернетковий звіт | Must |
| R04 | Як Manager, я хочу переглядати звіти підрозділу | Must |
| R05 | Як Manager, я хочу погоджувати/відхиляти звіт з коментарем | Must |
| R06 | Як Director, я хочу фінально затверджувати звіти | Must |
| R07 | Як Director, я хочу генерувати місячний звіт на основі погоджених тижневих | Must |
| R08 | Як AI, я хочу агрегувати тижневі звіти в проєкт місячного | Should |
| R09 | Як Director, я хочу експортувати звіт у DOCX/PDF | Should |
| R10 | Як Specialist, я хочу бачити історію статусів звіту | Should |

### 2.2 Задачі (Tasks/Kanban)

| ID | Story | Пріоритет |
|----|-------|-----------|
| T01 | Як Manager, я хочу створювати задачі з назвою, описом, пріоритетом, дедлайном, виконавцем | Must |
| T02 | Як Specialist, я хочу бачити дошку Kanban з задачами підрозділу | Must |
| T03 | Як Specialist, я хочу змінювати статус задачі (Todo → In Progress → Done) | Must |
| T04 | Як Manager, я хочу фільтрувати задачі за пріоритетом, статусом, виконавцем | Should |
| T05 | Як Manager, я хочу прив'язувати задачу до звіту чи ініціативи | Should |
| T06 | Як Specialist, я хочу отримувати сповіщення про дедлайни задач | Must |

### 2.3 Спілкування та нотифікації

| ID | Story | Пріоритет |
|----|-------|-----------|
| N01 | Як користувач, я хочу отримувати сповіщення про зміну статусу звіту | Must |
| N02 | Як користувач, я хочу отримувати сповіщення про повернення звіту на доробку | Must |
| N03 | Як Manager, я хочу бачити сповіщення про просрочені задачі | Must |
| N04 | Як Admin, я хочу налаштовувати канали сповіщень (email, in-app, telegram) | Should |

### 2.4 Безпека та аудит

| ID | Story | Пріоритет |
|----|-------|-----------|
| S01 | Як Admin, я хочу керувати користувачами (CRUD) | Must |
| S02 | Як Admin, я хочу призначати ролі (Specialist, Manager, Director, Admin) | Must |
| S03 | Як Admin, я хочу бачити повний audit trail всіх дій | Must |
| S04 | Як система, я хочу логувати всі критичні операції | Must |
| S05 | Як Director, я хочу переглядати хто і що робив у системі | Should |

### 2.5 Аналітика та дашборди

| ID | Story | Пріоритет |
|----|-------|-----------|
| A01 | Як Director, я хочу бачити dashboard з KPI підрозділів | Should |
| A02 | Як Manager, я хочу бачити статистику звітності підрозділу | Should |
| A03 | Як Director, я хочу порівнювати продуктивність підрозділів | Should |

---

## 3. Бізнес-процеси

### 3.1 Lifecycle звіту (Weekly Report)

```
[Draft] → (submit) → [Pending Manager] → (approve) → [Pending Director] → (approve) → [Approved]
                                              ↓ (reject)
                                           [Rejected] → (fix & resubmit) → [Pending Manager]
```

**Стани:**
- `DRAFT` — чернетка, повне редагування
- `PENDING_MANAGER` — на погодженні у керівника
- `PENDING_DIRECTOR` — на фінальному погодженні
- `APPROVED` — затверджено
- `REJECTED` — відхилено (з коментарем)

### 3.2 Lifecycle задачі (Task)

```
[Todo] → (start) → [In Progress] → (complete) → [Done]
     ↑                                              ↓
     ←──────────── (reopen) ──────────────────────←
```

**Пріоритети:** `low`, `medium`, `high`, `critical`

### 3.3 Формування місячного звіту

1. Система автоматично збирає всі approved weekly за період
2. AI генерує проєкт місячного звіту
3. Director редагує та затверджує
4. Фінальний PDF/DOCX експорт

---

## 4. Архітектура

### 4.1 Architectural Style: Modular Monolith

**Обґрунтування:**
- Еволюційний перехід до microservices без переписування доменної логики
- Чіткі границі доменів (Bounded Contexts)
- Спільна БД для транзакційної цілісності, окремі таблиці/схеми для доменів
- Event-driven для Loose Coupling

### 4.2 C4 Модель

#### Level 1: Context Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                         "ВІДЛІК"                                │
│  Corporate Reporting & Task Management System                  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Specialists  │    │   Managers    │    │  Directors    │
│               │    │               │    │               │
│ • Reports     │    │ • Approvals   │    │ • Analytics   │
│ • Tasks       │    │ • Tasks       │    │ • Exports     │
│ • My Data     │    │ • Analytics   │    │ • Final Apps   │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│     HR/IT      │    │   Email       │    │  Document     │
│   Systems      │    │   Server      │    │  Storage      │
│                │    │               │    │               │
│ • LDAP/AD     │    │ • SMTP        │    │ • S3/MinIO    │
│ • Employee DB  │    │ • Templates   │    │ • Versions    │
└───────────────┘    └───────────────┘    └───────────────┘
```

#### Level 2: Container Diagram
```
┌────────────────────────────────────────────────────────────────────────────┐
│                              "ВІДЛІК" Platform                             │
└────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │                        API Gateway / BFF                              │
    │  • Rate Limiting  • Authentication  • Request Routing  • Validation  │
    └──────────────────────────────────────────────────────────────────────┘
                                      │
    ┌─────────────┬─────────────┬─────────────┬─────────────┬────────────┐
    │             │             │             │             │            │
    ▼             ▼             ▼             ▼             ▼            ▼
┌────────┐  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│ Auth   │  │ Users  │   │Reports │   │ Tasks  │   │Appro-  │   │Analytics│
│Domain  │  │Domain  │   │Domain  │   │Domain  │   │vals    │   │Domain   │
│        │  │        │   │        │   │        │   │        │   │         │
│• JWT   │  │• Org   │   │• Weekly│   │• Kanban│   │• Work- │   │• Dash-  │
│• RBAC  │  │• Roles │   │• Monthly│  │• Prior │   │flow    │   │boards   │
│• MFA   │  │• Profile│  │• AI    │   │• Due  │   │• Notif │   │• KPIs   │
└────────┘  └────────┘   └────────┘   └────────┘   └────────┘   └────────┘
    │             │             │             │             │            │
    └─────────────┴─────────────┴─────────────┴─────────────┴────────────┘
                                      │
    ┌──────────────────────────────────────────────────────────────────────┐
    │                      Shared Infrastructure                           │
    │  • Event Bus (Kafka/RabbitMQ)  • Audit Logger  • Notification Svc  │
    └──────────────────────────────────────────────────────────────────────┘
                                      │
    ┌──────────────────────────────────────────────────────────────────────┐
    │                      PostgreSQL Database                             │
    │  • auth.*  • users.*  • reports.*  • tasks.*  • audit.*  • analytics│
    └──────────────────────────────────────────────────────────────────────┘
```

#### Level 3: Component Diagram (Reports Domain)
```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Reports Domain                                    │
└────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────┐
    │                    Reports API Controller                            │
    │  • POST /api/v1/reports          • GET /api/v1/reports/{id}         │
    │  • PUT /api/v1/reports/{id}      • POST /api/v1/reports/{id}/submit │
    │  • POST /api/v1/reports/{id}/approve • POST /api/v1/reports/{id}/reject│
    └──────────────────────────────────────────────────────────────────────┘
                                      │
    ┌──────────────────────────────────────────────────────────────────────┐
    │                    Reports Service Layer                            │
    │                                                                     │
    │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
    │  │ ReportManager   │  │ ApprovalWorkflow│  │ ExportService   │     │
    │  │ • create()      │  │ • submit()      │  │ • toDOCX()      │     │
    │  │ • update()      │  │ • approve()     │  │ • toPDF()       │     │
    │  │ • getById()     │  │ • reject()      │  │                 │     │
    │  │ • list()        │  │ • getHistory()  │  │                 │     │
    │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
    │                                                                     │
    │  ┌─────────────────┐  ┌─────────────────┐                          │
    │  │ MonthlyReport  │  │ AI aggregation  │                          │
    │  │ Generator      │  │ Service         │                          │
    │  │ • generate()   │  │ • summarize()   │                          │
    │  │ • aggregate()  │  │ • suggest()     │                          │
    │  └─────────────────┘  └─────────────────┘                          │
    └──────────────────────────────────────────────────────────────────────┘
                                      │
    ┌──────────────────────────────────────────────────────────────────────┐
    │                    Reports Repository                               │
    │  • ReportEntity          • ReportVersionEntity                      │
    │  • ReportStatusHistory   • MonthlyReportEntity                      │
    └──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Доменна структура (Bounded Contexts)

| Домен | Відповідальність | Ключові сутності |
|-------|------------------|------------------|
| Auth | Аутентифікація, авторизація, сесії | User, Session, Token, Permission |
| Users | Профілі, організаційна структура | Employee, Department, Position |
| Reports | Тижневі/місячні звіти | WeeklyReport, MonthlyReport, ReportVersion |
| Approvals | Маршрути погодження | ApprovalFlow, ApprovalAction, Comment |
| Tasks | Kanban-задачі | Task, TaskBoard, TaskComment |
| Notifications | Сповіщення | Notification, NotificationChannel, NotificationPreference |
| Audit | Аудит, логування | AuditLog, AuditEvent |
| Analytics | Дашборди, KPI | Dashboard, Widget, ReportMetric |
| AI | AI-функціональність | AIJob, AIPrompt, AIResponse |
| Exports | Експорт документів | ExportJob, ExportTemplate |

---

## 5. Технологічний Stack

### Backend
- **Runtime:** Node.js 20 LTS (TypeScript)
- **Framework:** NestJS (modular, DI, pipes, guards)
- **API:** REST + OpenAPI 3.1
- **Database:** PostgreSQL 16
- **ORM:** Prisma або TypeORM
- **Message Queue:** RabbitMQ (або Redis для простішого)
- **Caching:** Redis
- **Validation:** Zod + class-validator
- **Testing:** Jest + Supertest

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** React + TailwindCSS
- **State:** Zustand або TanStack Query
- **Forms:** React Hook Form + Zod
- **Components:** shadcn/ui (Apple-стиль)
- **Charts:** Recharts

### DevOps
- **Container:** Docker + Docker Compose
- **CI/CD:** GitHub Actions
- **Secrets:** HashiCorp Vault / env vars

---

## 6. Дані та БД

### 6.1 ER-Модель (Core Tables)

```sql
-- Core Tables (публічна схема)
-- =============================

-- users (ERP/HR integration)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    patronymic VARCHAR(100),
    department_id UUID REFERENCES departments(id),
    position_id UUID REFERENCES positions(id),
    role user_role NOT NULL DEFAULT 'specialist',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- departments (org structure)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    name_uk VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES departments(id),
    manager_id UUID REFERENCES users(id),
    director_id UUID REFERENCES users(id),
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- positions
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    title_uk VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id),
    level INTEGER DEFAULT 1
);

-- reports
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type report_type NOT NULL, -- 'weekly' | 'monthly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    title VARCHAR(500),
    content JSONB NOT NULL DEFAULT '{}',
    status report_status NOT NULL DEFAULT 'draft',
    author_id UUID REFERENCES users(id) NOT NULL,
    department_id UUID REFERENCES departments(id),
    current_approver_id UUID REFERENCES users(id),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ
);

-- report_versions (history)
CREATE TABLE report_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content JSONB NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- report_status_history
CREATE TABLE report_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    from_status report_status,
    to_status report_status NOT NULL,
    changed_by UUID REFERENCES users(id),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    department_id UUID REFERENCES departments(id),
    assignee_id UUID REFERENCES users(id),
    reporter_id UUID REFERENCES users(id),
    due_date DATE,
    report_id UUID REFERENCES reports(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- task_comments
CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action audit_action NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- sessions (JWT blacklist)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    device_info VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- export_jobs
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    format export_format NOT NULL,
    status export_status DEFAULT 'pending',
    file_path VARCHAR(1000),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

### 6.2 Індекси

```sql
-- Reports
CREATE INDEX idx_reports_author ON reports(author_id);
CREATE INDEX idx_reports_department ON reports(department_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_period ON reports(period_start, period_end);
CREATE INDEX idx_reports_status_dept ON reports(status, department_id);

-- Tasks
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_department ON tasks(department_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- Audit
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at);

-- Notifications
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at);
```

---

## 7. API Дизайн

### 7.1 API Versioning
- Base URL: `/api/v1`
- Breaking changes: `/api/v2`

### 7.2 Base Response Format
```typescript
// Success
{
  "success": true,
  "data": T,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Помічені поля містять помилки",
    "details": [
      { "field": "email", "message": "Некоректний формат email" }
    ]
  }
}
```

### 7.3 Key Endpoints

#### Auth
- `POST /api/v1/auth/login` — вхід
- `POST /api/v1/auth/refresh` — refresh token
- `POST /api/v1/auth/logout` — вихід (інвалідація токену)
- `GET /api/v1/auth/me` — поточний користувач

#### Reports
- `GET /api/v1/reports` — список звітів (пагінація, фільтри)
- `POST /api/v1/reports` — створити чернетку
- `GET /api/v1/reports/:id` — деталі звіту
- `PUT /api/v1/reports/:id` — редагувати чернетку
- `POST /api/v1/reports/:id/submit` — відправити на погодження
- `POST /api/v1/reports/:id/approve` — погодити
- `POST /api/v1/reports/:id/reject` — відхилити
- `GET /api/v1/reports/:id/history` — історія статусів
- `POST /api/v1/reports/:id/export` — експорт PDF/DOCX

#### Tasks
- `GET /api/v1/tasks` — Kanban дошка
- `POST /api/v1/tasks` — створити задачу
- `PUT /api/v1/tasks/:id` — редагувати
- `PATCH /api/v1/tasks/:id/status` — змінити статус
- `POST /api/v1/tasks/:id/comments` — коментар

#### Users & Org
- `GET /api/v1/users` — користувачі
- `GET /api/v1/departments` — підрозділи
- `GET /api/v1/departments/:id/team` — команда підрозділу

#### Analytics
- `GET /api/v1/analytics/dashboard` — дашборд
- `GET /api/v1/analytics/reports-stats` — статистика звітності
- `GET /api/v1/analytics/tasks-stats` — статистика задач

---

## 8. Безпека

### 8.1 Authentication Flow
```
1. User → POST /auth/login → credentials
2. Server → validate → generate JWT (access + refresh)
3. Access token: 15 min, Refresh: 7 days
4. Each request: validate JWT + check blacklist
5. Refresh: rotate tokens, invalidate old refresh
```

### 8.2 JWT Structure
```typescript
// Access Token
{
  "sub": "user-id",
  "email": "user@org.gov.ua",
  "role": "manager",
  "department_id": "uuid",
  "permissions": ["reports:read", "reports:write", "tasks:read"],
  "iat": 1234567890,
  "exp": 1234567890 + 15min,
  "jti": "unique-token-id"
}
```

### 8.3 RBAC Permissions
| Permission | Specialist | Manager | Director | Admin |
|------------|------------|---------|----------|-------|
| reports:read:own | ✓ | ✓ | ✓ | ✓ |
| reports:read:department | ✗ | ✓ | ✓ | ✓ |
| reports:read:all | ✗ | ✗ | ✓ | ✓ |
| reports:write:own | ✓ | ✓ | ✓ | ✓ |
| reports:approve | ✗ | ✓ | ✓ | ✓ |
| reports:approve:final | ✗ | ✗ | ✓ | ✗ |
| tasks:read:own | ✓ | ✓ | ✓ | ✓ |
| tasks:read:department | ✗ | ✓ | ✓ | ✓ |
| tasks:write:department | ✗ | ✓ | ✓ | ✓ |
| users:manage | ✗ | ✗ | ✗ | ✓ |
| audit:read | ✗ | ✗ | ✓ | ✓ |
| analytics:view | ✗ | ✓ | ✓ | ✓ |

### 8.4 Security Headers
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 9. UI/UX Вимоги

### 9.1 Design System — Apple Style
- **Шрифти:** Inter (UI), SF Pro (Native)
- **Кольори:**
  - Primary: #007AFF (Apple Blue)
  - Success: #34C759
  - Warning: #FF9500
  - Error: #FF3B30
  - Background: #F5F5F7 (light), #1D1D1F (dark)
  - Surface: #FFFFFF (light), #2C2C2E (dark)
- **Відступи:** 4px grid (4, 8, 12, 16, 24, 32, 48)
- **Border radius:** 8px (cards), 12px (buttons), 16px (modals)
- **Тіні:** `0 2px 8px rgba(0,0,0,0.08)` (subtle), `0 8px 32px rgba(0,0,0,0.12)` (elevated)
- **Анімації:** 200ms ease-out (micro), 300ms ease-in-out (transitions)

### 9.2 Layout
- **Sidebar:** 240px, collapsible to 64px
- **Header:** 56px fixed
- **Content:** max-width 1440px, centered
- **Responsive:** Desktop-first (1920 → 1440 → 1024 → 768)

### 9.3 Key Screens
1. **Dashboard** — KPI cards, recent reports, tasks due
2. **Reports List** — table/grid, filters, status badges
3. **Report Editor** — form, rich text, AI suggestions
4. **Tasks Board** — Kanban columns, drag-drop
5. **Analytics** — charts, date pickers, export
6. **Settings** — profile, notifications, security

---

## 10. Non-Functional Requirements

### 10.1 Performance
- API response time: p95 < 200ms
- Page load: < 2s (first contentful paint)
- Support: 10,000+ concurrent users

### 10.2 Reliability
- Uptime: 99.9% (SLA)
- Database backup: daily + WAL archiving
- Graceful degradation

### 10.3 Compliance
- GDPR-ready (right to erasure)
- Audit trail retention: 7 years
- Password policy: min 12 chars, complexity

---

## 11. Roadmap

### Phase 1 (MVP — 8 weeks)
- Auth + RBAC
- Org structure (departments, users)
- Weekly reports (CRUD, workflow)
- Basic tasks
- Notifications

### Phase 2 (4 weeks)
- Monthly reports + AI aggregation
- Export (DOCX/PDF)
- Analytics dashboard

### Phase 3 (4 weeks)
- Advanced RBAC + policies
- Audit system
- MFA
- Integration hooks (LDAP)

---

## 12. Acceptance Criteria

- [ ] Користувач може увійти через email/password
- [ ] Specialist створює та редагує тижневий звіт
- [ ] Manager погоджує/відхиляє звіт підрозділу
- [ ] Director фінально затверджує звіт
- [ ] Задачі відображаються на Kanban дошці
- [ ] Статуси задач змінюються drag-drop
- [ ] Експорт звіту в PDF працює
- [ ] Audit log фіксує всі критичні дії
- [ ] UI доступний українською мовою
- [ ] Система проходить навантажувальне тестування (1000 RPS)
