const ALLOWED_ORIGINS = new Set([
  "https://atralab.it",
  "https://www.atralab.it",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://atralab.it";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function cleanPhrase(value: unknown) {
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

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getSupabaseSecretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) throw new Error("SUPABASE_SECRET_KEYS mancante");

  const keys = JSON.parse(raw);
  const secretKey = keys.default ?? Object.values(keys)[0];

  if (!secretKey || typeof secretKey !== "string") {
    throw new Error("Secret key Supabase non trovata");
  }

  return secretKey;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL mancante");

    const supabaseSecretKey = getSupabaseSecretKey();
    const body = await req.json();

    const phrase = cleanPhrase(body.phrase);
    const phraseNumber = Number(body.phrase_number);
    const elapsedSeconds = Number(body.elapsed_seconds);
    const playDate = typeof body.play_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.play_date)
      ? body.play_date
      : getRomeDate();

    if (!phrase || phrase.length > 140) {
      return jsonResponse(req, { error: "INVALID_PHRASE" }, 400);
    }

    if (!Number.isInteger(phraseNumber) || phraseNumber < 1 || phraseNumber > 50) {
      return jsonResponse(req, { error: "INVALID_PHRASE_NUMBER" }, 400);
    }

    if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 1 || elapsedSeconds > 86400) {
      return jsonResponse(req, { error: "INVALID_ELAPSED_TIME" }, 400);
    }

    const saveResponse = await fetch(
      `${supabaseUrl}/rest/v1/mystery_phrase_results?on_conflict=play_date%2Cphrase_number`,
      {
        method: "POST",
        headers: {
          "apikey": supabaseSecretKey,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          play_date: playDate,
          phrase_number: phraseNumber,
          phrase,
          elapsed_seconds: elapsedSeconds,
          solved_at: new Date().toISOString(),
        }),
      },
    );

    if (!saveResponse.ok) {
      console.error("Errore salvataggio risultato", await saveResponse.text());
      return jsonResponse(req, { error: "SAVE_FAILED" }, 500);
    }

    return jsonResponse(req, { saved: true });
  } catch (error) {
    console.error(error);
    return jsonResponse(req, { error: "INTERNAL_ERROR" }, 500);
  }
});
