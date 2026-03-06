# ADR-005: JWT Authentication с Refresh Token Rotation

## Контекст
Требования к безопасности:
- Stateless аутентификация
- Защита от token theft
- Возможность отзыва скомпрометированных токенов
- Session management

## Рассматриваемые варианты

### 1. Session-based (Express Session)
- **Минусы:** Stateful, не масштабируется без sticky sessions

### 2. JWT Access + Refresh (Выбран)
- **Access Token:** 15 минут, short-lived
- **Refresh Token:** 7 дней, rotation при каждом использовании
- **Blacklist:** Хранится в Redis для быстрого lookup
- **Плюсы:**
  - Stateless
  - Rotation предотвращает replay attacks
  - Blacklist для отзыва
  - easy horizontal scaling

### 3. OAuth2/OIDC
- **Минусы:** Overhead для internal system

## Решение
Выбрана схема JWT + Refresh Rotation:
1. Login → Access + Refresh tokens
2. Access expired → Refresh endpoint
3. Server validates refresh, rotates (new access + new refresh)
4. Old refresh invalidated
5. Logout → Blacklist refresh token

## Статус
Принято

## Дата
2026-02-16
