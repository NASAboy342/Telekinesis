import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

export type { NormalizedLandmark } from '@mediapipe/tasks-vision'
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS

const WASM_DIR = '/mediapipe/wasm'
const MODEL = '/mediapipe/models/hand_landmarker.task'

export interface HandTracker {
  landmarker: HandLandmarker
  delegate: 'GPU' | 'CPU'
}

/** Loads the bundled (offline) MediaPipe hand model; tries the GPU delegate first, then falls back to CPU. */
export async function createHandTracker(): Promise<HandTracker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_DIR)
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    })
  try {
    return { landmarker: await make('GPU'), delegate: 'GPU' }
  } catch {
    return { landmarker: await make('CPU'), delegate: 'CPU' }
  }
}

/** Opens the default webcam. Throws a readable Error when denied / missing. */
export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Camera API not available in this WebView')
  return navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  })
}
