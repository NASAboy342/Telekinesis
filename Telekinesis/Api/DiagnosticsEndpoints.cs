using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Telekinesis.Helper;
using Telekinesis.Models;
using Telekinesis.Services;

namespace Telekinesis.Api;

public static class DiagnosticsEndpoints
{
    public static void MapDiagnosticsEndpoints(this WebApplication app, IDiagnosticsService service)
    {
        app.MapPost("/api/diagnostics", (HttpRequest request) => EndpointHelpers.Try(async () =>
        {
            var report = await JsonHelper.ReadBodyAsync<DiagnosticReport>(request) ?? throw new ArgumentException("Body is required.");
            service.Record(report);
            return JsonHelper.Ok(new { ok = true });
        }));
    }
}
