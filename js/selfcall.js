(() => {
  "use strict";

  /* =========================================================
     CONFIGURAZIONE RAPIDA
     Cambia questi valori per modificare il comportamento.
     ========================================================= */

  const RING_DELAY_MS = 5000;
  const REARM_DELAY_MS = 30000;

  /* Suoneria: valori pensati per un "DRIIIIIN" più metallico. */
  const RING_VOLUME = 0.42;
  const RING_BURST_MS = 900;
  const RING_BURST_GAP_MS = 220;
  const RING_SEQUENCE_GAP_MS = 1500;
  const RING_TREMOLO_HZ = 29;
  const RING_VIBRATO_HZ = 17;
  const RING_VIBRATO_DEPTH_HZ = 38;
  const RING_FREQUENCIES = [1120, 1370, 1640];

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

    /*
      Segnale praticamente silenzioso durante il tap iniziale.
      Aiuta alcuni browser mobile a mantenere sbloccato l'audio
      per lo squillo che parte dopo il ritardo configurato.
    */
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

    /*
      Un vecchio squillo telefonico non è un tono puro: è più vicino
      a una campanella metallica che vibra rapidamente. Qui combiniamo
      frequenze alte, tremolo e vibrato per ottenere il "DRIIIIIN".
    */
    const burstGain = audioContext.createGain();
    const highPass = audioContext.createBiquadFilter();

    highPass.type = "highpass";
    highPass.frequency.setValueAtTime(700, startTime);
    highPass.Q.setValueAtTime(0.7, startTime);

    burstGain.gain.setValueAtTime(0.0001, startTime);
    burstGain.gain.exponentialRampToValueAtTime(0.42, startTime + 0.012);
    burstGain.gain.setValueAtTime(
      0.42,
      startTime + Math.max(0.05, durationSeconds - 0.045)
    );
    burstGain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + durationSeconds
    );

    highPass.connect(burstGain);
    burstGain.connect(masterGain);

    /* Tremolo rapido: crea il caratteristico "drrrr" della campanella. */
    const tremolo = audioContext.createOscillator();
    const tremoloDepth = audioContext.createGain();

    tremolo.type = "sine";
    tremolo.frequency.setValueAtTime(RING_TREMOLO_HZ, startTime);
    tremoloDepth.gain.setValueAtTime(0.20, startTime);
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(burstGain.gain);

    tremolo.start(startTime);
    tremolo.stop(startTime + durationSeconds + 0.02);
    registerSource(tremolo);

    /* Piccolo vibrato di frequenza per evitare l'effetto "truuuu". */
    const vibrato = audioContext.createOscillator();
    const vibratoDepth = audioContext.createGain();

    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(RING_VIBRATO_HZ, startTime);
    vibratoDepth.gain.setValueAtTime(RING_VIBRATO_DEPTH_HZ, startTime);
    vibrato.connect(vibratoDepth);

    RING_FREQUENCIES.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const toneGain = audioContext.createGain();

      oscillator.type = index === 1 ? "sawtooth" : "triangle";
      oscillator.frequency.setValueAtTime(frequency * 0.965, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency,
        startTime + 0.055
      );

      vibratoDepth.connect(oscillator.frequency);

      const levels = [0.58, 0.16, 0.11];
      toneGain.gain.setValueAtTime(levels[index], startTime);

      oscillator.connect(toneGain);
      toneGain.connect(highPass);

      oscillator.start(startTime);
      oscillator.stop(startTime + durationSeconds + 0.02);
      registerSource(oscillator);
    });

    vibrato.start(startTime);
    vibrato.stop(startTime + durationSeconds + 0.02);
    registerSource(vibrato);

    /* Armonica alta molto leggera: aggiunge il bordo metallico. */
    const shimmer = audioContext.createOscillator();
    const shimmerGain = audioContext.createGain();

    shimmer.type = "square";
    shimmer.frequency.setValueAtTime(2280, startTime);
    shimmerGain.gain.setValueAtTime(0.035, startTime);

    shimmer.connect(shimmerGain);
    shimmerGain.connect(highPass);

    shimmer.start(startTime);
    shimmer.stop(startTime + durationSeconds + 0.02);
    registerSource(shimmer);

    setTimeout(() => {
      try {
        burstGain.disconnect();
        highPass.disconnect();
        tremoloDepth.disconnect();
        vibratoDepth.disconnect();
      } catch (_) {
        /* nodi già scollegati */
      }
    }, Math.ceil(durationSeconds * 1000) + 180);
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

  /* =========================================================
     OFFLINE
     Dopo la prima apertura online, il Service Worker conserva
     i file necessari per far funzionare SelfCall senza rete.
     ========================================================= */

  function registerOfflineSupport() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/selfcall/sw.js", { scope: "/selfcall/" })
      .catch((error) => {
        console.warn("SelfCall: Service Worker non registrato", error);
      });
  }

  if (document.readyState === "complete") {
    registerOfflineSupport();
  } else {
    window.addEventListener("load", registerOfflineSupport, { once: true });
  }

  setState("idle");
})();
