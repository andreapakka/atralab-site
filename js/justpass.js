(() => {
  "use strict";

  // =========================================================
  // CONFIG
  // =========================================================

  const API_URL =
    "https://pcpsbrnhfhzkjlnstgfr.supabase.co/functions/v1/justpass";

  const MAX_TEXT_SIZE = 200 * 1024;
  const MAX_PDF_SIZE = 5 * 1024 * 1024;
  const CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  const STATUS_POLL_MS = 3000;

  // =========================================================
  // ELEMENTI
  // =========================================================

  const tabText = document.getElementById("tab-text");
  const tabPdf = document.getElementById("tab-pdf");
  const sendText = document.getElementById("send-text");
  const sendPdf = document.getElementById("send-pdf");

  const textContent = document.getElementById("text-content");
  const textSize = document.getElementById("text-size");
  const pdfFile = document.getElementById("pdf-file");
  const pdfFileName = document.getElementById("pdf-file-name");

  const createButton = document.getElementById("create-pass");
  const sendMessage = document.getElementById("send-message");
  const sendForm = document.getElementById("send-form");
  const sendResult = document.getElementById("send-result");
  const sendCode = document.getElementById("send-code");
  const sendQr = document.getElementById("send-qr");
  const sendCountdown = document.getElementById("send-countdown");
  const sendStatus = document.getElementById("send-status");
  const copyCodeButton = document.getElementById("copy-code");
  const newPassButton = document.getElementById("new-pass");
  const cancelButton = document.getElementById("cancel-pass");
  const resultMessage = document.getElementById("result-message");

  const receiveForm = document.getElementById("receive-form");
  const receiveCode = document.getElementById("receive-code");
  const claimButton = document.getElementById("claim-pass");
  const receiveMessage = document.getElementById("receive-message");
  const receiveResult = document.getElementById("receive-result");
  const receivedType = document.getElementById("received-type");
  const receivedTextWrap = document.getElementById("received-text-wrap");
  const receivedText = document.getElementById("received-text");
  const copyTextButton = document.getElementById("copy-text");
  const receivedPdfWrap = document.getElementById("received-pdf-wrap");
  const receivedPdfName = document.getElementById("received-pdf-name");
  const receiveAnotherButton = document.getElementById("receive-another");

  let sendMode = "text";
  let currentCode = null;
  let currentExpiresAt = null;
  let statusTimer = null;
  let countdownTimer = null;

  // =========================================================
  // UTILITY
  // =========================================================

  function setMessage(element, message = "", isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  function byteSize(value) {
    return new TextEncoder().encode(value).length;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function normalizeCode(value) {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
  }

  async function apiJson(payload) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("Risposta non valida dal server");
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Operazione non riuscita");
    }

    return data;
  }

  function stopSenderTimers() {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }

    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function buildClaimUrl(code) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("code", code);
    return url.toString();
  }

  // =========================================================
  // MODALITÀ INVIO
  // =========================================================

  function setSendMode(mode) {
    sendMode = mode;

    const isText = mode === "text";

    tabText.classList.toggle("is-active", isText);
    tabPdf.classList.toggle("is-active", !isText);

    tabText.setAttribute("aria-selected", String(isText));
    tabPdf.setAttribute("aria-selected", String(!isText));

    sendText.hidden = !isText;
    sendPdf.hidden = isText;

    setMessage(sendMessage);
  }

  tabText.addEventListener("click", () => setSendMode("text"));
  tabPdf.addEventListener("click", () => setSendMode("pdf"));

  textContent.addEventListener("input", () => {
    textSize.textContent = formatBytes(byteSize(textContent.value));
  });

  pdfFile.addEventListener("change", () => {
    const file = pdfFile.files?.[0];
    pdfFileName.textContent = file ? file.name : "Nessun file selezionato";
    setMessage(sendMessage);
  });

  // =========================================================
  // CREA JUSTPASS
  // =========================================================

  createButton.addEventListener("click", async () => {
    setMessage(sendMessage);
    createButton.disabled = true;
    createButton.textContent = "Creazione...";

    try {
      let result;

      if (sendMode === "text") {
        const content = textContent.value;

        if (!content.trim()) {
          throw new Error("Inserisci del testo da passare");
        }

        if (byteSize(content) > MAX_TEXT_SIZE) {
          throw new Error("Il testo supera il limite di 200 KB");
        }

        result = await apiJson({
          action: "create_text",
          content,
        });
      } else {
        const file = pdfFile.files?.[0];

        if (!file) {
          throw new Error("Scegli un PDF");
        }

        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          throw new Error("Sono ammessi solo file PDF");
        }

        if (file.size > MAX_PDF_SIZE) {
          throw new Error("Il PDF supera il limite di 5 MB");
        }

        const formData = new FormData();
        formData.append("action", "create_pdf");
        formData.append("file", file);

        const response = await fetch(API_URL, {
          method: "POST",
          body: formData,
        });

        let data;

        try {
          data = await response.json();
        } catch {
          throw new Error("Risposta non valida dal server");
        }

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Upload non riuscito");
        }

        result = data;
      }

      showSenderResult(result.code);
    } catch (error) {
      setMessage(
        sendMessage,
        error instanceof Error ? error.message : "Errore durante la creazione",
        true
      );
    } finally {
      createButton.disabled = false;
      createButton.textContent = "Crea JustPass";
    }
  });

  function showSenderResult(code) {
    currentCode = code;
    currentExpiresAt = Date.now() + 30 * 60 * 1000;

    sendCode.textContent = code;
    sendForm.hidden = true;
    sendResult.hidden = false;

    sendQr.innerHTML = "";

    if (typeof QRCode !== "undefined") {
      new QRCode(sendQr, {
        text: buildClaimUrl(code),
        width: 190,
        height: 190,
        correctLevel: QRCode.CorrectLevel.M,
      });
    } else {
      sendQr.textContent = "QR non disponibile";
    }

    sendStatus.textContent = "In attesa del ritiro";
    sendStatus.classList.remove("is-delivered");
    cancelButton.disabled = false;
    cancelButton.textContent = "Annulla";
    cancelButton.dataset.action = "cancel";
    setMessage(resultMessage);

    startCountdown();
    startStatusPolling();
  }

  // =========================================================
  // COUNTDOWN + STATUS MITTENTE
  // =========================================================

  function updateCountdown() {
    if (!currentExpiresAt) return;

    const remaining = Math.max(0, currentExpiresAt - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    sendCountdown.textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    if (remaining <= 0) {
      stopSenderTimers();
      sendStatus.textContent = "Scaduto";
      cancelButton.disabled = true;
    }
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  async function checkSenderStatus() {
    if (!currentCode) return;

    try {
      const result = await apiJson({
        action: "status",
        code: currentCode,
      });

      if (result.status === "delivered") {
        sendStatus.textContent = "Consegnato";
        sendStatus.classList.add("is-delivered");
        cancelButton.disabled = false;
        cancelButton.textContent = "Nuovo invio";
        cancelButton.dataset.action = "new";
        stopSenderTimers();
        return;
      }

      if (result.status === "expired") {
        sendStatus.textContent = "Scaduto";
        cancelButton.disabled = true;
        stopSenderTimers();
        return;
      }

      if (result.status === "not_found") {
        sendStatus.textContent = "Non più disponibile";
        cancelButton.disabled = true;
        stopSenderTimers();
      }
    } catch {
      // Un errore temporaneo di rete non interrompe il polling.
    }
  }

  function startStatusPolling() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(checkSenderStatus, STATUS_POLL_MS);
  }

  // =========================================================
  // AZIONI MITTENTE
  // =========================================================

  copyCodeButton.addEventListener("click", async () => {
    if (!currentCode) return;

    try {
      await navigator.clipboard.writeText(currentCode);
      setMessage(resultMessage, "Codice copiato");
    } catch {
      setMessage(resultMessage, "Impossibile copiare automaticamente il codice", true);
    }
  });

  function resetSender() {
    stopSenderTimers();

    currentCode = null;
    currentExpiresAt = null;

    textContent.value = "";
    textSize.textContent = formatBytes(0);
    pdfFile.value = "";
    pdfFileName.textContent = "Nessun file selezionato";

    sendCode.textContent = "";
    sendQr.innerHTML = "";
    sendCountdown.textContent = "30:00";
    sendStatus.textContent = "In attesa del ritiro";
    sendStatus.classList.remove("is-delivered");

    cancelButton.disabled = false;
    cancelButton.textContent = "Annulla";
    cancelButton.dataset.action = "cancel";

    setMessage(sendMessage);
    setMessage(resultMessage);

    sendResult.hidden = true;
    sendForm.hidden = false;
    setSendMode("text");
    textContent.focus();
  }

  newPassButton.addEventListener("click", () => {
    // Il JustPass corrente resta attivo sul server fino a ritiro o scadenza.
    // Qui interrompiamo soltanto il monitoraggio locale e prepariamo un nuovo invio.
    resetSender();
  });

  cancelButton.addEventListener("click", async () => {
    if (cancelButton.dataset.action === "new") {
      resetSender();
      return;
    }

    if (!currentCode) return;

    cancelButton.disabled = true;
    setMessage(resultMessage, "Annullamento...");

    try {
      await apiJson({
        action: "cancel",
        code: currentCode,
      });

      stopSenderTimers();
      sendStatus.textContent = "Annullato";
      cancelButton.disabled = false;
      cancelButton.textContent = "Nuovo invio";
      cancelButton.dataset.action = "new";
      setMessage(resultMessage, "JustPass eliminato");
    } catch (error) {
      cancelButton.disabled = false;
      setMessage(
        resultMessage,
        error instanceof Error ? error.message : "Impossibile annullare",
        true
      );
    }
  });

  // =========================================================
  // RITIRO
  // =========================================================

  receiveCode.addEventListener("input", () => {
    receiveCode.value = normalizeCode(receiveCode.value);
    setMessage(receiveMessage);
  });

  receiveCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      claimButton.click();
    }
  });

  claimButton.addEventListener("click", async () => {
    const code = normalizeCode(receiveCode.value);
    receiveCode.value = code;

    setMessage(receiveMessage);

    if (!CODE_REGEX.test(code)) {
      setMessage(receiveMessage, "Inserisci un codice JustPass valido di 6 caratteri", true);
      return;
    }

    claimButton.disabled = true;
    claimButton.textContent = "Ritiro...";

    try {
      // Prima leggiamo solo i metadati per sapere se è testo o PDF.
      const info = await apiJson({
        action: "get",
        code,
      });

      if (info.item.type === "text") {
        await claimText(code);
      } else if (info.item.type === "pdf") {
        await claimPdf(code, info.item.filename || "documento.pdf");
      } else {
        throw new Error("Tipo JustPass non riconosciuto");
      }
    } catch (error) {
      setMessage(
        receiveMessage,
        error instanceof Error ? error.message : "Impossibile ritirare il JustPass",
        true
      );
    } finally {
      claimButton.disabled = false;
      claimButton.textContent = "Ritira";
    }
  });

  async function claimText(code) {
    const result = await apiJson({
      action: "claim",
      code,
    });

    receivedType.textContent = "TESTO RITIRATO";
    receivedText.value = result.content || "";

    receivedTextWrap.hidden = false;
    receivedPdfWrap.hidden = true;

    receiveForm.hidden = true;
    receiveResult.hidden = false;
  }

  async function claimPdf(code, fallbackFilename) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "claim",
        code,
      }),
    });

    if (!response.ok) {
      let message = "Impossibile scaricare il PDF";

      try {
        const data = await response.json();
        if (data.error) message = data.error;
      } catch {
        // Mantiene il messaggio generico.
      }

      throw new Error(message);
    }

    const blob = await response.blob();
    const filename = getDownloadFilename(response) || fallbackFilename;

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    receivedType.textContent = "PDF RITIRATO";
    receivedPdfName.textContent = filename;

    receivedTextWrap.hidden = true;
    receivedPdfWrap.hidden = false;

    receiveForm.hidden = true;
    receiveResult.hidden = false;
  }

  function getDownloadFilename(response) {
    const disposition = response.headers.get("content-disposition");
    if (!disposition) return null;

    const match = disposition.match(/filename="([^"]+)"/i);
    return match ? match[1] : null;
  }

  copyTextButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(receivedText.value);
      copyTextButton.textContent = "Copiato";

      setTimeout(() => {
        copyTextButton.textContent = "Copia";
      }, 1600);
    } catch {
      receivedText.focus();
      receivedText.select();
    }
  });

  receiveAnotherButton.addEventListener("click", () => {
    receiveResult.hidden = true;
    receiveForm.hidden = false;

    receiveCode.value = "";
    receivedText.value = "";
    receivedPdfName.textContent = "";

    setMessage(receiveMessage);
    receiveCode.focus();
  });

  // =========================================================
  // CODICE DA QR / URL
  // =========================================================

  const codeFromUrl = normalizeCode(
    new URLSearchParams(window.location.search).get("code") || ""
  );

  if (CODE_REGEX.test(codeFromUrl)) {
    receiveCode.value = codeFromUrl;

    window.setTimeout(() => {
      receiveCode.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      receiveCode.focus();
    }, 250);
  }
})();
