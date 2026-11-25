(() => {
  'use strict';

  const storageKey = 'word-guess.rounds.v1';
  const resultLabels = { win: '猜中', loss: '未猜出', timeout: '超时' };
  const setup = document.querySelector('#setup');
  const keyword = document.querySelector('#keyword');
  const duration = document.querySelector('#duration');
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

  const { history, active } = loadRounds();
  let activeRound = active;
  let finishedRound = active ? null : (history[0] ?? null);
  let frame;
  let deadlineTimer;

  function isRound(round) {
    return round
      && Number.isSafeInteger(round.number)
      && round.number > 0
      && typeof round.word === 'string'
      && round.word.trim().length > 0
      && round.word.length <= 40
      && Number.isInteger(round.limitMs)
      && round.limitMs % 1000 === 0
      && round.limitMs >= 1000
      && round.limitMs <= 3_600_000;
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
      };
    } catch {
      return { history: [], active: null };
    }
  }

  function saveRounds() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ history, active: activeRound }));
    } catch {
      // The current page still works when storage is disabled or full.
    }
  }

  function formatTime(ms, roundUp = false) {
    const centiseconds = roundUp ? Math.ceil(ms / 10) : Math.floor(ms / 10);
    const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, '0');
    const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, '0');
    const fraction = String(centiseconds % 100).padStart(2, '0');
    return `${minutes}:${seconds}.${fraction}`;
  }

  function draftLimit() {
    const seconds = duration.valueAsNumber;
    return Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600 ? seconds * 1000 : 0;
  }

  function remainingTime() {
    return Math.max(0, Math.min(activeRound.limitMs, activeRound.deadline - Date.now()));
  }

  function renderRound() {
    const round = activeRound ?? finishedRound;
    setup.hidden = activeRound !== null;
    playActions.hidden = activeRound === null;
    roundLabel.textContent = `第 ${round?.number ?? (history[0]?.number ?? 0) + 1} 轮`;
    const displayWord = round?.word ?? (keyword.value.trim() || '请输入词条');
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
      clock.textContent = formatTime(round.elapsedMs);
      clockCaption.textContent = `本轮用时 · 剩余 ${formatTime(remaining, true)}`;
      progress.value = remaining / round.limitMs;
      return;
    }

    const limit = draftLimit();
    roundState.dataset.state = 'ready';
    roundState.textContent = '待开始';
    clock.textContent = limit ? formatTime(limit) : '--:--.--';
    clockCaption.textContent = '本轮限时';
    progress.value = limit ? 1 : 0;
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
      elapsed.textContent = formatTime(round.elapsedMs);
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
    const time = formatTime(remaining, true);
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

  setup.addEventListener('input', () => {
    keyword.setCustomValidity('');
    finishedRound = null;
    renderRound();
  });

  setup.addEventListener('submit', event => {
    event.preventDefault();
    if (activeRound) return;

    const text = keyword.value.trim();
    const limitMs = draftLimit();
    if (!text || text.length > 40) {
      keyword.setCustomValidity('请输入 1 到 40 个字符的词条。');
      keyword.reportValidity();
      return;
    }
    if (!limitMs) return;

    keyword.value = text;
    finishedRound = null;
    activeRound = {
      number: (history[0]?.number ?? 0) + 1,
      word: text,
      limitMs,
      deadline: Date.now() + limitMs,
    };
    saveRounds();
    runTimer();
  });

  won.addEventListener('click', () => finishRound('win'));
  failed.addEventListener('click', () => finishRound('loss'));

  const restored = activeRound ?? finishedRound;
  if (restored) {
    keyword.value = restored.word;
    duration.value = String(restored.limitMs / 1000);
  }

  renderHistory();
  if (activeRound) runTimer();
  else renderRound();
})();
