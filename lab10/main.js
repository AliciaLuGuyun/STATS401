import { connectTimeline } from './timeline.js';
import { NetworkExplorer } from './exploration.js';
import { CameraController } from './camera.js';
export let app = null;
function connect() {
  if (!window.d3) {
    document.querySelector('#data-status').textContent = 'D3 could not load. Check the local dependency path.';
    return true;
  }
  const timeline = connectTimeline(window.d3);
  if (!timeline) return false;
  const explorer = new NetworkExplorer(window.d3, timeline);
  const camera = new CameraController(timeline, document, {}, explorer);
  app = {timeline, camera, explorer};
  window.addEventListener('pagehide', () => { timeline.pause(); camera.stop(); });
  return true;
}
// Lab 7 loads its CSVs asynchronously and registers its handlers after rendering.
if (!connect()) {
  const observer = new MutationObserver(() => { if (connect()) observer.disconnect(); });
  observer.observe(document.querySelector('#current-date'), {childList: true});
}
