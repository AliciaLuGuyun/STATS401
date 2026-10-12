// Classic worker: MediaPipe's WASM loader may use importScripts().
// Camera ImageBitmaps are transferred here, processed, then closed immediately.
let landmarker;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const {HandLandmarker, FilesetResolver} = await import(data.config.runtimeURL);
      const files = await FilesetResolver.forVisionTasks(data.config.wasmURL);
      landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: data.config.modelURL, delegate: 'CPU'},
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: data.config.detectionConfidence,
        minHandPresenceConfidence: data.config.presenceConfidence,
        minTrackingConfidence: data.config.trackingConfidence
      });
      self.postMessage({type: 'ready'});
    } else if (data.type === 'frame') {
      try {
        const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({type: 'result', result, timestamp: data.timestamp});
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({type: 'error', message: error.message || String(error)}); }
};
