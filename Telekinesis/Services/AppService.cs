using System.Reflection;
using Telekinesis.Models;

namespace Telekinesis.Services;

public class AppService : IAppService
{
    public AppVersionInfo GetVersion()
    {
        var version = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
        return new AppVersionInfo("Telekinesis", version);
    }
}
