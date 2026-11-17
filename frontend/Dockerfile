# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage — Vite produces a fully static bundle.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""
ARG VITE_ADMIN_EMAILS=""
ARG VITE_AGENT_EMAILS=""
ARG VITE_ADMIN_EMAIL_DOMAINS=""
ARG VITE_RBAC_STRICT="false"

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL \
    VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS \
    VITE_AGENT_EMAILS=$VITE_AGENT_EMAILS \
    VITE_ADMIN_EMAIL_DOMAINS=$VITE_ADMIN_EMAIL_DOMAINS \
    VITE_RBAC_STRICT=$VITE_RBAC_STRICT

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage — nginx serves immutable assets + SPA fallback.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
