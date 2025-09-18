// src/api/chat.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/**
 * Non-streaming helper: simple POST that returns JSON
 */
export async function postChat({ message, sessionId }) {
  const url = `${API_BASE}/chat`;
  const resp = await axios.post(
    url,
    { message, sessionId, stream: false },
    {
      headers: { "Content-Type": "application/json" },
    }
  );
  return resp.data; // { sessionId, answer, sources }
}

/**
 * Streaming helper: POST then read response body as text stream and parse SSE-style events.
 * onEvent is called with { event, data } where data is parsed JSON if possible, else string.
 * Returns a promise that resolves to final done data (the parsed data object) or rejects on error.
 */
export async function postChatStream({ message, sessionId, onEvent, signal }) {
  const url = `${API_BASE}/chat`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, stream: true }),
    signal,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(
      `Stream request failed: ${resp.status} ${resp.statusText} ${txt}`
    );
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneData = null;

  function parseChunkLines(text) {
    // break into lines; SSE chunks come as lines "event: name\n data: payload\n\n"
    const parts = text.split(/\r?\n/);
    return parts;
  }

  // simple SSE parser state: collect last event/data until blank line
  let currentEvent = null;
  let currentDataLines = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // process any complete SSE messages (ending with double newline)
    // We'll split on "\n\n" to get message blocks
    let blocks = buffer.split(/\r?\n\r?\n/);
    // keep last (possibly incomplete) in buffer
    buffer = blocks.pop();

    for (const block of blocks) {
      // parse lines
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      let evt = null;
      let dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          evt = line.replace(/^event:\s*/, "");
        } else if (line.startsWith("data:")) {
          dataLines.push(line.replace(/^data:\s*/, ""));
        }
      }
      const dataRaw = dataLines.join("\n");
      let parsed = dataRaw;
      try {
        parsed = JSON.parse(dataRaw);
      } catch (e) {
        // keep raw string
      }
      // call callback
      onEvent?.({ event: evt || "message", data: parsed });
      if ((evt || "message") === "done") {
        doneData = parsed;
      }
    }
  }

  // If there was remaining buffered data after the stream ended, attempt parsing once more
  if (buffer.trim()) {
    const lines = buffer
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    let evt = null;
    let dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        evt = line.replace(/^event:\s*/, "");
      } else if (line.startsWith("data:")) {
        dataLines.push(line.replace(/^data:\s*/, ""));
      }
    }
    const dataRaw = dataLines.join("\n");
    let parsed = dataRaw;
    try {
      parsed = JSON.parse(dataRaw);
    } catch (e) {
      /* noop */
    }
    onEvent?.({ event: evt || "message", data: parsed });
    if ((evt || "message") === "done") doneData = parsed;
  }

  return doneData;
}
