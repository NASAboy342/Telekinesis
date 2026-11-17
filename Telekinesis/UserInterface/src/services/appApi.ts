import { requestJson } from './httpClient'

export interface AppVersionInfo {
  name: string
  version: string
}

/** Mirrors Api/AppEndpoints.cs */
export const appApi = {
  getVersion: () => requestJson<AppVersionInfo>('/api/app/version'),
}
