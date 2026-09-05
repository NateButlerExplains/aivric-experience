// Intro film overlay. Resolves when the visitor enters the building.
const intro = document.getElementById('intro');
const video = document.getElementById('intro-video');
const soundBtn = document.getElementById('intro-sound');

export function runIntro() {
  return new Promise((resolve) => {
    intro.hidden = false;
    intro.classList.remove('out');
    video.muted = true; soundBtn.textContent = 'Unmute'; soundBtn.setAttribute('aria-pressed', 'false');
    video.currentTime = 0;
    const p = video.play(); if (p && p.catch) p.catch(() => {});

    const finish = () => {
      intro.classList.add('out');
      video.pause();
      setTimeout(() => { intro.hidden = true; }, 950);
      cleanup(); resolve();
    };
    const onSound = () => {
      video.muted = !video.muted;
      soundBtn.textContent = video.muted ? 'Unmute' : 'Mute';
      soundBtn.setAttribute('aria-pressed', String(!video.muted));
      if (!video.muted && video.ended) { video.currentTime = 0; video.play().catch(() => {}); }
    };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') finish(); };
    const enter = document.getElementById('intro-enter'), skip = document.getElementById('intro-skip');
    enter.addEventListener('click', finish); skip.addEventListener('click', finish);
    soundBtn.addEventListener('click', onSound); document.addEventListener('keydown', onKey);
    function cleanup() {
      enter.removeEventListener('click', finish); skip.removeEventListener('click', finish);
      soundBtn.removeEventListener('click', onSound); document.removeEventListener('keydown', onKey);
    }
    enter.focus();
  });
}
