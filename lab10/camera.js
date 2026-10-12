import { CONFIG } from './config.js';
import { GestureDetector } from './gestures.js';
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const friendlyError = error => ({
  NotAllowedError: 'Camera permission denied. Allow camera access in browser settings and try again.',
  NotFoundError: 'No camera is available. Connect a camera and try again.',
  NotReadableError: 'Camera is unavailable or in use by another application.',
  OverconstrainedError: 'This camera cannot provide a compatible video stream.',
  SecurityError: 'Camera access is blocked. Use localhost or HTTPS.'
}[error.name] || `Camera/hand tracking could not start: ${error.message || error}. Check network access and browser compatibility.`);
export class CameraController {
  constructor(timeline, root = document, config = {}, explorer = null) {
    this.explorer = explorer; this.timeline = timeline; this.root = root; this.config = {...CONFIG, ...config};
    this.detector = new GestureDetector(this.config);
    this.video = root.querySelector('#camera'); this.canvas = root.querySelector('#landmarks');
    this.context = this.canvas.getContext('2d'); this.generation = 0; this.active = false;
    this.raf = null; this.worker = null; this.stream = null; this.timeout = null; this.busy = false;
    this.startButton = root.querySelector('#start-camera'); this.stopButton = root.querySelector('#stop-camera');
    this.startButton.disabled = false;
    this.startButton.addEventListener('click', () => this.start());
    this.stopButton.addEventListener('click', () => this.stop());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.active) this.stop('Camera stopped while tab is hidden. Start Camera to resume.');
    });
    window.addEventListener('pagehide', () => this.stop());
  }
  set(id, text) { this.root.querySelector(`#${id}`).textContent = text; }
  stop(message = 'Camera off. All camera tracks and hand tracking have stopped.') {
    this.active = false; this.generation++;
    cancelAnimationFrame(this.raf); this.raf = null;
    clearTimeout(this.timeout); this.timeout = null;
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    this.busy = false; this.detector.reset();
    this.context.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.root.querySelector('#preview-placeholder').hidden = false;
    this.startButton.disabled = false; this.stopButton.disabled = true;
    this.explorer?.clearCursor(); this.set('gesture-stability', 'Inactive');
    this.set('camera-status', message); this.set('tracking-status', 'Inactive'); this.set('gesture-status', 'None');
  }
  async start() {
    if (this.active) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.stop('Camera access needs a supported browser on localhost or HTTPS. Use the timeline controls.'); return;
    }
    if (!window.Worker || !window.createImageBitmap) {
      this.stop('This browser lacks the required worker/video support. Try current Chrome or Edge. Timeline controls remain available.'); return;
    }
    this.active = true; const generation = ++this.generation;
    const current = () => this.active && generation === this.generation;
    this.startButton.disabled = true; this.stopButton.disabled = false;
    this.set('camera-status', 'Requesting camera permission…');
    let stage = 'camera';
    try {
      // This is the only getUserMedia call, reachable from the Start Camera click.
      const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {width: {ideal: 640}, height: {ideal: 480}, facingMode: 'user'}});
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (current()) this.stop('Camera disconnected or permission was revoked.');
      });
      this.video.srcObject = stream;
      this.timeout = setTimeout(() => { if (current()) this.stop('Camera preview timed out. Try another camera or browser.'); }, this.config.initializationTimeoutMs);
      await this.video.play();
      if (!current()) return;
      clearTimeout(this.timeout);
      this.root.querySelector('#preview-placeholder').hidden = true;
      this.canvas.width = this.video.videoWidth || 640; this.canvas.height = this.video.videoHeight || 480;
      stage = 'model'; this.set('camera-status', 'Loading MediaPipe hand model…');
      this.set('tracking-status', 'Initializing');
      const worker = new Worker(new URL('./hand-worker.js', import.meta.url)); this.worker = worker;
      this.timeout = setTimeout(() => { if (current()) this.stop('MediaPipe initialization timed out. Check the CDN/model connection. Timeline controls remain available.'); }, this.config.initializationTimeoutMs);
      worker.onerror = () => { if (current()) this.stop('MediaPipe worker could not load. Check network access and browser support. Timeline controls remain available.'); };
      worker.onmessage = ({data}) => {
        if (!current()) return;
        clearTimeout(this.timeout);
        if (data.type === 'error') { this.stop(`MediaPipe error: ${data.message}. Timeline controls remain available.`); return; }
        if (data.type === 'ready') {
          this.set('camera-status', 'Camera on — processing locally.'); this.set('tracking-status', 'Looking for one hand');
          this.lastInference = -Infinity; this.lastVideoTime = -1; this.busy = false;
          this.raf = requestAnimationFrame(time => this.frame(time, generation));
        } else if (data.type === 'result') {
          this.busy = false; this.draw(data.result.landmarks);
          // Never execute delayed results following a long inference stall.
          if (performance.now()-data.timestamp > this.config.maxFrameGapMs) {
            this.detector.clearMotion(); this.explorer?.clearCursor(); this.set('gesture-status', 'Tracking delayed'); this.set('gesture-stability', 'Unstable'); this.set('tracking-status', 'Slow inference — reposition hand'); return;
          }
          this.processResult(data.result, data.timestamp);
        }
      };
      worker.postMessage({type: 'init', config: this.config});
    } catch (error) {
      if (current()) this.stop(stage === 'model' ? `MediaPipe initialization failed: ${error.message}. Timeline controls remain available.` : friendlyError(error));
    }
  }
  processResult(result, timestamp) {
    const detection = this.detector.update(result, timestamp);
    this.set('tracking-status', result.landmarks.length === 1 ? 'One hand tracked' : result.landmarks.length ? 'Multiple hands: commands suspended' : 'No hand');
    this.set('gesture-status', detection.label);
    this.set('gesture-stability', detection.stable ? 'Stable' : 'Acquiring / uncertain');
    this.explorer?.handle(detection);
    if (detection.action && detection.action !== 'Pinch') {
      const action = this.timeline.execute(detection.action);
      if (action) this.set('action-status', `${action} · ${new Date().toLocaleTimeString()}`);
    }
    return detection;
  }
  async frame(time, generation) {
    if (!this.active || generation !== this.generation) return;
    this.raf = requestAnimationFrame(next => this.frame(next, generation));
    if (this.busy || time-this.lastInference < this.config.inferenceIntervalMs || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.busy = true; this.lastInference = time; this.lastVideoTime = this.video.currentTime;
    try {
      const bitmap = await createImageBitmap(this.video);
      if (!this.active || generation !== this.generation) { bitmap.close(); return; }
      this.timeout = setTimeout(() => {
        if (this.active && generation === this.generation) this.stop('Hand tracking stopped responding. Restart the camera or use timeline controls.');
      }, this.config.inferenceTimeoutMs);
      this.worker.postMessage({type: 'frame', bitmap, timestamp: time}, [bitmap]);
    } catch (error) {
      if (this.active && generation === this.generation) this.stop(`Video frame processing failed: ${error.message}. Timeline controls remain available.`);
    }
  }
  draw(hands = []) {
    const ctx = this.context, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0,0,w,h); ctx.strokeStyle = '#59e391'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3;
    for (const points of hands) {
      for (const [a,b] of CONNECTIONS) { ctx.beginPath(); ctx.moveTo(points[a].x*w,points[a].y*h); ctx.lineTo(points[b].x*w,points[b].y*h); ctx.stroke(); }
      for (const point of points) { ctx.beginPath(); ctx.arc(point.x*w, point.y*h,4,0,2*Math.PI); ctx.fill(); }
    }
  }
}
