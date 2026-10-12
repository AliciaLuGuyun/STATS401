// All gesture thresholds live here. Distances are fractions of the mirrored image.
export const CONFIG = Object.freeze({
  runtimeURL: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs',
  wasmURL: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm',
  modelURL: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  detectionConfidence: 0.7, presenceConfidence: 0.7, trackingConfidence: 0.7,
  handednessConfidence: 0.7, smoothingAlpha: 0.45,
  swipeWindowMs: 550, swipeMinMs: 160, swipeDistance: 0.18,
  swipeMinFrames: 5, swipeDirectionRatio: 0.82, swipeVerticalLimit: 0.10,
  thumbHoldMs: 450, thumbReleaseMs: 200, pointHoldMs: 150, stationaryWindowMs: 220, stationaryRadius: 0.025,
  fingerAngle: 155, thumbAngle: 145, fingertipReachRatio: 1.12,
  pinchStartRatio: 0.25, pinchReleaseRatio: 0.42, pinchHoldMs: 180, pinchReleaseMs: 150,
  pinchMinFrames: 4, pinchCooldownMs: 650, cursorSmoothingAlpha: 0.35, nodeRadiusPx: 34,
  cooldownMs: 1100, neutralMs: 350, missingRearmMs: 600,
  maxFrameGapMs: 250, handJumpLimit: 0.20,
  minPalmWidth: 0.04, maxPalmWidth: 0.55,
  inferenceIntervalMs: 50, initializationTimeoutMs: 30000, inferenceTimeoutMs: 5000
});
