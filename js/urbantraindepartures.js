const ASTRAL_TRANSIT_URL =
  "https://gestionecorse.astralspa.it/api/transit";

const REFRESH_MS = 60 * 1000;
const UPCOMING_LIMIT = 8;

const DEPARTURES = [
  {
    id: "montebello",
    route: "RN_MONRM",
    stop: "ff900036",
    containerId: "departures-montebello"
  },
  {
    id: "flaminio",
    route: "RN_RMMON",
    stop: "ff900027",
    containerId: "departures-flaminio"
  }
];

const updatedEl =
  document.getElementById("utdUpdated");

const errorEl =
  document.getElementById("utdError");

let refreshing = false;


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


function formatClock(totalMinutes) {
  const normalized =
    ((totalMinutes % 1440) + 1440) % 1440;

  const hours =
    Math.floor(normalized / 60);

  const minutes =
    normalized % 60;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0")
  );
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


async function fetchDepartures(
  route,
  stop
) {
  const response =
    await fetch(
      ASTRAL_TRANSIT_URL,
      {
        method: "POST",

        headers: {
          "Accept":
            "application/json, text/plain, */*",

          "Content-Type":
            "application/json;charset=UTF-8"
        },

        body: JSON.stringify({
          percorso: route,
          fermata: stop
        })
      }
    );

  if (!response.ok) {
    throw new Error(
      `ASTRAL HTTP ${response.status}`
    );
  }

  return response.json();
}


function normalizeRuns(runs) {
  return runs
    .map((run) => {
      const scheduled =
        parseClock(run.oraInizio);

      if (scheduled === null) {
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

      return {
        ...run,
        scheduled,
        delay,
        estimated:
          scheduled + delay,
        estimatedClock:
          formatClock(
            scheduled + delay
          ),
        cancelled:
          run.soppressa === "S",
        bus:
          run.busSostitutivo === "S"
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.scheduled - b.scheduled
    );
}


function timeChip(run, now) {
  const classes = [
    "utd-time",
    run.estimated >= now
      ? "is-future"
      : "",
    run.cancelled
      ? "is-cancelled"
      : "",
    run.bus
      ? "is-bus"
      : ""
  ]
    .filter(Boolean)
    .join(" ");

  const timeText =
    run.delay > 0
      ? run.estimatedClock
      : formatClock(run.scheduled);

  return `
    <span class="${classes}">
      ${escapeHtml(timeText)}
      ${
        run.delay > 0
          ? `
            <span class="utd-time-delay">
              +${run.delay}
            </span>
          `
          : ""
      }
    </span>
  `;
}


function renderPanel(
  config,
  runs
) {
  const container =
    document.getElementById(
      config.containerId
    );

  if (!container) {
    return;
  }

  const now =
    minutesNowRome();

  const usable =
    runs.filter(
      (run) =>
        !run.cancelled &&
        !run.bus
    );

  const nextRun =
    usable.find(
      (run) =>
        run.estimated >= now
    );

  if (!nextRun) {
    container.innerHTML = `
      <div class="utd-empty">
        Nessun'altra partenza prevista oggi.
      </div>
    `;
    return;
  }

  const minutesToNext =
    Math.max(
      0,
      nextRun.estimated - now
    );

  const upcoming =
    usable
      .filter(
        (run) =>
          run.estimated >=
          nextRun.estimated
      )
      .slice(
        1,
        UPCOMING_LIMIT + 1
      );

  const allId =
    `utd-all-${config.id}`;

  const buttonId =
    `utd-toggle-${config.id}`;

  container.innerHTML = `
    <div class="utd-next">
      <div>
        <span class="utd-next-label">
          Prossima partenza
        </span>

        <h3 class="utd-next-time">
          ${escapeHtml(
            nextRun.estimatedClock
          )}
        </h3>

        <p class="utd-next-meta">
          Corsa ${escapeHtml(nextRun.corsa)}
          ${
            nextRun.delay > 0
              ? ` · prevista +${nextRun.delay} min`
              : " · in orario"
          }
        </p>
      </div>

      <div class="utd-countdown">
        ${
          minutesToNext === 0
            ? "in partenza"
            : `tra ${minutesToNext} min`
        }
      </div>
    </div>

    <div class="utd-upcoming">
      <p class="utd-upcoming-title">
        Prossime
      </p>

      <div class="utd-times">
        ${
          upcoming.length
            ? upcoming
                .map(
                  (run) =>
                    timeChip(run, now)
                )
                .join("")
            : `
              <span class="utd-time">
                —
              </span>
            `
        }
      </div>
    </div>

    <button
      id="${buttonId}"
      class="utd-toggle"
      type="button"
      aria-expanded="false"
      aria-controls="${allId}"
    >
      Mostra tutta la giornata
    </button>

    <div
      id="${allId}"
      class="utd-all-day"
      hidden
    >
      <div class="utd-times">
        ${runs
          .map(
            (run) =>
              timeChip(run, now)
          )
          .join("")}
      </div>
    </div>
  `;

  const button =
    document.getElementById(
      buttonId
    );

  const allDay =
    document.getElementById(
      allId
    );

  button?.addEventListener(
    "click",
    () => {
      const open =
        button.getAttribute(
          "aria-expanded"
        ) === "true";

      button.setAttribute(
        "aria-expanded",
        String(!open)
      );

      allDay.hidden = open;

      button.textContent =
        open
          ? "Mostra tutta la giornata"
          : "Nascondi tutta la giornata";
    }
  );
}


async function refreshDepartures() {
  if (refreshing) {
    return;
  }

  refreshing = true;

  try {
    errorEl.hidden = true;

    const results =
      await Promise.all(
        DEPARTURES.map(
          async (config) => {
            const raw =
              await fetchDepartures(
                config.route,
                config.stop
              );

            return {
              config,
              runs: normalizeRuns(raw)
            };
          }
        )
      );

    results.forEach(
      ({ config, runs }) =>
        renderPanel(
          config,
          runs
        )
    );

    updatedEl.textContent =
      `Aggiornato alle ${
        formatRomeTime()
      }`;

  } catch (error) {
    console.error(
      "UrbanTrain Departures:",
      error
    );

    errorEl.hidden = false;
    errorEl.textContent =
      "Non riesco a leggere le partenze ASTRAL in questo momento.";

    updatedEl.textContent =
      "Aggiornamento non riuscito";
  } finally {
    refreshing = false;
  }
}


refreshDepartures();

window.setInterval(
  refreshDepartures,
  REFRESH_MS
);
