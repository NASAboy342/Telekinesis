using Microsoft.AspNetCore.Builder;

using Telekinesis.Helper;
using Telekinesis.Services;

namespace Telekinesis.Api;

public static class AppEndpoints
{
    public static void MapAppEndpoints(this WebApplication app, IAppService service)
    {
        app.MapGet("/api/health", () => JsonHelper.Ok(new { status = "ok" }));
        app.MapGet("/api/app/version", () => EndpointHelpers.Try(() => Task.FromResult(JsonHelper.Ok(service.GetVersion()))));
    }
}
