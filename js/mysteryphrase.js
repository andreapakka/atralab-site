(() => {
  const SUPABASE_URL = "https://ukoaefhtvhqqdchjnzby.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hUhoYFMepUOJlJiy6RfBcg_LHf_V6cU";
  const AI_FUNCTION_NAME = "openai-proxy";
  const RESULT_FUNCTION_NAME = "mystery-phrase-result";

  const STORAGE_ACTIVE = "atralab_mysteryphrase_active_v1";
  const STORAGE_SOUND = "atralab_mysteryphrase_sound_v1";

  const board = document.getElementById("board");
  const startPanel = document.getElementById("startPanel");
  const startMessage = document.getElementById("startMessage");
  const playPanel = document.getElementById("playPanel");
  const winPanel = document.getElementById("winPanel");
  const gameCard = document.getElementById("gameCard");
  const phraseCounter = document.getElementById("phraseCounter");
  const timer = document.getElementById("timer");
  const finalTime = document.getElementById("finalTime");
  const guessForm = document.getElementById("guessForm");
  const letterInput = document.getElementById("letterInput");
  const tryButton = document.getElementById("tryButton");
  const newPhraseButton = document.getElementById("newPhraseButton");
  const nextPhraseButton = document.getElementById("nextPhraseButton");
  const gameMessage = document.getElementById("gameMessage");
  const triedWrap = document.getElementById("triedWrap");
  const triedLetters = document.getElementById("triedLetters");
  const saveStatus = document.getElementById("saveStatus");
  const soundToggle = document.getElementById("soundToggle");

  let activeGame = null;
  let timerId = null;
  let audioContext = null;
  let soundEnabled = localStorage.getItem(STORAGE_SOUND) !== "off";
  let dailyLimitReached = false;

  function normalizeLetter(char) {
    return char
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function cleanPhrase(value) {
    return String(value || "")
      .normalize("NFC")
      .replace(/[^\p{L}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRomeDate() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    return `${year}-${month}-${day}`;
  }

  function isSingleLetter(value) {
    return /^\p{L}$/u.test(value);
  }

  function phraseContains(letter) {
    if (!activeGame) return false;
    return Array.from(activeGame.phrase).some(
      (char) => isSingleLetter(char) && normalizeLetter(char) === letter
    );
  }

  function occurrenceCount(letter) {
    if (!activeGame) return 0;
    return Array.from(activeGame.phrase).filter(
      (char) => isSingleLetter(char) && normalizeLetter(char) === letter
    ).length;
  }

  function gameIsSolved() {
    if (!activeGame) return false;

    return Array.from(activeGame.phrase).every((char) => {
      if (!isSingleLetter(char)) return true;
      return activeGame.guessed.includes(normalizeLetter(char));
    });
  }

  function saveActiveGame() {
    if (!activeGame) {
      localStorage.removeItem(STORAGE_ACTIVE);
      return;
    }

    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(activeGame));
  }

  function restoreActiveGame() {
    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const phrase = cleanPhrase(parsed.phrase);

      if (!phrase || !Number.isInteger(parsed.phraseNumber)) {
        localStorage.removeItem(STORAGE_ACTIVE);
        return null;
      }

      return {
        phrase,
        phraseNumber: parsed.phraseNumber,
        maxDaily: Number.isInteger(parsed.maxDaily) ? parsed.maxDaily : null,
        remaining: Number.isInteger(parsed.remaining) ? parsed.remaining : null,
        playDate: typeof parsed.playDate === "string" ? parsed.playDate : null,
        guessed: Array.isArray(parsed.guessed)
          ? [...new Set(parsed.guessed.filter((item) => typeof item === "string"))]
          : [],
        startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
        solved: Boolean(parsed.solved),
        elapsedSeconds: Number.isFinite(parsed.elapsedSeconds) ? parsed.elapsedSeconds : null,
        saved: Boolean(parsed.saved),
      };
    } catch (error) {
      console.error(error);
      localStorage.removeItem(STORAGE_ACTIVE);
      return null;
    }
  }

  async function callFunction(functionName, payload) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(data.error || "Errore durante la richiesta");
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function setLoading(isLoading) {
    gameCard.classList.toggle("mp-loading", isLoading);
    newPhraseButton.disabled = isLoading || dailyLimitReached;
    nextPhraseButton.disabled = isLoading;
    tryButton.disabled = isLoading;
  }

  function setMessage(text, type = "") {
    gameMessage.textContent = text;
    gameMessage.classList.remove("is-good", "is-warn");
    if (type) gameMessage.classList.add(type);
  }

  function renderCounter() {
    if (!activeGame) {
      phraseCounter.textContent = "—";
      return;
    }

    phraseCounter.textContent = activeGame.maxDaily
      ? `${activeGame.phraseNumber} / ${activeGame.maxDaily}`
      : String(activeGame.phraseNumber);
  }

  function renderBoard(newGuess = null, solved = false) {
    board.innerHTML = "";
    board.classList.toggle("is-solved", solved);

    if (!activeGame) return;

    let revealIndex = 0;

    activeGame.phrase.split(" ").forEach((wordText) => {
      const word = document.createElement("span");
      word.className = "mp-word";
      word.setAttribute("aria-label", "parola");

      Array.from(wordText).forEach((char) => {
        const tile = document.createElement("span");
        tile.className = "mp-tile";

        const normalized = normalizeLetter(char);
        const revealed = activeGame.guessed.includes(normalized) || solved;

        if (revealed) {
          tile.classList.add("is-revealed");
          tile.textContent = char.toUpperCase();
          tile.setAttribute("aria-label", char.toUpperCase());
        } else {
          tile.textContent = char.toUpperCase();
          tile.setAttribute("aria-label", "lettera nascosta");
        }

        if (newGuess && normalized === newGuess && revealed) {
          tile.classList.add("reveal-pop");
          tile.style.animationDelay = `${revealIndex * 70}ms`;
          revealIndex += 1;
        }

        word.appendChild(tile);
      });

      board.appendChild(word);
    });
  }

  function renderTriedLetters() {
    triedLetters.innerHTML = "";

    if (!activeGame || activeGame.guessed.length === 0) {
      triedWrap.hidden = true;
      return;
    }

    triedWrap.hidden = false;

    activeGame.guessed.forEach((letter) => {
      const chip = document.createElement("span");
      chip.className = "mp-letter-chip";
      if (phraseContains(letter)) chip.classList.add("is-correct");
      chip.textContent = letter;
      triedLetters.appendChild(chip);
    });
  }

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function currentElapsedSeconds() {
    if (!activeGame) return 0;
    if (activeGame.solved && Number.isFinite(activeGame.elapsedSeconds)) {
      return activeGame.elapsedSeconds;
    }
    return Math.max(0, Math.floor((Date.now() - activeGame.startedAt) / 1000));
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    timer.textContent = formatTime(currentElapsedSeconds());

    timerId = setInterval(() => {
      timer.textContent = formatTime(currentElapsedSeconds());
    }, 1000);
  }

  function showStart(message = "Ogni giorno hai nuove frasi da scoprire.") {
    stopTimer();
    activeGame = null;
    board.innerHTML = "";
    board.classList.remove("is-solved");
    startPanel.hidden = false;
    playPanel.hidden = true;
    winPanel.hidden = true;
    phraseCounter.textContent = "—";
    timer.textContent = "00:00";
    startMessage.textContent = message;
  }

  function showGame() {
    startPanel.hidden = true;
    playPanel.hidden = false;
    winPanel.hidden = true;
    saveStatus.textContent = "";

    renderCounter();
    renderBoard();
    renderTriedLetters();
    setMessage("Indovina tutte le lettere");
    startTimer();

    setTimeout(() => letterInput.focus(), 120);
  }

  function showWin() {
    stopTimer();
    startPanel.hidden = true;
    playPanel.hidden = true;
    winPanel.hidden = false;

    renderCounter();
    renderBoard(null, true);

    const elapsed = activeGame?.elapsedSeconds || 0;
    timer.textContent = formatTime(elapsed);
    finalTime.textContent = formatTime(elapsed);

    if (activeGame?.remaining === 0) {
      nextPhraseButton.hidden = true;
    } else {
      nextPhraseButton.hidden = false;
    }
  }

  async function requestNewPhrase() {
    ensureAudioContext();
    setLoading(true);
    startMessage.textContent = "Sto preparando il tabellone...";

    try {
      const data = await callFunction(AI_FUNCTION_NAME, { action: "generate" });
      const phrase = cleanPhrase(data.phrase);

      if (!phrase || !Number.isInteger(data.phrase_number)) {
        throw new Error("La frase ricevuta non è valida");
      }

      activeGame = {
        phrase,
        phraseNumber: data.phrase_number,
        maxDaily: Number.isInteger(data.max_daily_games)
          ? data.max_daily_games
          : (Number.isInteger(data.remaining) ? data.phrase_number + data.remaining : null),
        remaining: Number.isInteger(data.remaining) ? data.remaining : null,
        playDate: getRomeDate(),
        guessed: [],
        startedAt: Date.now(),
        solved: false,
        elapsedSeconds: null,
        saved: false,
      };

      saveActiveGame();
      letterInput.value = "";
      showGame();
    } catch (error) {
      console.error(error);

      if (error.status === 429 || error.data?.error === "DAILY_LIMIT_REACHED") {
        const max = error.data?.max_daily_games;
        dailyLimitReached = true;
        showStart(
          max
            ? `Per oggi hai già usato tutte le ${max} frasi disponibili.`
            : "Per oggi hai già usato tutte le frasi disponibili."
        );
        newPhraseButton.textContent = "TORNA DOMANI";
      } else {
        showStart("Non riesco a creare una nuova frase in questo momento. Riprova tra poco.");
      }
    } finally {
      setLoading(false);
    }
  }

  function inputFeedbackError() {
    letterInput.classList.remove("input-error");
    void letterInput.offsetWidth;
    letterInput.classList.add("input-error");
  }

  function handleGuess(event) {
    event.preventDefault();
    ensureAudioContext();

    if (!activeGame || activeGame.solved) return;

    const raw = letterInput.value.trim();

    if (!isSingleLetter(raw)) {
      setMessage("Inserisci una sola lettera", "is-warn");
      inputFeedbackError();
      letterInput.value = "";
      letterInput.focus();
      return;
    }

    const guess = normalizeLetter(raw);
    letterInput.value = "";

    if (activeGame.guessed.includes(guess)) {
      setMessage(`La ${guess} la hai già provata`, "is-warn");
      inputFeedbackError();
      letterInput.focus();
      return;
    }

    activeGame.guessed.push(guess);
    saveActiveGame();

    const hits = occurrenceCount(guess);
    renderBoard(guess);
    renderTriedLetters();

    if (hits > 0) {
      setMessage(hits === 1 ? "Bella presa" : `Bella presa  ci sono ${hits} ${guess}`, "is-good");
      playCorrectSound(hits);
    } else {
      setMessage(`Nessuna ${guess} qui  prova ancora`, "is-warn");
      inputFeedbackError();
    }

    if (gameIsSolved()) {
      tryButton.disabled = true;
      letterInput.disabled = true;
      setTimeout(completeGame, 650);
    } else {
      letterInput.focus();
    }
  }

  async function completeGame() {
    if (!activeGame || activeGame.solved) return;

    activeGame.solved = true;
    activeGame.elapsedSeconds = Math.max(1, currentElapsedSeconds());
    saveActiveGame();

    stopTimer();
    renderBoard(null, true);
    playVictorySound();

    setTimeout(() => {
      showWin();
      saveResult();
    }, 420);
  }

  async function saveResult() {
    if (!activeGame || !activeGame.solved || activeGame.saved) return;

    saveStatus.textContent = "Salvataggio risultato...";

    try {
      await callFunction(RESULT_FUNCTION_NAME, {
        phrase: activeGame.phrase,
        phrase_number: activeGame.phraseNumber,
        elapsed_seconds: activeGame.elapsedSeconds,
        play_date: activeGame.playDate,
      });

      activeGame.saved = true;
      saveActiveGame();
      saveStatus.textContent = "Risultato salvato";
    } catch (error) {
      console.error(error);
      saveStatus.textContent = "Frase completata  risultato non salvato";
    }
  }

  function ensureAudioContext() {
    if (!soundEnabled) return null;

    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      audioContext = new AudioCtx();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  function playTone(frequency, delay = 0, duration = 0.11, volume = 0.045) {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    const end = start + duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  function playCorrectSound(hits) {
    if (!soundEnabled) return;
    playTone(659.25, 0, 0.1, 0.038);
    if (hits > 1) playTone(783.99, 0.085, 0.09, 0.03);
  }

  function playVictorySound() {
    if (!soundEnabled) return;
    playTone(523.25, 0, 0.13, 0.04);
    playTone(659.25, 0.11, 0.13, 0.04);
    playTone(783.99, 0.22, 0.2, 0.05);
  }

  function renderSoundToggle() {
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    const icon = soundToggle.querySelector("span[aria-hidden='true']");
    if (icon) icon.textContent = soundEnabled ? "🔊" : "🔇";
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem(STORAGE_SOUND, soundEnabled ? "on" : "off");
    renderSoundToggle();
    if (soundEnabled) {
      ensureAudioContext();
      playTone(659.25, 0, 0.08, 0.025);
    }
  }

  function activateSidebarLink() {
    const mark = () => {
      const links = document.querySelectorAll(".mp-sidebar .sidebar-link");
      if (!links.length) return false;

      links.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === "/mysteryphrase/");
      });
      return true;
    };

    if (mark()) return;

    const observer = new MutationObserver(() => {
      if (mark()) observer.disconnect();
    });

    observer.observe(document.querySelector(".mp-sidebar"), {
      childList: true,
      subtree: true,
    });
  }

  letterInput.addEventListener("beforeinput", (event) => {
    if (event.inputType.startsWith("delete")) return;
    if (event.data && !isSingleLetter(event.data)) {
      event.preventDefault();
      inputFeedbackError();
    }
  });

  letterInput.addEventListener("input", () => {
    const chars = Array.from(letterInput.value);
    if (chars.length > 1 || (chars[0] && !isSingleLetter(chars[0]))) {
      letterInput.value = "";
      inputFeedbackError();
      return;
    }

    if (chars[0]) letterInput.value = chars[0].toUpperCase();
  });

  guessForm.addEventListener("submit", handleGuess);
  newPhraseButton.addEventListener("click", requestNewPhrase);
  nextPhraseButton.addEventListener("click", requestNewPhrase);
  soundToggle.addEventListener("click", toggleSound);

  renderSoundToggle();
  activateSidebarLink();

  activeGame = restoreActiveGame();

  if (!activeGame) {
    showStart();
  } else if (activeGame.solved || gameIsSolved()) {
    activeGame.solved = true;
    if (!Number.isFinite(activeGame.elapsedSeconds)) {
      activeGame.elapsedSeconds = Math.max(1, currentElapsedSeconds());
    }
    saveActiveGame();
    showWin();
    if (!activeGame.saved) saveResult();
  } else {
    showGame();
  }
})();
