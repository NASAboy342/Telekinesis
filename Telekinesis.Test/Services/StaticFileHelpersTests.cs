using NUnit.Framework;
using Telekinesis.Helper;

namespace Telekinesis.Test.Services;

public class StaticFileHelpersTests
{
    [TestCase("hand_landmarker.task", "application/octet-stream")]
    [TestCase("vision_wasm_internal.wasm", "application/wasm")]
    [TestCase("index.html", "text/html")]
    [TestCase("favicon.svg", "image/svg+xml")]
    public void Known_types_are_served(string file, string expected)
    {
        Assert.That(StaticFileHelpers.ContentTypes().TryGetContentType(file, out var type), Is.True);
        Assert.That(type, Is.EqualTo(expected));
    }

    [Test]
    public void Unknown_types_are_still_not_guessed()
    {
        Assert.That(StaticFileHelpers.ContentTypes().TryGetContentType("x.unknownext", out _), Is.False);
    }
}
