# mastra-telegram-bot

Minimal Telegram bot that relays **straight to a Mastra agent**. A message hits the agent, the LLM answers, the answer streams back — no bot library, no message handler, no tools yet. Built on the latest Mastra with **Channels** (Telegram, beta adapter), **observational memory**, and **Postgres** storage, packaged to run via **Docker Compose** and deploy to **Railway**.

## Architecture

```
Telegram user
     │  message
     ▼
Mastra webhook  (auto-generated)
  /api/agents/assistant/channels/telegram/webhook
     │
     ▼
Assistant agent  →  LLM answers  →  reply streams back to the chat
     │
     ▼
Postgres  (threads, messages, observational-memory log)
```

Two source files do everything:

- `src/mastra/agents/assistant.ts` — the agent: instructions, model, Telegram channel, observational memory.
- `src/mastra/index.ts` — the Mastra instance + Postgres storage.

## Components from the latest Mastra in use

- **Channels** (`@mastra/core@1.22.0`+) — connects Telegram directly to the agent and auto-generates the webhook route. Uses the official **beta** `@chat-adapter/telegram`.
- **Observational memory** — `observationalMemory: true`. Background agents compress old messages into a dense observation log, keeping the context window small while preserving long-term memory.
- **Postgres storage** (`@mastra/pg`) — durable storage for threads, messages, and the memory log. Mastra creates its tables automatically on first use.

### Where memory is stored

In **Postgres**. Mastra writes everything it persists (conversation threads, messages, and the observational-memory observations) into tables it manages (`mastra_threads`, `mastra_messages`, `mastra_resources`, etc.). Locally that's the `db` container in Compose, backed by the `pgdata` volume so it survives restarts. In production it's your managed Postgres.

## Run locally with Docker Compose

```bash
cp .env.example .env      # add TELEGRAM_BOT_TOKEN and OPENAI_API_KEY
docker compose up --build
```

Compose starts two services: `db` (Postgres 16) and `bot` (the Mastra server on `:4111`). `DATABASE_URL` is wired to the `db` service automatically — you don't need to set it for local runs.

### Connect Telegram to your local server

Telegram needs a public URL to deliver messages. Expose `:4111` with a tunnel:

```bash
ngrok http 4111
# or: npx cloudflared tunnel --url http://localhost:4111
```

Set your bot's webhook to the tunnel URL + the agent's channel route:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-tunnel>.ngrok.io/api/agents/assistant/channels/telegram/webhook"
```

Message your bot — it replies. (You can also chat with the agent in Studio: run `npm run dev` instead of Compose.)

## Deploy to Railway

Railway can build straight from this repo's Dockerfile and gives you a managed Postgres in the same project.

1. **Push to GitHub.**
2. **Create the project:** Railway → New Project → Deploy from GitHub repo. Railway detects the `Dockerfile` and builds it. (The `bot` service from `docker-compose.yml` is what you're deploying; Compose is for local dev — on Railway you add Postgres as a managed plugin instead of the `db` container.)
3. **Add Postgres:** in the project, New → Database → Add PostgreSQL. Railway exposes its connection string as `DATABASE_URL` (or `DATABASE_PUBLIC_URL`).
4. **Set variables** on the bot service: `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, optionally `MODEL`, and `DATABASE_URL` (reference the Postgres plugin's variable). Make sure the bot's `DATABASE_URL` points at the Railway Postgres, not the compose default.
5. **Expose a domain:** Railway → the bot service → Settings → Networking → Generate Domain. This is your public HTTPS URL.
6. **Set the Telegram webhook** to that domain + the channel route:

   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-app>.up.railway.app/api/agents/assistant/channels/telegram/webhook"
   ```

That's it — the bot is live. Because Channels is webhook-based, there's no polling loop to keep alive; Railway just needs to serve the route.

> **Postgres SSL note:** managed Postgres often requires SSL. If you hit a connection error on Railway, add `?sslmode=require` to `DATABASE_URL`, or set `ssl: { rejectUnauthorized: false }` on `PostgresStore` in `src/mastra/index.ts`.

## Later

When you want capabilities, add a `tools: { … }` field to the agent. Channels even renders Approve/Deny buttons for tools marked `requireApproval: true`. For now this is intentionally just: talk to the bot → agent → LLM → reply.
