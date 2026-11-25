(() => {
  'use strict';

  const storageKey = 'word-guess.rounds.v1';
  const resultLabels = { win: '猜中', loss: '未猜出', timeout: '没猜出来' };
  const defaultDuration = 100;
  const toggleClock = document.querySelector('#toggle-clock');
  const editWord = document.querySelector('#edit-word');
  const keywordDialog = document.querySelector('#keyword-dialog');
  const keywordForm = document.querySelector('#keyword-form');
  const keyword = document.querySelector('#keyword');
  const cancelKeyword = document.querySelector('#cancel-keyword');
  const settings = document.querySelector('#settings');
  const settingsDialog = document.querySelector('#settings-dialog');
  const settingsForm = document.querySelector('#settings-form');
  const duration = document.querySelector('#duration');
  const cancelSettings = document.querySelector('#cancel-settings');
  const word = document.querySelector('#word');
  const clock = document.querySelector('#clock');
  const roundState = document.querySelector('#round-state');
  const progress = document.querySelector('#progress');
  const historyList = document.querySelector('#history-list');
  const historyEmpty = document.querySelector('#history-empty');
  const historyCount = document.querySelector('#history-count');

  const { history, active, preference } = loadRounds();
  let activeRound = active;
  let finishedRound = active || preference.showResult === false ? null : (history[0] ?? null);
  let confirmedWord = active?.word ?? preference.word ?? history[0]?.word ?? keyword.defaultValue.trim();
  let preferredDuration = preference.duration ?? defaultDuration;
  let frame;
  let deadlineTimer;

  function isKeyword(value) {
    return typeof value === 'string' && value.length <= 40 && value.trim().length > 0;
  }

  function isDuration(seconds) {
    return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600;
  }

  function isRound(round) {
    return round
      && Number.isSafeInteger(round.number)
      && round.number > 0
      && isKeyword(round.word)
      && typeof round.limitMs === 'number'
      && isDuration(round.limitMs / 1000);
  }

  function loadRounds() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      const seen = new Set();
      const history = (Array.isArray(saved?.history) ? saved.history : [])
        .filter(round => {
          if (!isRound(round)
            || !Object.hasOwn(resultLabels, round.result)
            || !Number.isInteger(round.elapsedMs)
            || round.elapsedMs < 0
            || round.elapsedMs > round.limitMs
            || seen.has(round.number)) return false;
          seen.add(round.number);
          return true;
        })
        .sort((a, b) => b.number - a.number);
      const active = saved?.active;
      return {
        history,
        active: isRound(active)
          && active.number === (history[0]?.number ?? 0) + 1
          && Number.isSafeInteger(active.deadline)
          && active.deadline > 0
          && active.deadline - Date.now() <= active.limitMs
          ? active : null,
        preference: {
          word: isKeyword(saved?.preference?.word) ? saved.preference.word.trim() : undefined,
          duration: isDuration(saved?.preference?.duration) ? saved.preference.duration : undefined,
          showResult: saved?.preference?.showResult,
        },
      };
    } catch {
      return { history: [], active: null, preference: {} };
    }
  }

  function saveRounds() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        history,
        active: activeRound,
        preference: { word: confirmedWord, duration: preferredDuration, showResult: finishedRound !== null },
      }));
    } catch {
      // The current page still works when storage is disabled or full.
    }
  }

  function formatSeconds(ms) {
    return `${(ms / 1000).toFixed(3)} 秒`;
  }

  function lookupConfirmedWord() {
    if (confirmedWord) document.dispatchEvent(new CustomEvent('word-confirmed', { detail: confirmedWord }));
  }

  function remainingTime() {
    return Math.max(0, Math.min(activeRound.limitMs, activeRound.deadline - Date.now()));
  }

  function renderRound() {
    const round = activeRound ?? finishedRound;
    editWord.disabled = activeRound !== null;
    const action = activeRound ? '结束并记录猜中' : (finishedRound ? '开始下一轮' : '开始计时');
    toggleClock.setAttribute('aria-label', action);
    const displayWord = round?.word ?? (confirmedWord || '请输入词条');
    word.textContent = displayWord;

    if (activeRound) {
      roundState.dataset.state = 'running';
      roundState.textContent = '';
      return;
    }

    if (finishedRound) {
      const remaining = round.limitMs - round.elapsedMs;
      roundState.dataset.state = round.result;
      roundState.textContent = round.result === 'timeout' ? resultLabels.timeout : '';
      clock.textContent = formatSeconds(round.result === 'timeout' ? 0 : round.elapsedMs);
      progress.value = remaining / round.limitMs;
      return;
    }

    roundState.dataset.state = 'ready';
    roundState.textContent = '';
    clock.textContent = `${preferredDuration} 秒`;
    progress.value = 1;
  }

  function renderHistory() {
    const items = document.createDocumentFragment();

    for (const round of history) {
      const item = document.createElement('li');
      item.className = round.result === 'win' ? 'win' : 'loss';
      const entry = document.createElement('span');
      entry.className = 'history-word';
      entry.textContent = round.word;
      const result = document.createElement('span');
      result.className = 'history-result';
      result.textContent = round.result === 'win' ? `${round.elapsedMs / 1000}秒` : '未猜出';
      item.append(entry, ' ', result);
      items.append(item);
    }

    historyList.replaceChildren(items);
    historyEmpty.hidden = history.length > 0;
    historyCount.textContent = String(history.length);
  }

  function finishRound(result) {
    if (!activeRound) return;
    const remaining = remainingTime();
    finishedRound = {
      number: activeRound.number,
      word: activeRound.word,
      limitMs: activeRound.limitMs,
      elapsedMs: activeRound.limitMs - remaining,
      result: remaining === 0 ? 'timeout' : result,
    };
    activeRound = null;
    cancelAnimationFrame(frame);
    clearTimeout(deadlineTimer);
    history.unshift(finishedRound);
    saveRounds();
    renderRound();
    renderHistory();
  }

  function tick() {
    const remaining = remainingTime();
    if (remaining === 0) {
      finishRound('timeout');
      return;
    }
    const time = formatSeconds(remaining);
    if (clock.textContent !== time) clock.textContent = time;
    progress.value = remaining / activeRound.limitMs;
    frame = requestAnimationFrame(tick);
  }

  function checkDeadline() {
    const remaining = remainingTime();
    if (remaining > 0) {
      deadlineTimer = setTimeout(checkDeadline, remaining);
    } else {
      finishRound('timeout');
    }
  }

  function runTimer() {
    renderRound();
    checkDeadline();
    if (activeRound) tick();
  }

  function openKeyword() {
    if (activeRound || keywordDialog.open) return;
    keyword.value = confirmedWord;
    keyword.setCustomValidity('');
    keywordDialog.showModal();
    keyword.focus();
    keyword.select();
  }

  editWord.addEventListener('click', openKeyword);
  cancelKeyword.addEventListener('click', () => keywordDialog.close());
  keyword.addEventListener('input', () => keyword.setCustomValidity(''));
  keywordForm.addEventListener('submit', event => {
    event.preventDefault();
    if (activeRound) return;
    const value = keyword.value.trim();
    if (!isKeyword(value)) {
      keyword.setCustomValidity('请输入 1 到 40 个字符的词条。');
      keyword.reportValidity();
      return;
    }

    confirmedWord = value;
    finishedRound = null;
    saveRounds();
    renderRound();
    keywordDialog.close();
    toggleClock.focus({ preventScroll: true });
    lookupConfirmedWord();
  });

  settings.addEventListener('click', () => {
    if (document.fullscreenElement || settingsDialog.open) return;
    duration.value = String(preferredDuration);
    settingsDialog.showModal();
    duration.focus();
  });
  cancelSettings.addEventListener('click', () => settingsDialog.close());
  settingsForm.addEventListener('submit', event => {
    event.preventDefault();
    const value = duration.valueAsNumber;
    if (!isDuration(value)) return;
    preferredDuration = value;
    saveRounds();
    if (!activeRound) renderRound();
    settingsDialog.close();
    toggleClock.focus({ preventScroll: true });
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement && settingsDialog.open) settingsDialog.close();
  });

  function toggleTimer() {
    if (activeRound) {
      finishRound('win');
      return;
    }
    if (!confirmedWord) {
      openKeyword();
      return;
    }

    const limitMs = preferredDuration * 1000;
    finishedRound = null;
    activeRound = {
      number: (history[0]?.number ?? 0) + 1,
      word: confirmedWord,
      limitMs,
      deadline: Date.now() + limitMs,
    };
    saveRounds();
    runTimer();
  }

  toggleClock.addEventListener('click', toggleTimer);
  document.addEventListener('keydown', event => {
    if (event.key !== ' ' || event.defaultPrevented || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        keywordDialog.open || settingsDialog.open) return;
    const control = event.target.closest?.('button, input, textarea, select, a[href], [contenteditable]:not([contenteditable="false"])');
    if (control && control !== toggleClock) return;
    event.preventDefault();
    if (!event.repeat) toggleTimer();
  });

  renderHistory();
  if (activeRound) runTimer();
  else renderRound();
  lookupConfirmedWord();
})();
