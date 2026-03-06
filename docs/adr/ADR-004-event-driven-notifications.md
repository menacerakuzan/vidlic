# ADR-004: Event-Driven подход для доменов уведомлений и аудита

## Контекст
Необходимо обеспечить:
- Loose coupling между доменами
- Асинхронные уведомления
- Полный аудит действий
- Возможность расширения (новые notification channels)

## Рассматриваемые варианты

### 1. Синхронные вызовы (REST)
- **Минусы:** Tight coupling, блокирующие операции, сложность добавления новых consumers

### 2. Message Queue (Выбран)
- **Плюсы:**
  - Loose coupling доменов
  - Асинхронная обработка
  - Guarantee delivery
  - Event replay для debugging
  - Масштабируемость consumer-ов
- **Минусы:** Сложность (need to manage infrastructure)

### 3. Database-backed events
- **Плюсы:** Простота
- **Минусы:** Polling overhead, не real-time

## Решение
Использовать **RabbitMQ** (или Redis + Bull) для:
- Events: `ReportSubmitted`, `ReportApproved`, `ReportRejected`, `TaskCreated`, `TaskCompleted`
- Consumers: Notifications Service, Audit Service, Analytics Service

Event payload:
```typescript
interface DomainEvent {
  id: string;
  type: string;
  timestamp: Date;
  payload: Record<string, any>;
  metadata: {
    userId: string;
    correlationId: string;
  };
}
```

## Статус
Принято

## Дата
2026-02-16
