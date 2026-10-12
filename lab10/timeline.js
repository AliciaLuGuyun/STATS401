// The original Lab 7 callbacks own the only day/timer state; no rendering is forked.
export function connectTimeline(d3, root = document) {
  const slider = root.querySelector('#day-slider');
  const original = Object.fromEntries(['play', 'pause', 'reset'].map(id => [id, d3.select(root.querySelector(`#${id}`)).on('click')]));
  const input = d3.select(slider).on('input');
  if (!input || Object.values(original).some(fn => typeof fn !== 'function')) return null;
  let playing = false;
  function sync() {
    root.querySelector('#playback-status').textContent = playing ? 'Playing' : 'Paused';
    root.querySelector('#play').disabled = playing;
    root.querySelector('#pause').disabled = !playing;
    root.querySelector('#previous').disabled = +slider.value <= +slider.min;
    root.querySelector('#next').disabled = +slider.value >= +slider.max;
  }
  function play() { original.play(); playing = true; sync(); }
  function pause() { original.pause(); playing = false; sync(); }
  function reset() { original.reset(); playing = false; sync(); }
  function navigate(day) {
    pause();
    slider.value = Math.max(+slider.min, Math.min(+slider.max, day));
    input.call(slider); // Calls Lab 7's showDay() inside its existing closure.
    sync();
  }
  for (const [id, handler] of Object.entries({play, pause, reset})) d3.select(root.querySelector(`#${id}`)).on('click', handler);
  d3.select(slider).on('input', function(event) { input.call(this, event); playing = false; sync(); });
  root.querySelector('#previous').addEventListener('click', () => navigate(+slider.value - 1));
  root.querySelector('#next').addEventListener('click', () => navigate(+slider.value + 1));
  new MutationObserver(sync).observe(root.querySelector('#current-date'), {childList: true});
  root.querySelectorAll('.temporal-controls button, #day-slider').forEach(el => { el.disabled = false; });
  sync();
  return {
    getState: () => ({day: +slider.value, playing}), pause,
    execute(gesture) {
      const before = +slider.value;
      if (gesture === 'Thumbs_Up') { playing ? pause() : play(); return playing ? 'Resumed animation' : 'Paused animation'; }
      if (gesture !== 'Swipe_Right' && gesture !== 'Swipe_Left') return null;
      navigate(before + (gesture === 'Swipe_Right' ? 1 : -1));
      return before === +slider.value ? `Day ${before}: timeline boundary (paused)` : `${gesture === 'Swipe_Right' ? 'Next' : 'Previous'} day → Day ${slider.value} (paused)`;
    }
  };
}
