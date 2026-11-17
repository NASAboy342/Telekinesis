using NUnit.Framework;
using Telekinesis.Services;

namespace Telekinesis.Test.Services;

public class AppServiceTests
{
    [Test]
    public void GetVersion_ReturnsAppNameAndNonEmptyVersion()
    {
        IAppService service = new AppService();

        var info = service.GetVersion();

        Assert.That(info.Name, Is.EqualTo("Telekinesis"));
        Assert.That(info.Version, Is.Not.Empty);
    }
}
