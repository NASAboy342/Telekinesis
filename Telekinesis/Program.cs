using System.Drawing;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Photino.NET;
using Photino.NET.Server;
using Telekinesis.Api;
using Telekinesis.Helper;
using Telekinesis.Services;

namespace Telekinesis;

class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        // Packaged apps aren't launched from their own folder; the static server resolves wwwroot from the cwd.
        Directory.SetCurrentDirectory(AppContext.BaseDirectory);

        var app = PhotinoServer.CreateStaticFileServer(args, out string baseUrl);

        // The static server's container is already built (sealed): use a separate one for app services.
        var services = new ServiceCollection();
        services.AddSingleton<IAppService, AppService>();
        services.AddSingleton<IDiagnosticsService, DiagnosticsService>();
        using var serviceProvider = services.BuildServiceProvider();

        // Second static-file pass for what the first one answers 404 to (the .task hand model): see StaticFileHelpers.
        app.UseStaticFiles(
            new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(Path.Combine(AppContext.BaseDirectory, "wwwroot")),
                ContentTypeProvider = StaticFileHelpers.ContentTypes(),
            }
        );

        app.MapAppEndpoints(serviceProvider.GetRequiredService<IAppService>());
        app.MapDiagnosticsEndpoints(serviceProvider.GetRequiredService<IDiagnosticsService>());

#if DEBUG
        // Vite dev server (hot reload). Its /api proxy points at the Kestrel port below.
        string appUrl = "http://localhost:5173";
#else
        // Cache-buster: the WebView HTTP cache survives restarts and would serve a stale index.html.
        string appUrl = $"{baseUrl}/index.html?v={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
#endif

        var window = new PhotinoWindow()
            .SetTitle("Telekinesis")
            .SetIconFile(Path.Combine(AppContext.BaseDirectory, "AppIcon", "app.ico"))
            .SetSize(new Size(1100, 760))
            .Center()
            .SetResizable(true);

        app.RunAsync();
        window.Load(appUrl);
        window.WaitForClose();
    }
}
