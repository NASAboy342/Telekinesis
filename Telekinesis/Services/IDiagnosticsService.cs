using Telekinesis.Models;

namespace Telekinesis.Services;

public interface IDiagnosticsService
{
    /// <summary>Records a UI-side diagnostic line (camera / tracker status) to the host console.
    /// Throws ArgumentException when the message is empty.</summary>
    void Record(DiagnosticReport report);
}
