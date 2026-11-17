using Telekinesis.Models;

namespace Telekinesis.Services;

public class DiagnosticsService : IDiagnosticsService
{
    public void Record(DiagnosticReport report)
    {
        if (string.IsNullOrWhiteSpace(report.Message)) throw new ArgumentException("Message is required.");
        Console.WriteLine($"[ui:{report.Source}] {report.Message}");
    }
}
