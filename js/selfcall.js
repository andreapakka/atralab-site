(() => {
  "use strict";

  /* =========================================================
     CONFIGURAZIONE RAPIDA
     Cambia questi valori per modificare il comportamento.
     ========================================================= */

  const RING_DELAY_MS = 5000;
  const RING_VOLUME = 0.32;
  const RING_SEQUENCE_GAP_MS = 1350;

  const RING_NOTES = [
    { frequency: 659.25, duration: 0.17 },
    { frequency: 783.99, duration: 0.17 },
    { frequency: 987.77, duration: 0.20 },
    { frequency: 783.99, duration: 0.17 },
    { frequency: 659.25, duration: 0.20 }
  ];

  const NOTE_GAP_SECONDS = 0.045;

  const button = document.getElementById("selfcall-button");
  const buttonLabel = document.getElementById("selfcall-button-label");
  const status = document.getElementById("selfcall-status");

  if (!button || !buttonLabel || !status) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let state = "idle";
  let audioContext = null;
  let masterGain = null;
  let delayTimer = null;
  let countdownTimer = null;
  let ringLoopTimer = null;
  let activeSources = [];
  let ringStartedAt = 0;

  function delaySeconds() {
    return Math.max(0, Math.ceil(RING_DELAY_MS / 1000));
  }

  function setState(nextState) {
    state = nextState;

    button.classList.toggle("is-waiting", state === "waiting");
    button.classList.toggle("is-ringing", state === "ringing");

    if (state === "idle") {
      buttonLabel.textContent = "Fammi squillare";
      status.textContent = `Lo squillo partirà dopo ${delaySeconds()} secondi.`;
      button.setAttribute("aria-label", "Avvia SelfCall");
      return;
    }

    if (state === "waiting") {
      buttonLabel.textContent = "Annulla";
      button.setAttribute("aria-label", "Annulla lo squillo programmato");
      return;
    }

    buttonLabel.textContent = "Interrompi";
    status.textContent = "Telefono in squillo.";
    button.setAttribute("aria-label", "Interrompi lo squillo");
  }

  async function ensureAudio() {
    if (!AudioContextClass) {
      throw new Error("Web Audio API non supportata");
    }

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = RING_VOLUME;
      masterGain.connect(audioContext.destination);
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    /*
      Brevissimo segnale silenzioso durante il tap iniziale:
      aiuta alcuni browser mobile a mantenere sbloccato l'audio
      per lo squillo che partirà dopo il ritardo configurato.
    */
    const unlockOscillator = audioContext.createOscillator();
    const unlockGain = audioContext.createGain();

    unlockGain.gain.value = 0.00001;
    unlockOscillator.connect(unlockGain);
    unlockGain.connect(audioContext.destination);

    unlockOscillator.start();
    unlockOscillator.stop(audioContext.currentTime + 0.03);
  }

  function clearTimers() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }

    if (ringLoopTimer) {
      clearTimeout(ringLoopTimer);
      ringLoopTimer = null;
    }
  }

  function stopActiveSources() {
    for (const source of activeSources) {
      try {
        source.stop();
      } catch (_) {
        /* sorgente già terminata */
      }
    }

    activeSources = [];
  }

  function scheduleNote(frequency, startTime, duration) {
    if (!audioContext || !masterGain) return;

    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);

    noteGain.gain.setValueAtTime(0.0001, startTime);
    noteGain.gain.exponentialRampToValueAtTime(0.9, startTime + 0.018);
    noteGain.gain.setValueAtTime(0.9, startTime + Math.max(0.03, duration - 0.035));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(noteGain);
    noteGain.connect(masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);

    activeSources.push(oscillator);

    oscillator.addEventListener("ended", () => {
      activeSources = activeSources.filter((item) => item !== oscillator);
      oscillator.disconnect();
      noteGain.disconnect();
    }, { once: true });
  }

  function playRingSequence() {
    if (state !== "ringing" || !audioContext) return;

    let cursor = audioContext.currentTime + 0.03;

    for (const note of RING_NOTES) {
      scheduleNote(note.frequency, cursor, note.duration);
      cursor += note.duration + NOTE_GAP_SECONDS;
    }

    const sequenceDurationMs = Math.max(
      0,
      Math.round((cursor - audioContext.currentTime) * 1000)
    );

    ringLoopTimer = setTimeout(() => {
      playRingSequence();
    }, sequenceDurationMs + RING_SEQUENCE_GAP_MS);
  }

  function startRinging() {
    clearTimers();

    state = "ringing";
    ringStartedAt = performance.now();
    setState("ringing");
    playRingSequence();
  }

  function updateCountdown(startTime) {
    const elapsed = performance.now() - startTime;
    const remainingMs = Math.max(0, RING_DELAY_MS - elapsed);
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    status.textContent = `Squillo tra ${remainingSeconds}…`;
  }

  async function armRing() {
    try {
      await ensureAudio();
    } catch (error) {
      console.error("SelfCall: impossibile inizializzare l'audio", error);
      status.textContent = "Audio non disponibile su questo browser.";
      return;
    }

    clearTimers();
    stopActiveSources();

    const startTime = performance.now();

    setState("waiting");
    updateCountdown(startTime);

    countdownTimer = setInterval(() => {
      if (state !== "waiting") return;
      updateCountdown(startTime);
    }, 200);

    delayTimer = setTimeout(() => {
      startRinging();
    }, RING_DELAY_MS);
  }

  function stopRing() {
    const wasRinging = state === "ringing";

    clearTimers();
    stopActiveSources();

    if (masterGain && audioContext) {
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setValueAtTime(RING_VOLUME, audioContext.currentTime);
    }

    setState("idle");

    if (wasRinging && ringStartedAt) {
      ringStartedAt = 0;
    }
  }

  button.addEventListener("click", () => {
    if (state === "idle") {
      armRing();
      return;
    }

    stopRing();
  });

  window.addEventListener("pagehide", () => {
    clearTimers();
    stopActiveSources();

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
  });

  setState("idle");
})();
