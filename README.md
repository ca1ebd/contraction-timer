# Contraction Timer

Offline-first PWA for timing labor contractions. One primary button (start/stop),
a timeline of past contractions sized by duration and spaced by interval, and
coarse-stepper editors for fixing a contraction's length or the gap between two.

Built for one person, in labor, on a phone, possibly on bad hospital wifi. Everything
is device-local: no backend, no analytics, no network requests at runtime.

## Stack

- Vite + React + TypeScript
- Tailwind v4 (`@tailwindcss/vite`)
- `vite-plugin-pwa` (`registerType: 'autoUpdate'`, full precache)
- localStorage persistence, Screen Wake Lock while a contraction is running

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build   # tsc -b && vite build, output in dist/
npm run preview # serve the production build locally
```

## Deploy

Hosted on Azure Static Web Apps via the GitHub Actions workflow in
`.github/workflows/azure-static-web-apps.yml` (build command `npm run build`,
output location `dist`). Requires an `AZURE_STATIC_WEB_APPS_API_TOKEN` repo
secret from the Azure Static Web App resource.
