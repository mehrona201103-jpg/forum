# WAIP RUSSIA Forum
Запуск: npm install && npm start (порт из PORT, по умолчанию 3000).
Railway: файлы (Dockerfile, package.json, server.js, public) должны лежать в КОРНЕ репозитория. Деплой через Dockerfile. Добавить Volume на /data и DATA_DIR=/data.
Переменные: DATA_DIR, TELEGRAM_URL, DISCORD_URL, NODE_ENV=production.
Первый зарегистрированный пользователь автоматически становится главным администратором.
