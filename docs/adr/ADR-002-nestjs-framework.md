# ADR-002: Выбор Node.js + NestJS как основного фреймворка

## Контекст
Необходимо выбрать технологический стек для backend-разработки с учётом требований:
- TypeScript обязателен (type safety)
- Modular architecture
- Enterprise-grade features (DI, pipes, guards)
- OpenAPI generation
- Большое сообщество и поддержка

## Рассматриваемые варианты

### 1. Express.js + TypeScript
- **Плюсы:** Гибкость, контроль, производительность
- **Минусы:** Boilerplate для enterprise features, отсутствие DI

### 2. NestJS (Выбран)
- **Плюсы:**
  - Встроенный DI ( Inversify)
  - Pipes, Guards, Interceptors — enterprise-ready
  - Модульная система из коробки
  - Автоматическая генерация OpenAPI/Swagger
  - TypeScript-first
  - Отличная документация
- **Минусы:**
  - Крутая кривая обучения
  - Overhead для простых операций

### 3. Fastify
- **Плюсы:** Высокая производительность
- **Минусы:** Меньше экосистема для enterprise

## Решение
Выбран **NestJS** как основной framework благодаря:
- Встроенной поддержке модульной архитектуры
- Автоматическому OpenAPI (Swagger) генератору
- Pipes/Guards для валидации и RBAC
- TypeScript по умолчанию

## Статус
Принято

## Дата
2026-02-16
