# Telekinesis — backend (desktop host)

.NET 8 + [Photino](https://www.tryphotino.io/). It opens the native window and serves a tiny local API for the UI. The game itself runs in the frontend (`UserInterface/`); the backend holds no game logic and persists nothing.

## Stack
.NET 8 · Photino.NET 3.2 + Photino.NET.Server 3.0 (static file server + window) · Newtonsoft.Json · Microsoft.Extensions.DependencyInjection · NUnit + NSubstitute (`../Telekinesis.Test`).

## Structure
```
Program.cs                 composition root: static server, its own ServiceCollection, window
Api/                       Map<Feature>Endpoints(this WebApplication app, I<Feature>Service service)
  AppEndpoints.cs          GET /api/health · GET /api/app/version
  DiagnosticsEndpoints.cs  POST /api/diagnostics
Services/                  IAppService / AppService · IDiagnosticsService / DiagnosticsService
Models/                    AppVersionInfo · DiagnosticReport
Repositories/              (empty — no storage chosen yet)
Enum/                      (empty; namespace would be Telekinesis.Enums)
Helper/                    JsonHelper (Newtonsoft, camelCase) · EndpointHelpers.Try (error mapping)
AppIcon/                   app.ico / app.icns / icon-512.png (the game logo: ball heap, four lifted)
Resources/wwwroot/         one placeholder file so the embedded manifest is generated
wwwroot/                   the built UI (written by `npm run build` in UserInterface/, gitignored)
UserInterface/             the Vue frontend (own PROJECT_README.md)
```

## API
| Route | Request | Response |
|---|---|---|
| `GET /api/health` | – | `{ "status": "ok" }` |
| `GET /api/app/version` | – | `{ "name": "Telekinesis", "version": "<informational version>" }` |
| `POST /api/diagnostics` | `{ "source": string, "message": string }` | `{ "ok": true }`; 400 if the message is empty. Prints `[ui:<source>] <message>` to the host console — the only way to read what the WebView is doing from a terminal. |

## Conventions
- **DI always**: the static server's container is already built (sealed), so `Program.cs` builds a **separate** `ServiceCollection` for app services and passes resolved services to each `Map…Endpoints`. Endpoints never name concrete types.
- **JSON is Newtonsoft only**, via `Helper/JsonHelper` (camelCase, nulls ignored); never `System.Text.Json` / `Results.Json`.
- **Errors**: bodies run through `EndpointHelpers.Try` — `ArgumentException` → 400, `InvalidOperationException` → 409, anything else → 500 (logged).
- `Directory.SetCurrentDirectory(AppContext.BaseDirectory)` first, so a packaged app finds `wwwroot` / `AppIcon`.
- **Debug** loads the Vite dev server (`http://localhost:5173`, which proxies `/api` to Kestrel on 8000); **Release** loads `index.html?v=<unix time>` from the embedded static server (the cache-buster stops the WebView serving a stale page).
- `OutputType` is `Exe` (not `WinExe`) so dev runs show logs. Version: `<Version>` in `Telekinesis.csproj`.
- If a feature needs to persist data, ask which storage (JSON file vs SQLite) before adding a repository — see the Foundation `backend-enhance` skill.

## Testing
`dotnet test` (from the repo root) — `Telekinesis.Test/Services/AppServiceTests.cs`.

## Feature log
- **Host + window** (`Program.cs`): Photino window (1100 × 760), Vite in Debug / embedded static files in Release. *Fully wired.*
- **App info**: `GET /api/health`, `GET /api/app/version`. *Fully wired, tested (version).*
- **Diagnostics**: `POST /api/diagnostics` — UI status lines (camera, model, pose / facing changes) printed to the host console. *Fully wired, no automated test yet.*
- Nothing stubbed. Not yet verified: running on Windows (WebView2) and a packaged macOS `.app` (camera access needs `NSCameraUsageDescription` in its `Info.plist`).
