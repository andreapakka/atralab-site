(() => {
  "use strict";

  const STORAGE_KEY = "atralab-nextscore-v1";
  const MAX_RESULTS = 200;

  const TEST_NAMES = {
    reaction: "Reazione",
    memory: "Memoria visiva",
    timing: "Stima del tempo",
    challenge: "Sfida completa"
  };

  const MEMORY_LEVELS = [
    { grid: 3, targets: 3, weight: 30 },
    { grid: 4, targets: 5, weight: 30 },
    { grid: 5, targets: 7, weight: 40 }
  ];

  const state = {
    device: detectDevice(),
    currentTest: null,
    challengeActive: false,
    challengeScores: {},
    reaction: {
      round: 0,
      results: [],
      waitTimer: null,
      signalAt: 0,
      phase: "idle"
    },
    memory: {
      level: 0,
      targets: new Set(),
      selected: new Set(),
      levelScores: [],
      phase: "idle",
      revealTimer: null
    },
    timing: {
      attempt: 0,
      results: [],
      startedAt: 0,
      running: false
    },
    lastResult: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const views = {
    home: $("#ns-home"),
    reaction: $("#ns-reaction"),
    memory: $("#ns-memory"),
    timing: $("#ns-timing"),
    result: $("#ns-result"),
    challengeResult: $("#ns-challenge-result")
  };

  const reactionZone = $("#ns-reaction-zone");
  const reactionStatus = $("#ns-reaction-status");
  const reactionSub = $("#ns-reaction-sub");
  const reactionProgress = $("#ns-reaction-progress");
  const reactionRounds = $("#ns-reaction-rounds");
  const reactionStart = $("#ns-reaction-start");

  const memoryGrid = $("#ns-memory-grid");
  const memoryStatus = $("#ns-memory-status");
  const memoryProgress = $("#ns-memory-progress");
  const memoryStart = $("#ns-memory-start");
  const memoryConfirm = $("#ns-memory-confirm");

  const timingProgress = $("#ns-timing-progress");
  const timingMessage = $("#ns-timing-message");
  const timingOrbit = $("#ns-time-orbit");
  const timingStop = $("#ns-timing-stop");
  const timingStart = $("#ns-timing-start");
  const timingRounds = $("#ns-timing-rounds");

  const resultOverline = $("#ns-result-overline");
  const resultTitle = $("#ns-result-title");
  const resultScore = $("#ns-result-score");
  const resultScoreLabel = $("#ns-result-score-label");
  const resultDetails = $("#ns-result-details");
  const resultPrimary = $("#ns-result-primary");
  const resultHome = $("#ns-result-home");

  const challengeTotal = $("#ns-challenge-total");
  const challengeBreakdown = $("#ns-challenge-breakdown");

  init();

  function init() {
    $("#ns-device-pill").textContent = state.device === "mobile" ? "Mobile / touch" : "Desktop";

    $$('[data-start-test]').forEach((button) => {
      button.addEventListener("click", () => {
        const test = button.dataset.startTest;
        if (test === "challenge") {
          startChallenge();
        } else {
          startSingleTest(test);
        }
      });
    });

    $$('[data-back-home]').forEach((button) => {
      button.addEventListener("click", goHome);
    });

    reactionStart.addEventListener("click", beginReactionTest);
    reactionZone.addEventListener("pointerdown", handleReactionPointer);

    memoryStart.addEventListener("click", beginMemoryTest);
    memoryConfirm.addEventListener("click", confirmMemoryLevel);

    timingStart.addEventListener("click", beginTimingAttempt);
    timingStop.addEventListener("pointerdown", stopTimingAttempt);

    resultPrimary.addEventListener("click", handleResultPrimary);
    resultHome.addEventListener("click", goHome);

    $("#ns-challenge-again").addEventListener("click", startChallenge);
    $("#ns-challenge-home").addEventListener("click", goHome);
    $("#ns-clear-data").addEventListener("click", clearAllData);

    renderHomeStats();
    activateSidebarLink();
  }

  function detectDevice() {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    return coarse || navigator.maxTouchPoints > 0 || window.innerWidth <= 768 ? "mobile" : "desktop";
  }

  function showView(name) {
    Object.values(views).forEach((view) => view.classList.remove("is-active"));
    views[name].classList.add("is-active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome() {
    cleanupActiveTimers();
    state.currentTest = null;
    state.challengeActive = false;
    state.challengeScores = {};
    renderHomeStats();
    showView("home");
  }

  function startSingleTest(test) {
    state.challengeActive = false;
    state.challengeScores = {};
    state.currentTest = test;
    prepareTest(test);
  }

  function startChallenge() {
    state.challengeActive = true;
    state.challengeScores = {};
    state.currentTest = "reaction";
    prepareTest("reaction");
  }

  function prepareTest(test) {
    cleanupActiveTimers();

    if (test === "reaction") {
      resetReaction();
      showView("reaction");
    } else if (test === "memory") {
      resetMemory();
      showView("memory");
    } else if (test === "timing") {
      resetTiming();
      showView("timing");
    }
  }

  function cleanupActiveTimers() {
    if (state.reaction.waitTimer) {
      clearTimeout(state.reaction.waitTimer);
      state.reaction.waitTimer = null;
    }
    if (state.memory.revealTimer) {
      clearTimeout(state.memory.revealTimer);
      state.memory.revealTimer = null;
    }
    state.timing.running = false;
    timingOrbit?.classList.remove("is-running");
  }

  // ---------------------------------------------------------
  // REAZIONE
  // ---------------------------------------------------------

  function resetReaction() {
    state.reaction.round = 0;
    state.reaction.results = [];
    state.reaction.phase = "idle";
    state.reaction.signalAt = 0;

    reactionProgress.textContent = "Round 1 / 3";
    reactionRounds.innerHTML = "";
    reactionStatus.textContent = "Pronto?";
    reactionSub.textContent = "L'attesa sarà casuale tra 1,5 e 8 secondi.";
    reactionZone.className = "ns-reaction-zone";
    reactionZone.disabled = true;
    reactionStart.hidden = false;
    reactionStart.textContent = "Avvia test";
  }

  function beginReactionTest() {
    if (state.reaction.results.length >= 3) return;
    reactionStart.hidden = true;
    startReactionRound();
  }

  function startReactionRound() {
    state.reaction.phase = "waiting";
    reactionZone.disabled = false;
    reactionZone.className = "ns-reaction-zone is-waiting";
    reactionStatus.textContent = "Aspetta…";
    reactionSub.textContent = "Non toccare finché non compare ORA!";
    reactionProgress.textContent = `Round ${state.reaction.results.length + 1} / 3`;

    const delay = 1500 + Math.random() * 6500;

    state.reaction.waitTimer = setTimeout(() => {
      state.reaction.phase = "go";
      state.reaction.signalAt = performance.now();
      reactionZone.className = "ns-reaction-zone is-go";
      reactionStatus.textContent = "ORA!";
      reactionSub.textContent = "Tocca subito.";
      state.reaction.waitTimer = null;
    }, delay);
  }

  function handleReactionPointer(event) {
    event.preventDefault();

    if (state.reaction.phase === "waiting") {
      if (state.reaction.waitTimer) {
        clearTimeout(state.reaction.waitTimer);
        state.reaction.waitTimer = null;
      }

      state.reaction.phase = "early";
      reactionZone.className = "ns-reaction-zone is-early";
      reactionStatus.textContent = "Troppo presto";
      reactionSub.textContent = "Questo round non conta. Riproviamo.";
      reactionZone.disabled = true;

      setTimeout(startReactionRound, 900);
      return;
    }

    if (state.reaction.phase !== "go") return;

    const ms = performance.now() - state.reaction.signalAt;
    state.reaction.results.push(ms);
    state.reaction.phase = "result";
    reactionZone.disabled = true;
    reactionZone.className = "ns-reaction-zone";
    reactionStatus.textContent = `${Math.round(ms)} ms`;
    reactionSub.textContent = "Round registrato.";

    renderRoundChips(reactionRounds, state.reaction.results.map((value) => `${Math.round(value)} ms`));

    if (state.reaction.results.length >= 3) {
      setTimeout(finishReaction, 700);
    } else {
      setTimeout(startReactionRound, 900);
    }
  }

  function finishReaction() {
    const values = state.reaction.results;
    const avg = average(values);
    const best = Math.min(...values);
    const score = Math.round(interpolateDescending(avg, [
      [200, 100],
      [250, 90],
      [300, 80],
      [400, 60],
      [500, 40],
      [700, 0]
    ]));

    const result = {
      test: "reaction",
      score,
      at: new Date().toISOString(),
      device: state.device,
      details: {
        averageMs: Math.round(avg),
        bestMs: Math.round(best),
        roundsMs: values.map((value) => Math.round(value))
      }
    };

    saveTestResult(result);
    completeTest(result);
  }

  // ---------------------------------------------------------
  // MEMORIA
  // ---------------------------------------------------------

  function resetMemory() {
    state.memory.level = 0;
    state.memory.targets = new Set();
    state.memory.selected = new Set();
    state.memory.levelScores = [];
    state.memory.phase = "idle";

    memoryGrid.innerHTML = "";
    memoryProgress.textContent = "Livello 1 / 3";
    memoryStatus.textContent = "Premi Avvia test per iniziare.";
    memoryStart.hidden = false;
    memoryStart.textContent = "Avvia test";
    memoryConfirm.hidden = true;
  }

  function beginMemoryTest() {
    memoryStart.hidden = true;
    runMemoryLevel(0);
  }

  function runMemoryLevel(levelIndex) {
    state.memory.level = levelIndex;
    state.memory.selected = new Set();
    state.memory.targets = new Set();
    state.memory.phase = "showing";

    const config = MEMORY_LEVELS[levelIndex];
    const totalCells = config.grid * config.grid;
    const targets = randomUniqueIndices(totalCells, config.targets);
    state.memory.targets = new Set(targets);

    memoryProgress.textContent = `Livello ${levelIndex + 1} / 3`;
    memoryStatus.textContent = `Memorizza ${config.targets} celle…`;
    memoryConfirm.hidden = true;

    renderMemoryGrid(config.grid, totalCells, { showTargets: true, interactive: false });

    state.memory.revealTimer = setTimeout(() => {
      state.memory.phase = "choosing";
      renderMemoryGrid(config.grid, totalCells, { showTargets: false, interactive: true });
      memoryStatus.textContent = `Seleziona ${config.targets} celle e poi conferma.`;
      memoryConfirm.hidden = false;
      memoryConfirm.disabled = true;
      state.memory.revealTimer = null;
    }, 1200);
  }

  function renderMemoryGrid(gridSize, totalCells, options) {
    memoryGrid.style.setProperty("--ns-grid-size", gridSize);
    memoryGrid.innerHTML = "";

    for (let index = 0; index < totalCells; index += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ns-memory-cell";
      cell.dataset.index = String(index);
      cell.setAttribute("aria-label", `Cella ${index + 1}`);

      if (options.showTargets && state.memory.targets.has(index)) {
        cell.classList.add("is-target");
      }

      if (!options.interactive) {
        cell.disabled = true;
      } else {
        cell.addEventListener("click", () => toggleMemoryCell(cell, index));
      }

      memoryGrid.appendChild(cell);
    }
  }

  function toggleMemoryCell(cell, index) {
    if (state.memory.phase !== "choosing") return;

    const config = MEMORY_LEVELS[state.memory.level];

    if (state.memory.selected.has(index)) {
      state.memory.selected.delete(index);
      cell.classList.remove("is-selected");
    } else {
      if (state.memory.selected.size >= config.targets) return;
      state.memory.selected.add(index);
      cell.classList.add("is-selected");
    }

    memoryConfirm.disabled = state.memory.selected.size !== config.targets;
    memoryStatus.textContent = `${state.memory.selected.size} / ${config.targets} celle selezionate.`;
  }

  function confirmMemoryLevel() {
    if (state.memory.phase !== "choosing") return;

    const config = MEMORY_LEVELS[state.memory.level];
    if (state.memory.selected.size !== config.targets) return;

    state.memory.phase = "feedback";
    memoryConfirm.hidden = true;

    const correct = [...state.memory.selected].filter((index) => state.memory.targets.has(index)).length;
    const wrong = config.targets - correct;
    const rawRatio = Math.max(0, (correct - wrong * 0.5) / config.targets);
    const levelScore = rawRatio * config.weight;
    state.memory.levelScores.push(levelScore);

    $$(".ns-memory-cell", memoryGrid).forEach((cell) => {
      const index = Number(cell.dataset.index);
      cell.disabled = true;

      if (state.memory.targets.has(index)) {
        cell.classList.add("is-correct");
      }

      if (state.memory.selected.has(index) && !state.memory.targets.has(index)) {
        cell.classList.add("is-wrong");
      }
    });

    memoryStatus.textContent = `${correct} corrette su ${config.targets}${wrong ? ` · ${wrong} errate` : " · perfetto"}.`;

    if (state.memory.level >= MEMORY_LEVELS.length - 1) {
      setTimeout(finishMemory, 1100);
    } else {
      setTimeout(() => runMemoryLevel(state.memory.level + 1), 1200);
    }
  }

  function finishMemory() {
    const score = Math.round(clamp(state.memory.levelScores.reduce((sum, value) => sum + value, 0), 0, 100));

    const result = {
      test: "memory",
      score,
      at: new Date().toISOString(),
      device: state.device,
      details: {
        levelScores: state.memory.levelScores.map((value) => Math.round(value * 10) / 10)
      }
    };

    saveTestResult(result);
    completeTest(result);
  }

  // ---------------------------------------------------------
  // STIMA DEL TEMPO
  // ---------------------------------------------------------

  function resetTiming() {
    state.timing.attempt = 0;
    state.timing.results = [];
    state.timing.startedAt = 0;
    state.timing.running = false;

    timingProgress.textContent = "Tentativo 1 / 3";
    timingMessage.textContent = "Pronto?";
    timingOrbit.classList.remove("is-running");
    timingStop.disabled = true;
    timingStart.hidden = false;
    timingStart.textContent = "Start";
    timingRounds.innerHTML = "";
  }

  function beginTimingAttempt() {
    if (state.timing.running || state.timing.results.length >= 3) return;

    state.timing.running = true;
    state.timing.startedAt = performance.now();
    timingStart.hidden = true;
    timingStop.disabled = false;
    timingMessage.textContent = "Tempo in corso…";
    timingOrbit.classList.add("is-running");
    timingProgress.textContent = `Tentativo ${state.timing.results.length + 1} / 3`;
  }

  function stopTimingAttempt(event) {
    event.preventDefault();
    if (!state.timing.running) return;

    const elapsed = (performance.now() - state.timing.startedAt) / 1000;
    const error = Math.abs(elapsed - 10);

    state.timing.results.push({ elapsed, error });
    state.timing.running = false;
    timingStop.disabled = true;
    timingOrbit.classList.remove("is-running");
    timingMessage.textContent = `${elapsed.toFixed(2)} s · errore ${formatSigned(elapsed - 10)} s`;

    renderRoundChips(
      timingRounds,
      state.timing.results.map((item) => `${item.elapsed.toFixed(2)} s`)
    );

    if (state.timing.results.length >= 3) {
      setTimeout(finishTiming, 700);
    } else {
      timingStart.hidden = false;
      timingStart.textContent = "Prossimo tentativo";
      timingProgress.textContent = `Tentativo ${state.timing.results.length + 1} / 3`;
    }
  }

  function finishTiming() {
    const errors = state.timing.results.map((item) => item.error);
    const avgError = average(errors);
    const best = state.timing.results.reduce((bestItem, item) => item.error < bestItem.error ? item : bestItem);

    const score = Math.round(interpolateDescending(avgError, [
      [0.10, 100],
      [0.25, 95],
      [0.50, 85],
      [1.00, 70],
      [2.00, 45],
      [3.00, 25],
      [5.00, 0]
    ]));

    const result = {
      test: "timing",
      score,
      at: new Date().toISOString(),
      device: state.device,
      details: {
        averageError: round2(avgError),
        bestSeconds: round2(best.elapsed),
        attempts: state.timing.results.map((item) => round2(item.elapsed))
      }
    };

    saveTestResult(result);
    completeTest(result);
  }

  // ---------------------------------------------------------
  // RISULTATI / CHALLENGE
  // ---------------------------------------------------------

  function completeTest(result) {
    state.lastResult = result;

    if (state.challengeActive) {
      state.challengeScores[result.test] = result;

      if (result.test === "reaction") {
        showIntermediateResult(result, "Continua con Memoria", () => {
          state.currentTest = "memory";
          prepareTest("memory");
        });
        return;
      }

      if (result.test === "memory") {
        showIntermediateResult(result, "Continua con Tempo", () => {
          state.currentTest = "timing";
          prepareTest("timing");
        });
        return;
      }

      if (result.test === "timing") {
        finishChallenge();
        return;
      }
    }

    showSingleResult(result);
  }

  function showIntermediateResult(result, buttonLabel, onContinue) {
    fillResultPanel(result);
    resultOverline.textContent = "SFIDA COMPLETA";
    resultPrimary.textContent = buttonLabel;
    resultHome.textContent = "Interrompi sfida";
    resultPrimary.onclick = onContinue;
    resultHome.onclick = goHome;
    showView("result");
  }

  function showSingleResult(result) {
    fillResultPanel(result);
    resultOverline.textContent = "RISULTATO";
    resultPrimary.textContent = "Riprova";
    resultHome.textContent = "Torna ai test";
    resultPrimary.onclick = handleResultPrimary;
    resultHome.onclick = goHome;
    showView("result");
  }

  function fillResultPanel(result) {
    resultTitle.textContent = TEST_NAMES[result.test];
    resultScore.textContent = String(result.score);
    resultScoreLabel.textContent = "punti su 100";
    resultDetails.innerHTML = "";

    if (result.test === "reaction") {
      appendDetail("Media", `${result.details.averageMs} ms`);
      appendDetail("Migliore", `${result.details.bestMs} ms`);
    }

    if (result.test === "memory") {
      appendDetail("Livello 1", `${Math.round(result.details.levelScores[0])} / 30`);
      appendDetail("Livello 2", `${Math.round(result.details.levelScores[1])} / 30`);
      appendDetail("Livello 3", `${Math.round(result.details.levelScores[2])} / 40`);
    }

    if (result.test === "timing") {
      appendDetail("Errore medio", `${result.details.averageError.toFixed(2)} s`);
      appendDetail("Miglior tentativo", `${result.details.bestSeconds.toFixed(2)} s`);
    }
  }

  function appendDetail(label, value) {
    const item = document.createElement("div");
    item.className = "ns-result-detail";
    item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    resultDetails.appendChild(item);
  }

  function handleResultPrimary() {
    if (!state.lastResult) return;
    startSingleTest(state.lastResult.test);
  }

  function finishChallenge() {
    const reaction = state.challengeScores.reaction;
    const memory = state.challengeScores.memory;
    const timing = state.challengeScores.timing;
    const total = reaction.score + memory.score + timing.score;

    const challengeResult = {
      test: "challenge",
      score: total,
      at: new Date().toISOString(),
      device: state.device,
      details: {
        reaction: reaction.score,
        memory: memory.score,
        timing: timing.score
      }
    };

    saveChallengeResult(challengeResult);

    challengeTotal.textContent = String(total);
    challengeBreakdown.innerHTML = "";
    appendChallengeRow("Reazione", reaction.score);
    appendChallengeRow("Memoria visiva", memory.score);
    appendChallengeRow("Stima del tempo", timing.score);

    state.challengeActive = false;
    state.currentTest = null;
    showView("challengeResult");
  }

  function appendChallengeRow(label, score) {
    const row = document.createElement("div");
    row.className = "ns-challenge-row";
    row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${score} / 100</strong>`;
    challengeBreakdown.appendChild(row);
  }

  // ---------------------------------------------------------
  // STORAGE
  // ---------------------------------------------------------

  function getStore() {
    const empty = {
      version: 1,
      reaction: { mobile: [], desktop: [] },
      memory: { mobile: [], desktop: [] },
      timing: { mobile: [], desktop: [] },
      challenge: { mobile: [], desktop: [] }
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      return mergeStore(empty, parsed);
    } catch (error) {
      console.warn("NextScore: localStorage non leggibile", error);
      return empty;
    }
  }

  function mergeStore(base, value) {
    const output = structuredCloneSafe(base);

    for (const key of ["reaction", "memory", "timing", "challenge"]) {
      for (const device of ["mobile", "desktop"]) {
        if (Array.isArray(value?.[key]?.[device])) {
          output[key][device] = value[key][device].slice(0, MAX_RESULTS);
        }
      }
    }

    return output;
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      console.warn("NextScore: impossibile salvare i risultati", error);
    }
  }

  function saveTestResult(result) {
    const store = getStore();
    const bucket = store[result.test][state.device];
    bucket.unshift(result);
    store[result.test][state.device] = bucket.slice(0, MAX_RESULTS);
    saveStore(store);
    renderHomeStats();
  }

  function saveChallengeResult(result) {
    const store = getStore();
    const bucket = store.challenge[state.device];
    bucket.unshift(result);
    store.challenge[state.device] = bucket.slice(0, MAX_RESULTS);
    saveStore(store);
    renderHomeStats();
  }

  function clearAllData() {
    const ok = window.confirm("Vuoi cancellare tutti i risultati NextScore salvati su questo browser?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    renderHomeStats();
  }

  function renderHomeStats() {
    const store = getStore();
    const device = state.device;

    setBest("#ns-best-reaction", store.reaction[device], 100, "Record");
    setBest("#ns-best-memory", store.memory[device], 100, "Record");
    setBest("#ns-best-timing", store.timing[device], 100, "Record");
    setBest("#ns-best-challenge", store.challenge[device], 300, "Personal Best");

    const history = [];
    for (const key of ["reaction", "memory", "timing", "challenge"]) {
      for (const item of store[key][device]) {
        history.push(item);
      }
    }

    history.sort((a, b) => new Date(b.at) - new Date(a.at));
    const latest = history.slice(0, 8);
    const container = $("#ns-history");
    container.innerHTML = "";

    if (!latest.length) {
      container.innerHTML = '<p class="ns-empty">Ancora nessun risultato su questo dispositivo.</p>';
      return;
    }

    latest.forEach((item) => {
      const row = document.createElement("div");
      row.className = "ns-history-row";
      const max = item.test === "challenge" ? 300 : 100;
      row.innerHTML = `
        <span class="ns-history-name">${escapeHtml(TEST_NAMES[item.test])}</span>
        <strong class="ns-history-score">${item.score} / ${max}</strong>
        <span class="ns-history-date">${formatDate(item.at)}</span>
      `;
      container.appendChild(row);
    });
  }

  function setBest(selector, items, max, prefix) {
    const el = $(selector);
    if (!items.length) {
      el.textContent = `${prefix} —`;
      return;
    }

    const best = Math.max(...items.map((item) => Number(item.score) || 0));
    el.textContent = `${prefix} ${best} / ${max}`;
  }

  // ---------------------------------------------------------
  // SIDEBAR ACTIVE
  // ---------------------------------------------------------

  function activateSidebarLink() {
    const apply = () => {
      const link = document.querySelector('.sidebar-link[href="/nextscore/"]');
      if (!link) return false;
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
      return true;
    };

    if (apply()) return;

    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------

  function renderRoundChips(container, labels) {
    container.innerHTML = "";
    labels.forEach((label, index) => {
      const chip = document.createElement("span");
      chip.className = "ns-round-chip";
      chip.textContent = `${index + 1}. ${label}`;
      container.appendChild(chip);
    });
  }

  function randomUniqueIndices(total, count) {
    const values = new Set();
    while (values.size < count) {
      values.add(Math.floor(Math.random() * total));
    }
    return [...values];
  }

  function interpolateDescending(value, points) {
    if (value <= points[0][0]) return points[0][1];
    if (value >= points[points.length - 1][0]) return points[points.length - 1][1];

    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];

      if (value >= x1 && value <= x2) {
        const t = (value - x1) / (x2 - x1);
        return y1 + (y2 - y1) * t;
      }
    }

    return 0;
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function formatSigned(value) {
    const sign = value >= 0 ? "+" : "−";
    return `${sign}${Math.abs(value).toFixed(2)}`;
  }

  function formatDate(value) {
    try {
      return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function structuredCloneSafe(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
