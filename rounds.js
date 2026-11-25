(() => {
  'use strict';

  const storageKey = 'word-guess.rounds.v1';
  const resultLabels = { win: '猜中', loss: '未猜出', timeout: '超时' };
  const defaultDuration = 100;
  const setup = document.querySelector('#setup');
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
  const clockCaption = document.querySelector('#clock-caption');
  const roundLabel = document.querySelector('#round-label');
  const roundState = document.querySelector('#round-state');
  const progress = document.querySelector('#progress');
  const playActions = document.querySelector('#play-actions');
  const won = document.querySelector('#won');
  const failed = document.querySelector('#failed');
  const historyList = document.querySelector('#history-list');
  const historyEmpty = document.querySelector('#history-empty');
  const historyCount = document.querySelector('#history-count');
  const historyWins = document.querySelector('#history-wins');
  const historyLosses = document.querySelector('#history-losses');

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

  function formatElapsed(ms) {
    return `${(Math.floor(ms / 10) / 100).toFixed(2)} 秒`;
  }

  function lookupConfirmedWord() {
    if (confirmedWord) document.dispatchEvent(new CustomEvent('word-confirmed', { detail: confirmedWord }));
  }

  function remainingTime() {
    return Math.max(0, Math.min(activeRound.limitMs, activeRound.deadline - Date.now()));
  }

  function renderRound() {
    const round = activeRound ?? finishedRound;
    setup.hidden = activeRound !== null;
    playActions.hidden = activeRound === null;
    editWord.disabled = activeRound !== null;
    roundLabel.textContent = `第 ${round?.number ?? (history[0]?.number ?? 0) + 1} 轮`;
    const displayWord = round?.word ?? (confirmedWord || '请输入词条');
    word.textContent = displayWord;
    word.dataset.length = Array.from(displayWord).length > 8 ? 'long' : 'short';

    if (activeRound) {
      roundState.dataset.state = 'running';
      roundState.textContent = '进行中';
      clockCaption.textContent = '剩余时间';
      return;
    }

    if (finishedRound) {
      const remaining = round.limitMs - round.elapsedMs;
      roundState.dataset.state = round.result;
      roundState.textContent = resultLabels[round.result];
      clock.textContent = formatElapsed(round.elapsedMs);
      clockCaption.textContent = `本轮用时 · 剩余 ${formatElapsed(remaining)}`;
      progress.value = remaining / round.limitMs;
      return;
    }

    roundState.dataset.state = 'ready';
    roundState.textContent = '待开始';
    clock.textContent = `${preferredDuration} 秒`;
    clockCaption.textContent = '本轮限时';
    progress.value = 1;
  }

  function renderHistory() {
    let wins = 0;
    const items = document.createDocumentFragment();

    for (const round of history) {
      if (round.result === 'win') wins += 1;
      const item = document.createElement('li');
      item.className = round.result === 'win' ? 'win' : 'loss';
      const number = document.createElement('span');
      number.className = 'history-round';
      number.textContent = `第 ${round.number} 轮`;
      const entry = document.createElement('span');
      entry.className = 'history-word';
      entry.textContent = round.word;
      const elapsed = document.createElement('span');
      elapsed.className = 'history-time';
      elapsed.textContent = formatElapsed(round.elapsedMs);
      const result = document.createElement('span');
      result.className = 'history-result';
      result.textContent = resultLabels[round.result];
      item.append(number, entry, elapsed, result);
      items.append(item);
    }

    historyList.replaceChildren(items);
    historyEmpty.hidden = history.length > 0;
    historyCount.textContent = String(history.length);
    historyWins.textContent = String(wins);
    historyLosses.textContent = String(history.length - wins);
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
    const time = `${Math.ceil(remaining / 1000)} 秒`;
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
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement && settingsDialog.open) settingsDialog.close();
  });

  setup.addEventListener('submit', event => {
    event.preventDefault();
    if (activeRound) return;
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
  });

  won.addEventListener('click', () => finishRound('win'));
  failed.addEventListener('click', () => finishRound('loss'));

  renderHistory();
  if (activeRound) runTimer();
  else renderRound();
  lookupConfirmedWord();
})();
