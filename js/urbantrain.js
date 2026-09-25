const ASTRAL_BASE =
  "https://gestionecorse.astralspa.it/api";

const REFRESH_MS = 60 * 1000;

// Durata reale media provvisoria Montebello ↔ Flaminio.
// ASTRAL pubblica un tempo teorico totale di 25 minuti.
const REAL_TRAVEL_MINUTES = 30;

const DIRECTIONS = [
  {
    id: "monrm",
    route: "RN_MONRM",
    originStop: "ff900036",
    containerId: "direction-monrm"
  },
  {
    id: "rmmon",
    route: "RN_RMMON",
    originStop: "ff900027",
    containerId: "direction-rmmon"
  }
];

const state = {
  stops: {},
  refreshing: false
};

const updatedEl =
  document.getElementById("urbantrainUpdated");

const errorEl =
  document.getElementById("urbantrainError");


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function parseClock(clock) {
  const [hours, minutes] =
    String(clock ?? "")
      .split(":")
      .map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return null;
  }

  return (hours * 60) + minutes;
}


function minutesNowRome() {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Europe/Rome",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).formatToParts(new Date());

  const hour =
    Number(
      parts.find(
        (part) => part.type === "hour"
      )?.value
    );

  const minute =
    Number(
      parts.find(
        (part) => part.type === "minute"
      )?.value
    );

  return (hour * 60) + minute;
}


