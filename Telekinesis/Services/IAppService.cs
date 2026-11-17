using Telekinesis.Models;

namespace Telekinesis.Services;

public interface IAppService
{
    /// <summary>Returns the app name and its informational version.</summary>
    AppVersionInfo GetVersion();
}
