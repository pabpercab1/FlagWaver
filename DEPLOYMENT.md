# Building & Deploying FlagWaver

FlagWaver is a [Next.js](https://nextjs.org) 16 app (App Router) that can be built as a fully static site, which means it can be hosted on virtually any static host — including **GitHub Pages**, Vercel, Netlify, Cloudflare Pages, S3, or your own server.

This document covers:

1. [Prerequisites](#1-prerequisites)
2. [Local development](#2-local-development)
3. [Building the app](#3-building-the-app)
4. [Deployment option A — GitHub Pages (recommended for this repo)](#4-deployment-option-a--github-pages)
5. [Deployment option B — Vercel](#5-deployment-option-b--vercel)
6. [Deployment option C — Any static host (Netlify, Cloudflare Pages, S3, Nginx…)](#6-deployment-option-c--any-static-host)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

- **Node.js 20+** (LTS recommended)
- **pnpm 9+** (the repo ships a `pnpm-lock.yaml`)
  ```bash
  npm install -g pnpm
  ```
  You can also use `npm` or `yarn`; just replace the commands below accordingly.
- A modern browser with WebGL2 (WebGPU is used when available).

---

## 2. Local development

Install dependencies and start the dev server:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Hot reload is enabled.

---

## 3. Building the app

The project is configured with `output: 'export'` in [next.config.mjs](next.config.mjs), so `next build` produces a fully static site in the `out/` directory.

```bash
pnpm build
```

Result: `out/` contains `index.html`, hashed JS/CSS bundles, and all static assets — ready to serve from any static host.

Preview the built site locally:

```bash
pnpm preview          # runs `npx serve out`
```

---

## 4. Deployment option A — GitHub Pages

This repo includes a ready-to-use workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml) that builds and publishes to GitHub Pages on every push to `main`.

### One-time setup

1. **Push the repo to GitHub** (if you haven't already).
2. In GitHub: **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. Make sure the repo name matches the `repo` constant in [next.config.mjs](next.config.mjs):
   ```js
   const repo = 'v0-flag-simulation-app'
   ```
   If your repo has a different name, update this value — it's used as the `basePath` so assets resolve under `https://<user>.github.io/<repo>/`.

### Deploying

Just push to `main`:

```bash
git push origin main
```

The workflow will:

1. Install dependencies with pnpm.
2. Run `pnpm build` with `NODE_ENV=production` (which activates the `/<repo>` basePath).
3. Add a `.nojekyll` file so GitHub Pages doesn't strip `_next/` asset folders.
4. Upload `out/` and publish via `actions/deploy-pages`.

Your site will be available at:

```
https://<your-username>.github.io/<repo>/
```

### Manual run

You can also trigger the workflow manually from the **Actions** tab (it has `workflow_dispatch` enabled).

### Custom domain or user/organization site

If you deploy to a **user/org site** (`https://<user>.github.io/`) or use a **custom domain** at the root, you don't want a basePath. Override it:

```bash
NEXT_PUBLIC_BASE_PATH="" pnpm build
```

For a custom domain, also add a `CNAME` file to `public/` containing your domain name.

---

## 5. Deployment option B — Vercel

Vercel is the platform behind Next.js and supports the full feature set (SSR, ISR, image optimization, etc.).

1. Push your code to GitHub / GitLab / Bitbucket.
2. Go to <https://vercel.com/new> and import the repo.
3. Vercel auto-detects Next.js — defaults work.
4. **Important:** the repo currently has `output: 'export'` in [next.config.mjs](next.config.mjs). On Vercel this still works (deploys as a static site), but if you want SSR / API routes, remove the `output`, `basePath`, `assetPrefix`, and `trailingSlash` options.

---

## 6. Deployment option C — Any static host

Because `pnpm build` produces a static `out/` folder, you can host it anywhere.

### Netlify

- Build command: `pnpm build`
- Publish directory: `out`

### Cloudflare Pages

- Build command: `pnpm build`
- Output directory: `out`

### AWS S3 + CloudFront

```bash
pnpm build
aws s3 sync out/ s3://your-bucket --delete
```

Then point CloudFront at the bucket and configure `index.html` as the default root object.

### Self-hosted (Nginx, Caddy, etc.)

Copy `out/` to your web root and serve it as static files. Example Nginx snippet:

```nginx
server {
    listen 80;
    server_name flagwaver.example.com;
    root /var/www/flagwaver/out;
    index index.html;

    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }
}
```

> **Note:** when not deploying to GitHub Pages, set `NEXT_PUBLIC_BASE_PATH=""` (or just don't set it — it's only auto-populated in GitHub Actions) so assets resolve from `/`.

---

## 7. Troubleshooting

**Assets 404 on GitHub Pages**
The `basePath` doesn't match the repo name. Update the `repo` constant in [next.config.mjs](next.config.mjs) and rebuild.

**Blank page / broken styling on Pages, but works locally**
GitHub Pages was stripping `_next/` because Jekyll ran. The workflow adds `.nojekyll` automatically; if you deploy manually, make sure `out/.nojekyll` exists.

**Page works at `/repo/` but not `/repo` (no trailing slash)**
That's why `trailingSlash: true` is set — make sure you haven't removed it.

**Image upload doesn't persist**
That's expected — images are stored in `localStorage` per-browser.

**Build fails with TypeScript errors**
Type errors are ignored at build time (`ignoreBuildErrors: true`). If you still see a failure, it's a different issue — check the build log.
