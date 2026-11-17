# Telekinesis — backend (desktop host)

.NET 8 + Photino. Hosts the native window and a small local API for the UI.

## Structure
`Api/` endpoint maps · `Models/` · `Services/` (interface + implementation) · `Repositories/` (none yet — storage method not chosen) · `Enum/` (namespace `Telekinesis.Enums`) · `Helper/` (`JsonHelper`, `EndpointHelpers`) · `AppIcon/` placeholder icons · `Resources/wwwroot` keeps the embedded manifest non-empty · `wwwroot/` built UI.

## Conventions
DI everywhere (separate `ServiceCollection` in `Program.cs`, because the static server's container is sealed); JSON via Newtonsoft through `JsonHelper`; errors through `EndpointHelpers.Try`. Debug loads Vite (5173); Release loads the built `wwwroot`.

## Feature log
- 0.1.0 — skeleton: `GET /api/health`, `GET /api/app/version`.
- 0.1.0 — `POST /api/diagnostics`: UI status lines printed to the host console (lets the UI be debugged inside the native window).
