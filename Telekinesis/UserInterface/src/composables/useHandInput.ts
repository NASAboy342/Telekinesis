import { onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  createHandTracker,
  openCamera,
  type HandTracker,
  type NormalizedLandmark,
} from '@/helpers/handTracker'
import { GestureTracker, type HandSignals } from '@/helpers/gestures'
import { reportDiagnostic } from '@/services/diagnosticsApi'

export type InputPhase = 'idle' | 'starting' | 'running' | 'error'

/**
 * Webcam → MediaPipe → smoothed gesture signals. One loop shared by the game and the camera spike page.
 * Call inside a component's setup (it stops itself on unmount).
 */
export function useHandInput(source = 'input') {
  const phase = ref<InputPhase>('idle')
  const error = ref('')
  const delegate = ref('')
  const fps = ref(0)
  /** camera frame width / height (needed to undo the non-square normalized coordinates) */
  const aspect = ref(4 / 3)
  const signals = shallowRef<HandSignals[]>([])
  /** Raw landmarks of the last detection (mirror x yourself when drawing). */
  const landmarks = shallowRef<NormalizedLandmark[][]>([])

  const gestures = new GestureTracker()
  const lastPose = new Map<string, string>()
  const lastFacing = new Map<string, string>()
  let tracker: HandTracker | null = null
  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let raf = 0
  let lastVideoTime = -1
  let frames = 0
  let fpsStamp = performance.now()

  const say = (message: string) => void reportDiagnostic(source, message)

  async function start() {
    if (phase.value === 'starting' || phase.value === 'running') return
    phase.value = 'starting'
    error.value = ''
    try {
      say('opening camera')
      stream = await openCamera()
      say(`camera ok (${stream.getVideoTracks()[0]?.label ?? 'unnamed'})`)
      // Off-screen but attached (WebKit may not decode a detached / display:none video).
      video = document.createElement('video')
      video.playsInline = true
      video.muted = true
      video.setAttribute(
        'style',
        'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none',
      )
      document.body.appendChild(video)
      video.srcObject = stream
      await video.play()
      tracker = await createHandTracker()
      delegate.value = tracker.delegate
      say(`model ready (${tracker.delegate})`)
      phase.value = 'running'
      loop()
    } catch (e) {
      error.value = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      phase.value = 'error'
      say(`ERROR ${error.value}`)
      teardown()
    }
  }

  function teardown() {
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    tracker?.landmarker.close()
    tracker = null
    video?.remove()
    video = null
    signals.value = []
    landmarks.value = []
  }

  function stop() {
    const wasActive = phase.value === 'running' || phase.value === 'starting'
    teardown()
    if (wasActive) phase.value = 'idle'
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    if (!video || !tracker || video.readyState < 2 || video.currentTime === lastVideoTime) return
    lastVideoTime = video.currentTime
    const result = tracker.landmarker.detectForVideo(video, performance.now())
    landmarks.value = result.landmarks
    const frameAspect = video.videoWidth / Math.max(video.videoHeight, 1)
    if (frameAspect !== aspect.value) aspect.value = frameAspect
    const labels = result.handedness.map((h) => h[0]?.categoryName ?? '')
    signals.value = gestures.update(result.landmarks, labels, frameAspect, performance.now() / 1000)
    for (const h of signals.value) {
      if (lastPose.get(h.side) !== h.pose) {
        lastPose.set(h.side, h.pose)
        say(`${h.side} hand: ${h.pose}`)
      }
      if (lastFacing.get(h.side) !== h.facing.state) {
        lastFacing.set(h.side, h.facing.state)
        say(
          `${h.side} hand facing: ${h.facing.state} (score ${h.facing.score.toFixed(2)}, winding ${h.facing.winding.toFixed(2)}, depth ${h.facing.depth.toFixed(2)}, pose ${h.pose})`,
        )
      }
    }
    frames++
    const now = performance.now()
    if (now - fpsStamp >= 1000) {
      fps.value = Math.round((frames * 1000) / (now - fpsStamp))
      frames = 0
      fpsStamp = now
    }
  }

  onBeforeUnmount(stop)

  return { phase, error, delegate, fps, aspect, signals, landmarks, start, stop }
}
