# Telekinesis

A minimalist desktop game: control a swarm of small black balls with your hands, tracked through the laptop camera — levitate them, make them circle, send them flying as a comet, clump them with a pinch, stop them with both palms. White background, every object drawn as a black outline only. No account, no network: the hand-tracking model runs locally.

## How to play
Allow the camera when asked, press **Play → Use camera**, and hold a hand up (about arm's length from the laptop; closer = stronger effect).

| Hand | What the swarm does |
|---|---|
| **Open palm** (also a fist with the *back* of the hand toward the camera) | Floats: gravity off, balls keep their speed and the air slowly stops them. **Wave** your hand to drift random balls the way it moves (closer = more). |
| **Fist** (palm side toward the camera) | Drops. |
| **Point** with the index finger | Streams the swarm the way the finger points, head first, stretching into a comet; the longer you hold it the faster it goes; **a closer hand is faster**. |
| **Two fingers** (index + middle) | Circles around its centre (the front ball if it is moving). |
| **Pinch** (thumb + index) | Pulls the balls together; they stay clumped when you let go. |
| **Both hands open** (hold ~0.3 s) | Stop: brakes to a standstill and keeps floating. |

### Avatar mode
Your hand can show up on the stage as a tiny character. Switch it on (and off again) by performing the **gesture code** — hold each pose for about half a second, all four within a few seconds: **fist → point → two fingers → open palm** — or press the person button in the top bar. Then:
- your hand is drawn as a small hand that **keeps the same size however close you hold it** and sits where your hand is on the screen (one hand at a time, smoothed so tracking jitter doesn't show);
- a **fist with the back of the hand toward the camera** (normally just an open palm) makes the balls **circle around your avatar hand, and the circle follows it** as you move;
- everything else works as in the table above.

No camera? Click the **mouse** button in the top bar: hold the mouse button = open palm · move the mouse = wave · **Shift** = two fingers · **arrow keys / WASD** = point · **Alt** = pinch · **Space** = both hands open · **wheel** = hand distance · **B** = fist with the back toward the camera (avatar mode) · release = fist. The person button switches avatar mode, and then the pointer is the avatar. The **Camera spike** page (Home) shows what the tracker sees, useful when a gesture is not recognised.

## Repo layout
```
Telekinesis.slnx
Telekinesis/                 the desktop host (.NET 8 + Photino) — Telekinesis/PROJECT_README.md
  UserInterface/             the game (Vue 3 + TypeScript + Tailwind) — UserInterface/PROJECT_README.md
Telekinesis.Test/            NUnit tests for the host
TelekinesisReadme.md         this file
```

## Prerequisites
- .NET 8 SDK
- Node.js 22.18+ (or 24.12+)
- macOS or Windows with a webcam

## Run locally
<!-- run-test reads this section. One block per process; `ready` is the URL to poll. -->

| Process | Directory | Command | Port | Ready check |
|---|---|---|---|---|
| frontend | `Telekinesis/UserInterface` | `npm run dev` | 5173 | `http://localhost:5173` |
| backend  | `Telekinesis` | `dotnet run` | 8000 | `http://localhost:8000/api/health` |

First time: `npm install` in `Telekinesis/UserInterface` (this also copies the MediaPipe WASM runtime into `public/mediapipe/wasm`). If `npm install` crashes with `Cannot read properties of null (reading 'edgesOut')` (npm 11.5.2), use `npx -y npm@latest install`.
Start the frontend first, then the backend: `dotnet run` opens the native window pointed at the Vite dev server (Debug build). macOS asks for camera access the first time.
Logs: `$TMPDIR/telekinesis-frontend.log`, `$TMPDIR/telekinesis-backend.log`. The UI prints its status (camera, model, pose / facing changes) to the backend console via `POST /api/diagnostics`.

## Stop locally
Use the `stop-test` skill. Ports: 5173, 8000. Process match: `bin/Debug/net8.0/Telekinesis`. The window ignores SIGTERM — use `kill -9`.

## Tests
- Backend: `dotnet test Telekinesis.slnx`
- Frontend unit: `npx vitest run` in `Telekinesis/UserInterface` (`npm run test:unit` starts watch mode)
- Frontend e2e (Chromium with a fake webcam; `npx playwright install chromium` once; needs `npm run dev` running): `npx playwright test`
- Lint / types: `npm run lint` · `npx vue-tsc --build`

## Build
```
cd Telekinesis/UserInterface && npm install && npm run build   # outputs to Telekinesis/wwwroot
cd .. && dotnet build -c Release
```

## Deploy
<!-- deploy reads this section. Filled in by setup-deploy. -->
TBD — run `setup-deploy`.

## Versioning
Single source of truth: `<Version>` in `Telekinesis/Telekinesis.csproj`.

## Known limitations
- Verified on macOS (Photino / WKWebView, real webcam, GPU delegate). **Not yet verified:** Windows (WebView2), a packaged macOS `.app` (needs `NSCameraUsageDescription` in its `Info.plist`), and a Release build serving the `.wasm` / `.task` model files.
- Balls are drawn very small (≈ 1.6 px radius, `VIEW_ZOOM` in `game/config.ts`); they look right on a 2× (retina) display and like dots on a 1× display.
- Avatar mode has been tested with synthetic hands and the mouse, **not yet on a real hand**; its smoothing strength (`AVATAR` in `UserInterface/src/helpers/avatar.ts`) and size (`handPx`) are easy to tune.
- Needs reasonable light; the tracker works best with the palm or fist clearly visible and the hand not edge-on.
