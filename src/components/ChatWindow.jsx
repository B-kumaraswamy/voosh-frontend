import axios from "axios";
import { useEffect, useRef, useState } from "react";

/**
 * ChatWindow: streaming-aware chat UI.
 * - Expects `sessionId` prop (string). If null, will show "create/select" message.
 * - Uses fetch + readable stream to parse SSE events sent by backend.
 *
 * Backend SSE events expected:
 *  event: session  -> { sessionId: '...' }           (sent once at start)
 *  event: message  -> { delta: 'text chunk' }        (one or more)
 *  event: done     -> { sessionId, answer, sources } (final payload)
 *
 * Note: this component intentionally avoids blocking alerts on transient parse errors.
 */
export default function ChatWindow({ sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamIndicator, setStreamIndicator] = useState(false); // small dot/etc
  const containerRef = useRef();
  const streamingAbortController = useRef(null);

  // load session messages when sessionId changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) {
        setMessages([]);
        return;
      }
      try {
        const resp = await axios.get(
          `/sessions/${encodeURIComponent(sessionId)}/messages`
        );
        const j = resp.data;
        if (cancelled) return;
        setMessages(j.messages || []);
        // scroll to bottom after render
        setTimeout(() => {
          containerRef.current?.scrollTo?.(
            0,
            containerRef.current.scrollHeight
          );
        }, 50);
      } catch (e) {
        console.error("load messages err", e);
        setMessages([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // helper to scroll to bottom
  function scrollToBottom() {
    setTimeout(() => {
      try {
        containerRef.current?.scrollTo?.({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      } catch (e) {
        /* ignore */
      }
    }, 50);
  }

  // Safely append a message
  function appendMessage(msg) {
    setMessages((m) => [...m, msg]);
    scrollToBottom();
  }

  // Replace the last assistant message (used while streaming to update text)
  function replaceLastAssistantText(newText) {
    setMessages((m) => {
      // find last assistant index
      const idx = [...m]
        .reverse()
        .findIndex((x) => x.role === "assistant" || x.role === "system");
      if (idx === -1) {
        // no assistant message yet -> append one
        return [...m, { role: "assistant", text: newText, ts: Date.now() }];
      }
      const pos = m.length - 1 - idx;
      const copy = m.slice();
      copy[pos] = { ...copy[pos], text: newText, ts: Date.now() };
      return copy;
    });
    scrollToBottom();
  }

  // Main send handler: uses streaming endpoint
  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    if (!sessionId) {
      alert("Please create/select a chat first.");
      return;
    }
    // optimistic user append
    appendMessage({ role: "user", text, ts: Date.now() });
    setInput("");
    setIsStreaming(true);
    setStreamIndicator(true);

    // append assistant placeholder
    appendMessage({ role: "assistant", text: "", ts: Date.now() });

    // Abort previous stream (if any)
    if (streamingAbortController.current) {
      try {
        streamingAbortController.current.abort();
      } catch (e) {}
      streamingAbortController.current = null;
    }
    const ac = new AbortController();
    streamingAbortController.current = ac;

    try {
      const resp = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, stream: true }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        // Show non-blocking error message as system message
        replaceLastAssistantText("");
        appendMessage({
          role: "system",
          text: `⚠️ Send failed: ${resp.status} ${resp.statusText} ${txt}`,
          ts: Date.now(),
        });
        setIsStreaming(false);
        setStreamIndicator(false);
        return;
      }

      // read stream and parse SSE-like events
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantBuffer = "";

      // Simple SSE parser: process message blocks separated by blank line
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split into complete blocks; the last element may be incomplete -> keep in buffer
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop(); // leftover

        for (const block of blocks) {
          // each block could be lines like "event: message" and "data: {...}"
          const lines = block
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          let evt = null;
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith("event:")) {
              evt = line.replace(/^event:\s*/, "");
            } else if (line.startsWith("data:")) {
              dataLines.push(line.replace(/^data:\s*/, ""));
            } else {
              // sometimes chunks may come without "event:" (treat as message data)
              dataLines.push(line);
            }
          }
          const rawData = dataLines.join("\n");
          let parsed = rawData;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            // if not JSON, keep raw string
            parsed = rawData;
          }

          const effectiveEvent = evt || "message";

          // Handle events
          if (effectiveEvent === "session") {
            // optional: backend returns sessionId — could update local state or notify parent
            // e.g. parsed.sessionId
            // If you want to update local selection/storage, do it here.
            // For now we just log.
            // console.log("session event:", parsed);
          } else if (effectiveEvent === "message") {
            // parsed may be { delta: 'chunk' } or a string chunk
            const delta =
              typeof parsed === "object"
                ? parsed.delta || parsed.data || ""
                : parsed;
            assistantBuffer += delta;
            // update assistant bubble incrementally
            replaceLastAssistantText(assistantBuffer);
          } else if (effectiveEvent === "done") {
            // parsed commonly contains final answer and maybe sources
            const finalText =
              typeof parsed === "object"
                ? parsed.answer || parsed.text || assistantBuffer
                : parsed;
            assistantBuffer = finalText;
            replaceLastAssistantText(assistantBuffer);
            // optionally handle sources: parsed.sources
          } else if (effectiveEvent === "error") {
            // append system error info non-blocking
            appendMessage({
              role: "system",
              text: `⚠️ ${parsed?.error || parsed}`,
              ts: Date.now(),
            });
          } else {
            // unknown event => append as system info
            // appendMessage({ role: "system", text: `[${effectiveEvent}] ${JSON.stringify(parsed)}`, ts: Date.now() });
          }
        }
      }

      // after stream finished, if there is leftover buffer, try parse it
      if (buffer.trim()) {
        try {
          // try parse remaining as one block
          const lines = buffer
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          let evt = null;
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith("event:")) evt = line.replace(/^event:\s*/, "");
            else if (line.startsWith("data:"))
              dataLines.push(line.replace(/^data:\s*/, ""));
            else dataLines.push(line);
          }
          const raw = dataLines.join("\n");
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {}
          const effectiveEvent = evt || "message";
          if (effectiveEvent === "message") {
            const delta =
              typeof parsed === "object"
                ? parsed.delta || parsed.data || ""
                : parsed;
            assistantBuffer += delta;
            replaceLastAssistantText(assistantBuffer);
          } else if (effectiveEvent === "done") {
            const finalText =
              typeof parsed === "object"
                ? parsed.answer || parsed.text || assistantBuffer
                : parsed;
            assistantBuffer = finalText;
            replaceLastAssistantText(assistantBuffer);
          }
        } catch (e) {
          console.warn("leftover parse failed", e);
        }
      }

      // done reading. mark not streaming
      setIsStreaming(false);
      setStreamIndicator(false);
      streamingAbortController.current = null;

      // scroll final content into view
      scrollToBottom();
    } catch (err) {
      // network/abort/parsing error: do not show blocking alert — append system message
      console.error("streaming send err", err);
      replaceLastAssistantText("");
      appendMessage({
        role: "system",
        text: `⚠️ Stream error: ${err.message || err}`,
        ts: Date.now(),
      });
      setIsStreaming(false);
      setStreamIndicator(false);
      streamingAbortController.current = null;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        color: "white",
      }}
    >
      <header style={{ padding: 16, fontSize: 24 }}>
        RAG Chat{" "}
        {streamIndicator ? (
          <span style={{ marginLeft: 8, color: "#7ff" }}>●</span>
        ) : null}
      </header>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          background: "#041025",
        }}
      >
        {!sessionId && (
          <div style={{ color: "#888", textAlign: "center", marginTop: 40 }}>
            Please create/select a chat first.
          </div>
        )}

        {messages.length === 0 && sessionId && (
          <div style={{ color: "#888", textAlign: "center", marginTop: 40 }}>
            No messages yet — say hi 👋
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                background:
                  m.role === "user"
                    ? "#0b3353"
                    : m.role === "assistant"
                    ? "#031a2b"
                    : "#2b2b2b",
                color: "#fff",
                padding: 12,
                borderRadius: 8,
                maxWidth: "78%",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.role === "assistant" && m.text === "" && isStreaming ? (
                <div
                  style={{ display: "flex", alignItems: "center" }}
                  role="status"
                  aria-live="polite"
                >
                  <span className="thinking-label">Thinking…</span>
                  <span className="spinner" />
                </div>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid rgba(255,255,255,0.03)",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          className="text-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming) handleSend();
            }
          }}
          placeholder="Type your question..."
          disabled={isStreaming}
          style={{ flex: 1 }}
        />

        <button
          className="btn"
          onClick={() => !isStreaming && handleSend()}
          disabled={!input.trim() || isStreaming}
        >
          {isStreaming ? "Streaming..." : "Send"}
        </button>
      </div>
    </div>
  );
}
