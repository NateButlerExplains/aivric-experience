// Intro film overlay. Resolves when the visitor enters the building.
//
// The film is never fetched on page load: index.html ships the <video> with
// preload="none" and no poster attribute, so a deep link, ?skipintro=1, a mobile
// visit, or a same-session revisit costs zero bytes of media/film/aivric-fabric.mp4.
// Both the poster and preload="auto" are set here, immediately before play().

const intro = document.getElementById('intro');
const video = document.getElementById('intro-video');
const copy = intro.querySelector('.copy');
const soundBtn = document.getElementById('intro-sound');      // corner toggle, during playback
const soundCta = document.getElementById('intro-sound-cta');  // first-frame affordance, next to Skip
const soundBtns = [soundBtn, soundCta];

const POSTER = 'media/film/poster.jpg';
const SETTLE = 1500; // ms: the ease from last frame to finished state
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Clear anything the finished-state ease left behind, without animating.
function resetSettle() {
  video.style.transition = ''; video.style.opacity = '';
  copy.style.transition = ''; copy.style.transform = '';
}

export function runIntro() {
  return new Promise((resolve) => {
    const enter = document.getElementById('intro-enter');
    const skip = document.getElementById('intro-skip');
    let ended = false;

    resetSettle();               // a replay from the HUD reuses these nodes
    intro.hidden = false;
    intro.classList.remove('out');

    const labelSound = () => {
      const on = !video.muted;
      soundBtn.textContent = on ? 'Mute' : 'Unmute';
      soundCta.textContent = on ? 'Mute film' : (ended ? 'Replay with sound' : 'Play with sound');
      soundBtns.forEach((b) => b.setAttribute('aria-pressed', String(on)));
    };

    // Finished state: the frozen last frame recedes and the headline plus the
    // "Enter the building" button move up into the frame.
    const settle = (on) => {
      const dur = reduced() ? 1 : SETTLE;
      video.style.transition = `opacity ${dur}ms ${EASE}`;
      copy.style.transition = `transform ${dur}ms ${EASE}`;
      video.style.opacity = on ? '0.32' : '';
      copy.style.transform = on ? 'translateY(6vh)' : '';
    };

    // Start muted (browsers block autoplay with sound), poster and bytes on demand.
    // Flipping preload starts the fetch; calling load() here would abort that request and
    // restart it, so it is kept for the one case that needs it — an element left with no
    // source after a failed load. A replay just seeks back to 0 and reuses the buffer.
    video.muted = true;
    if (!video.poster) video.poster = POSTER;   // shows while the film buffers
    if (video.preload !== 'auto') video.preload = 'auto';
    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) video.load();
    try { video.currentTime = 0; } catch (_) { /* not seekable yet */ }
    labelSound();
    const p = video.play(); if (p && p.catch) p.catch(() => {});

    const finish = () => {
      intro.classList.add('out');
      video.pause();
      setTimeout(() => { intro.hidden = true; resetSettle(); }, 950);
      cleanup(); resolve();
    };
    const onEnded = () => {
      if (ended) return;
      ended = true;
      settle(true);
      labelSound();
      // Enter is the action now; only claim focus if nothing else holds it.
      if (!document.activeElement || document.activeElement === document.body) {
        enter.focus({ preventScroll: true });
      }
    };
    const onSound = () => {
      video.muted = !video.muted;
      // Unmuting after the end replays with sound. And a film that never started — Safari refuses
      // even muted autoplay in iPhone Low Power Mode, or when the site is set to never auto-play —
      // is still sitting on its poster: this click is a gesture, so it may start it, with sound.
      // Chromium never refuses muted autoplay, which is why this path went unexercised.
      if (!video.muted && (video.ended || video.paused)) {
        if (video.ended) {
          ended = false; settle(false);
          try { video.currentTime = 0; } catch (_) { /* ignore */ }
        }
        video.play().catch(() => {});
      }
      labelSound();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { finish(); return; }
      if (e.key !== 'Enter') return;
      if (soundBtns.indexOf(e.target) !== -1) return; // Enter on a sound button toggles sound
      finish();
    };

    enter.addEventListener('click', finish); skip.addEventListener('click', finish);
    soundBtns.forEach((b) => b.addEventListener('click', onSound));
    video.addEventListener('ended', onEnded);
    document.addEventListener('keydown', onKey);

    function cleanup() {
      enter.removeEventListener('click', finish); skip.removeEventListener('click', finish);
      soundBtns.forEach((b) => b.removeEventListener('click', onSound));
      video.removeEventListener('ended', onEnded);
      document.removeEventListener('keydown', onKey);
    }

    enter.focus();
  });
}
