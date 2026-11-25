(() => {
  const button = document.querySelector('#fullscreen');
  if (!document.fullscreenEnabled) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      button.hidden = true;
    }
  });
  document.addEventListener('fullscreenchange', () => {
    button.querySelector('span').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  });
})();
