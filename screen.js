(() => {
  const root = document.documentElement;
  const button = document.querySelector('#fullscreen');
  const editWord = document.querySelector('#edit-word');
  const word = document.querySelector('#word');
  const displayMode = matchMedia('(display-mode: fullscreen)');

  let expandedInPage = false;

  function fitWord() {
    if (!editWord.clientHeight) return;
    // Measure the rendered text so mixed scripts and punctuation fit on one line.
    const text = document.createRange();
    text.selectNodeContents(word);
    let low = 1;
    let high = Math.ceil(editWord.clientHeight);
    while (low < high) {
      const size = Math.ceil((low + high) / 2);
      word.style.setProperty('--stage-word-size', size + 'px');
      const bounds = text.getBoundingClientRect();
      if (bounds.height <= editWord.clientHeight && bounds.width <= word.clientWidth) low = size;
      else high = size - 1;
    }
    word.style.setProperty('--stage-word-size', low + 'px');
  }

  function syncFullscreen() {
    root.classList.toggle('fullscreen-layout', expandedInPage || Boolean(document.fullscreenElement) || displayMode.matches);
    button.querySelector('span').textContent = expandedInPage || document.fullscreenElement ? '退出全屏' : '全屏';
    fitWord();
  }

  new ResizeObserver(fitWord).observe(editWord);
  new MutationObserver(fitWord).observe(word, { childList: true, characterData: true, subtree: true });
  document.addEventListener('fullscreenchange', syncFullscreen);
  displayMode.addEventListener('change', syncFullscreen);
  syncFullscreen();

  document.addEventListener('keydown', event => {
    if (expandedInPage && event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      expandedInPage = false;
      syncFullscreen();
    }
  });
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (expandedInPage) {
      expandedInPage = false;
      syncFullscreen();
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      // Embedded browsers may decline native fullscreen. Expand within the tab instead.
      expandedInPage = true;
      syncFullscreen();
    }
  });
})();
