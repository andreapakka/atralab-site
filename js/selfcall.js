(() => {
  "use strict";

  /* =========================================================
     CONFIGURAZIONE RAPIDA
     Cambia questi valori per modificare il comportamento.
     ========================================================= */

  const RING_DELAY_MS = 5000;
  const REARM_DELAY_MS = 30000;

  const RING_VOLUME = 0.34;
  const RING_BURST_MS = 720;
  const RING_BURST_GAP_MS = 190;
  const RING_SEQUENCE_GAP_MS = 1450;
  const RING_TREMOLO_HZ = 24;
  const RING_FREQUENCIES = [440, 480];

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
  let rearmTimer = null;
  let rearmCountdownTimer = null;

  let activeSources = [];

  function delaySeconds() {
    return Math.max(0, Math.ceil(RING_DELAY_MS / 1000));
  }

  function rearmSeconds() {
    return Math.max(0, Math.ceil(REARM_DELAY_MS / 1000));
  }

  function setState(nextState) {
    state = nextState;

    button.classList.toggle("is-waiting", state === "waiting");
    button.classList.toggle("is-ringing", state === "ringing");
    button.classList.toggle("is-locked", state === "locked");
    button.disabled = state === "locked";

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

    if (state === "ringing") {
      buttonLabel.textContent = "Interrompi";
      status.textContent = "Telefono in squillo.";
      button.setAttribute("aria-label", "Interrompi lo squillo");
      return;
    }

    buttonLabel.textContent = "In chiamata";
    button.setAttribute("aria-label", "SelfCall temporaneamente disabilitato");
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

    const unlockOscillator = audioContext.createOscillator();
    const unlockGain = audioContext.createGain();

    unlockGain.gain.value = 0.00001;
    unlockOscillator.connect(unlockGain);
    unlockGain.connect(audioContext.destination);

    unlockOscillator.start();
    unlockOscillator.stop(audioContext.currentTime + 0.03);
  }

  function clearRingTimers() {
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

  function clearRearmTimers() {
    if (rearmTimer) {
      clearTimeout(rearmTimer);
      rearmTimer = null;
    }

    if (rearmCountdownTimer) {
      clearInterval(rearmCountdownTimer);
      rearmCountdownTimer = null;
    }
  }

  function clearAllTimers() {
    clearRingTimers();
    clearRearmTimers();
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

  function registerSource(source) {
    activeSources.push(source);

    source.addEventListener("ended", () => {
      activeSources = activeSources.filter((item) => item !== source);
      try {
        source.disconnect();
      } catch (_) {
        /* sorgente già scollegata */
      }
    }, { once: true });
  }

  function scheduleRingBurst(startTime, durationSeconds) {
    if (!audioContext || !masterGain) return;

    const burstGain = audioContext.createGain();
    burstGain.gain.setValueAtTime(0.0001, startTime);
    burstGain.gain.exponentialRampToValueAtTime(0.52, startTime + 0.018);
    burstGain.gain.setValueAtTime(0.52, startTime + Math.max(0.04, durationSeconds - 0.035));
    burstGain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
    burstGain.connect(masterGain);

    const tremolo = audioContext.createOscillator();
    const tremoloDepth = audioContext.createGain();

    tremolo.type = "sine";
    tremolo.frequency.setValueAtTime(RING_TREMOLO_HZ, startTime);
    tremoloDepth.gain.setValueAtTime(0.43, startTime);
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(burstGain.gain);

    tremolo.start(startTime);
    tremolo.stop(startTime + durationSeconds + 0.02);
    registerSource(tremolo);

    RING_FREQUENCIES.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const toneGain = audioContext.createGain();

      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      toneGain.gain.setValueAtTime(index === 0 ? 0.78 : 0.52, startTime);

      oscillator.connect(toneGain);
      toneGain.connect(burstGain);

      oscillator.start(startTime);
      oscillator.stop(startTime + durationSeconds + 0.02);
      registerSource(oscillator);
    });

    const shimmer = audioContext.createOscillator();
    const shimmerGain = audioContext.createGain();

    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(960, startTime);
    shimmerGain.gain.setValueAtTime(0.10, startTime);

    shimmer.connect(shimmerGain);
    shimmerGain.connect(burstGain);

    shimmer.start(startTime);
    shimmer.stop(startTime + durationSeconds + 0.02);
    registerSource(shimmer);

    setTimeout(() => {
      try {
        burstGain.disconnect();
        tremoloDepth.disconnect();
      } catch (_) {
        /* nodi già scollegati */
      }
    }, Math.ceil(durationSeconds * 1000) + 150);
  }

  function playRingSequence() {
    if (state !== "ringing" || !audioContext) return;

    const now = audioContext.currentTime + 0.03;
    const burstSeconds = RING_BURST_MS / 1000;
    const gapSeconds = RING_BURST_GAP_MS / 1000;

    scheduleRingBurst(now, burstSeconds);
    scheduleRingBurst(now + burstSeconds + gapSeconds, burstSeconds);

    const sequenceDurationMs = (RING_BURST_MS * 2) + RING_BURST_GAP_MS;

    ringLoopTimer = setTimeout(() => {
      playRingSequence();
    }, sequenceDurationMs + RING_SEQUENCE_GAP_MS);
  }

  function startRinging() {
    clearRingTimers();
    setState("ringing");
    playRingSequence();
  }

  function updateCountdown(startTime) {
    const elapsed = performance.now() - startTime;
    const remainingMs = Math.max(0, RING_DELAY_MS - elapsed);
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    status.textContent = `Squillo tra ${remainingSeconds}…`;
  }

  function updateRearmCountdown(startTime) {
    const elapsed = performance.now() - startTime;
    const remainingMs = Math.max(0, REARM_DELAY_MS - elapsed);
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    status.textContent = `Nuovo squillo disponibile tra ${remainingSeconds} s.`;
  }

  async function armRing() {
    try {
      await ensureAudio();
    } catch (error) {
      console.error("SelfCall: impossibile inizializzare l'audio", error);
      status.textContent = "Audio non disponibile su questo browser.";
      return;
    }

    clearAllTimers();
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

  function startRearmLock() {
    clearRearmTimers();

    const startTime = performance.now();
    setState("locked");
    updateRearmCountdown(startTime);

    rearmCountdownTimer = setInterval(() => {
      if (state !== "locked") return;
      updateRearmCountdown(startTime);
    }, 250);

    rearmTimer = setTimeout(() => {
      clearRearmTimers();
      setState("idle");
    }, REARM_DELAY_MS);
  }

  function stopRing() {
    const wasRinging = state === "ringing";

    clearRingTimers();
    stopActiveSources();

    if (masterGain && audioContext) {
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setValueAtTime(RING_VOLUME, audioContext.currentTime);
    }

    if (wasRinging) {
      startRearmLock();
      return;
    }

    setState("idle");
  }

  button.addEventListener("click", () => {
    if (state === "idle") {
      armRing();
      return;
    }

    if (state === "waiting" || state === "ringing") {
      stopRing();
    }
  });

  window.addEventListener("pagehide", () => {
    clearAllTimers();
    stopActiveSources();

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
  });

  setState("idle");
})();