function formatRomeTime(date = new Date()) {
  return new Intl.DateTimeFormat(
    "it-IT",
    {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}


function parseDurationMinutes(value) {
  const [hours, minutes] =
    String(value ?? "00:00")
      .split(":")
      .map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return 0;
  }

  return (hours * 60) + minutes;
}


async function postJson(url, body) {
  const response =
    await fetch(
      url,
      {
        method: "POST",
        headers: {
          "Accept":
            "application/json, text/plain, */*",
          "Content-Type":
            "application/json;charset=UTF-8"
        },
        body: JSON.stringify(body)
      }
    );

  if (!response.ok) {
    throw new Error(
      `ASTRAL HTTP ${response.status}`
    );
  }

  return response.json();
}


async function fetchStops(route) {
  return postJson(
    `${ASTRAL_BASE}/fermate/${route}`,
    {
      "Content-Type": "application/json"
    }
  );
}


async function fetchTransit(
  route,
  stopCode
) {
  return postJson(
    `${ASTRAL_BASE}/transit`,
    {
      percorso: route,
      fermata: stopCode
    }
  );
}


function getEstimatedTrains(
  runs,
  stops
) {
  const now =
    minutesNowRome();

  const astralFinalOffset =
    Math.max(
      ...stops.map(
        (stop) =>
          parseDurationMinutes(
            stop.tToNext
          )
      ),
      0
    );

  const timeScale =
    astralFinalOffset > 0
      ? REAL_TRAVEL_MINUTES /
        astralFinalOffset
      : 1;

  return runs
    .filter(
      (run) =>
        run?.soppressa !== "S" &&
        run?.busSostitutivo !== "S"
    )
    .map((run) => {
      const start =
        parseClock(
          run.oraInizio
        );

      if (start === null) {
        return null;
      }

      const delay =
        Math.max(
          0,
          Number.parseInt(
            run.ritardo,
            10
          ) || 0
        );

      const estimatedStart =
        start + delay;

      const estimatedEnd =
        estimatedStart +
        REAL_TRAVEL_MINUTES;

      if (
        now < estimatedStart ||
        now >= estimatedEnd
      ) {
        return null;
      }

      let lastStop =
        stops[0];

      let nextStop =
        stops[1] ?? null;

      for (
        let index = 0;
        index < stops.length;
        index++
      ) {
        const stop =
          stops[index];

        const passTime =
          estimatedStart +
          (
            parseDurationMinutes(
              stop.tToNext
            ) *
            timeScale
          );

        if (passTime <= now) {
          lastStop = stop;
          nextStop =
            stops[index + 1] ??
            null;
        } else {
          break;
        }
      }

      if (!nextStop) {
        return null;
      }

      const nextPass =
        estimatedStart +
        (
          parseDurationMinutes(
            nextStop.tToNext
          ) *
          timeScale
        );

      return {
        corsa: run.corsa,
        oraInizio: run.oraInizio,
        delay,
        lastStop:
          lastStop.nomeFermata,
        nextStop:
          nextStop.nomeFermata,
        minutesToNext:
          Math.max(
            0,
            Math.ceil(
              nextPass - now
            )
          )
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        parseClock(a.oraInizio) -
        parseClock(b.oraInizio)
    );
}


function renderDirection(
  direction,
  trains
) {
  const container =
    document.getElementById(
      direction.containerId
    );

  if (!container) {
    return;
  }

  if (!trains.length) {
    container.innerHTML = `
      <div class="urbantrain-empty">
        Nessun treno in viaggio stimato
        in questo momento.
      </div>
    `;
    return;
  }

  container.innerHTML =
    trains
      .map(
        (train) => `
          <article class="urbantrain-train">
            <div class="urbantrain-train-main">
              <div class="urbantrain-train-top">
                <span
                  class="urbantrain-train-icon"
                  aria-hidden="true"
                >
                  🚆
                </span>

                <span class="urbantrain-corsa">
                  Corsa ${escapeHtml(
                    train.corsa
                  )}
                </span>
              </div>

              <p class="urbantrain-path">
                ${escapeHtml(
                  train.lastStop
                )}
                →
                ${escapeHtml(
                  train.nextStop
                )}
              </p>

              <p class="urbantrain-next">
                Prossima:
                <strong>
                  ${escapeHtml(
                    train.nextStop
                  )}
                </strong>
                · circa
                ${
                  train.minutesToNext === 0
                    ? "meno di 1 min"
                    : `${train.minutesToNext} min`
                }
              </p>
            </div>

            <div class="urbantrain-meta">
              <span
                class="urbantrain-delay ${
                  train.delay === 0
                    ? "is-on-time"
                    : ""
                }"
              >
                ${
                  train.delay === 0
                    ? "In orario"
                    : `+${train.delay} min`
                }
              </span>

              <span class="urbantrain-start">
                Partenza
                ${escapeHtml(
                  train.oraInizio
                )}
              </span>
            </div>
          </article>
        `
      )
      .join("");
}


async function loadStops() {
  const results =
    await Promise.all(
      DIRECTIONS.map(
        async (direction) => {
          const stops =
            await fetchStops(
              direction.route
            );

          const sorted =
            [...stops].sort(
              (a, b) =>
                Number(a.ordine) -
                Number(b.ordine)
            );

          state.stops[
            direction.route
          ] = sorted;
        }
      )
    );

  return results;
}


async function refreshLive() {
  if (state.refreshing) {
    return;
  }

  state.refreshing = true;

  try {
    errorEl.hidden = true;

    const results =
      await Promise.all(
        DIRECTIONS.map(
          async (direction) => {
            const runs =
              await fetchTransit(
                direction.route,
                direction.originStop
              );

            const trains =
              getEstimatedTrains(
                runs,
                state.stops[
                  direction.route
                ] ?? []
              );

            return {
              direction,
              trains
            };
          }
        )
      );

    results.forEach(
      ({ direction, trains }) =>
        renderDirection(
          direction,
          trains
        )
    );

    updatedEl.textContent =
      `Aggiornato alle ${
        formatRomeTime()
      }`;

  } catch (error) {
    console.error(
      "UrbanTrain:",
      error
    );

    errorEl.hidden = false;
    errorEl.textContent =
      "Non riesco a leggere i dati ASTRAL in questo momento.";

    updatedEl.textContent =
      "Aggiornamento non riuscito";
  } finally {
    state.refreshing = false;
  }
}


async function initUrbanTrain() {
  try {
    await loadStops();
    await refreshLive();

    window.setInterval(
      refreshLive,
      REFRESH_MS
    );
  } catch (error) {
    console.error(
      "UrbanTrain:",
      error
    );

    errorEl.hidden = false;
    errorEl.textContent =
      "Non riesco a caricare i dati della linea ASTRAL.";

    updatedEl.textContent =
      "Aggiornamento non riuscito";
  }
}


initUrbanTrain();
