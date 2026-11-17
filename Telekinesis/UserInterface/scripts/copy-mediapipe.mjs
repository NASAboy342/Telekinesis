// Copies the MediaPipe WASM runtime from node_modules into public/ so the desktop app works offline.
// Runs on `npm install` (postinstall). The model file (public/mediapipe/models) is committed.
import { cpSync, mkdirSync, existsSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe/wasm'
if (!existsSync(from)) process.exit(0)
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('MediaPipe WASM copied to', to)
