# GG RUSH real leaderboard backend

Цей Worker зберігає реальних користувачів Telegram у Cloudflare D1 та віддає топ за GG.

## 1. Створити D1

У Cloudflare створіть D1 database `gg-rush`, виконайте `schema.sql`, скопіюйте Database ID у `wrangler.toml`.

## 2. Додати секрет бота

Використайте токен **вашого Telegram-бота** як секрет `BOT_TOKEN`:

`npx wrangler secret put BOT_TOKEN`

Не вставляйте токен бота у `index.html` або GitHub.

## 3. Deploy

Встановіть Wrangler і виконайте:

`npx wrangler deploy`

Після цього буде URL виду `https://gg-rush-api.<your-subdomain>.workers.dev`.

## 4. Підключити frontend

У `index.html` знайдіть:

`const API_URL = "";`

і поставте URL Worker без `/` наприкінці.

### Що відбувається
- Telegram WebApp `initData` перевіряється на сервері через BOT_TOKEN.
- У базу потрапляють лише користувачі з валідним Telegram WebApp auth.
- Ім'я/username/аватар беруться з Telegram.
- Топ сортується за GG.
- Якщо сервер не підключений, frontend не показує фейкових ботів.
