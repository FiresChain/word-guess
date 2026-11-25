(() => {
  const root = document.documentElement;
  const button = document.querySelector('#fullscreen');
  const editWord = document.querySelector('#edit-word');
  const word = document.querySelector('#word');
  const displayMode = matchMedia('(display-mode: fullscreen)');

  function fitWord() {
    if (!root.classList.contains('fullscreen-layout') || !editWord.clientHeight) return;
    // Measure the rendered text so mixed scripts, punctuation and wrapped lines all fit.
    let low = 1;
    let high = Math.ceil(editWord.clientHeight);
    while (low < high) {
      const size = Math.ceil((low + high) / 2);
      word.style.setProperty('--stage-word-size', size + 'px');
      if (word.offsetHeight <= editWord.clientHeight && word.scrollWidth <= word.clientWidth) low = size;
      else high = size - 1;
    }
    word.style.setProperty('--stage-word-size', low + 'px');
  }

  function syncFullscreen() {
    root.classList.toggle('fullscreen-layout', Boolean(document.fullscreenElement) || displayMode.matches);
    button.querySelector('span').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    fitWord();
  }

  new ResizeObserver(fitWord).observe(editWord);
  new MutationObserver(fitWord).observe(word, { childList: true, characterData: true, subtree: true });
  document.addEventListener('fullscreenchange', syncFullscreen);
  displayMode.addEventListener('change', syncFullscreen);
  syncFullscreen();

  if (!document.fullscreenEnabled) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      button.hidden = true;
    }
  });
})();
