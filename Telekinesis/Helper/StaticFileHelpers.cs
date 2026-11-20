using Microsoft.AspNetCore.StaticFiles;

namespace Telekinesis.Helper;

public static class StaticFileHelpers
{
    /// <summary>
    /// The built-in static file server answers 404 for file types it has no MIME mapping for. The hand model
    /// (<c>mediapipe/models/hand_landmarker.task</c>) is one of them, so a packaged app would never find it.
    /// </summary>
    public static FileExtensionContentTypeProvider ContentTypes()
    {
        var provider = new FileExtensionContentTypeProvider();
        provider.Mappings[".task"] = "application/octet-stream";
        return provider;
    }
}
