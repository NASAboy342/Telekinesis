# Telekinesis

A minimalist desktop game: control a swarm of small black balls with your hand gestures, tracked through the laptop camera. White background, every object drawn as a black outline only.

## Prerequisites
- .NET 8 SDK
- Node.js 22+
- macOS or Windows (camera available)

## Run locally
<!-- run-test reads this section. One block per process; `ready` is the URL to poll. -->

| Process | Directory | Command | Port | Ready check |
|---|---|---|---|---|
| frontend | `Telekinesis/UserInterface` | `npm run dev` | 5173 | `http://localhost:5173` |
| backend  | `Telekinesis` | `dotnet run` | 8000 | `http://localhost:8000/api/health` |

First time: `npm install` in `Telekinesis/UserInterface`.
Start the frontend first, then the backend (`dotnet run` opens the native window pointed at the Vite dev server — Debug build).
Logs: `$TMPDIR/telekinesis-frontend.log`, `$TMPDIR/telekinesis-backend.log`

## Stop locally
Use the `stop-test` skill. Ports: 5173, 8000. Process match: `bin/Debug/net8.0/Telekinesis`. The window ignores SIGTERM — use `kill -9`.

## Tests
- Backend: `dotnet test`
- Frontend unit: `npm run test:unit` (in `Telekinesis/UserInterface`)
- Frontend e2e (needs the dev stack running): `npx playwright test`

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

## Notes
- npm 11.5.2 crashed on `npm install` (peer-set bug); `npx -y npm@latest install` worked.
- Camera spike works in the macOS Photino window (dev run, real webcam, GPU delegate). Not yet verified: Windows (WebView2), and a packaged `.app` (will need `NSCameraUsageDescription` in `Info.plist`) / Release build serving `.wasm` and `.task` files.
