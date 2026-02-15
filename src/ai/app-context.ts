export const IZABI_APP_CONTEXT_VERSION = 1;

export const IZABI_APP_CONTEXT = `
# Izabi App Context (v${IZABI_APP_CONTEXT_VERSION})

Izabi is a learning/study web app with a protected dashboard and an AI assistant chat.

## Frontend Routes (React Router)
Routes are defined in \`Izabi/src/router/routes.tsx\`.

### Public
- \`/\` Home
- \`/features\`
- \`/how-it-works\`
- \`/testimonials\`
- \`/pricing\` (feature-flagged)
- \`/faq\`
- \`/about\`
- \`/contact\`
- \`/otp\`
- \`/login\`
- \`/signup\`

### Dashboard (requires authToken + userId in localStorage)
- \`/dashboard\` (index = DashboardHome)
- \`/dashboard/notes\`
- \`/dashboard/ai-assistant\`
- \`/dashboard/progress\`
- \`/dashboard/history\`
- \`/dashboard/profile\`
- \`/dashboard/settings\`
- \`/dashboard/exams\`
- \`/dashboard/leaderboard\`
- \`/dashboard/contact\` (Support)
- \`/dashboard/subscription\` (feature-flagged)
- \`/dashboard/admin\` (ADMIN role only)

## Theme (Light/Dark/System)
Theme is managed by \`Izabi/src/components/theme-provider.tsx\`.
- Theme values: \`light\` | \`dark\` | \`system\`
- Persistence: localStorage key \`vite-ui-theme\`
- Implementation: adds \`light\` or \`dark\` class to \`document.documentElement\`

User-facing UI for changing theme is in \`Izabi/src/pages/DashboardSettings.tsx\`:
- Go to \`settings\`
- Use the Theme section to select Light / Dark / System (Auto)

## AI Assistant Chat
UI page: \`/dashboard/ai-assistant\` (\`Izabi/src/pages/DashboardAIAssistant.tsx\`)
- Streaming AI responses (SSE)
- Chat sessions/history drawer
- PDF upload for “chat with document”

Backend endpoints (Nest): \`izabi-backend/src/ai/ai.controller.ts\`
- \`GET /api/ai/sessions\`
- \`POST /api/ai/sessions\`
- \`GET /api/ai/history?sessionId=...\`
- \`POST /api/ai/clear-history\`
- \`SSE /api/ai/stream?message=...&documentId=...&sessionId=...\`
- \`POST /api/ai/upload-pdf\`

## Answering App Questions
When a user asks “How do I do X in this website?”, prefer giving steps using these routes/features first.
If the question is about a specific page, ask which route/page they are on (or direct them to \`/dashboard/settings\` for theme-related questions).
`.trim();

