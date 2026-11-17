import { requestJson } from './httpClient'

/** Mirrors Api/DiagnosticsEndpoints.cs — sends a UI status line to the host console. Never throws. */
export async function reportDiagnostic(source: string, message: string): Promise<void> {
  try {
    await requestJson('/api/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ source, message }),
    })
  } catch {
    /* diagnostics must never break the app */
  }
}
