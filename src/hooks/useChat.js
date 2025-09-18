// src/hooks/useChat.js
import { useCallback, useRef, useState } from "react";
import { postChat, postChatStream } from "../api/chat";

export function useChat({ initialSessionId = null } = {}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text, ts }
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState([]);
  const abortRef = useRef(null);

  const appendMessage = useCallback((m) => {
    setMessages((s) => [...s, { ...m, ts: Date.now() }]);
  }, []);

  const send = useCallback(async ({ message, stream = false }) => {
    setLoading(true);
    // push user msg locally
    appendMessage({ role: "user", text: message });

    try {
      if (!stream) {
        const resp = await postChat({ message, sessionId });
        setSessionId(resp.sessionId || sessionId);
        appendMessage({ role: "assistant", text: resp.answer || "" });
        setSources(resp.sources || []);
        setLoading(false);
        return resp;
      }

      // streaming
      const controller = new AbortController();
      abortRef.current = controller;

      // append empty assistant message that we'll mutate progressively
      appendMessage({ role: "assistant", text: "" });

      let assistantIndex = null;
      // find index of last assistant message (we just pushed it)
      setMessages((prev) => {
        assistantIndex = prev.length - 1;
        return prev;
      });

      const onEvent = ({ event, data }) => {
        if (event === "session" && data?.sessionId) {
          setSessionId(data.sessionId);
        } else if (event === "message") {
          // incremental chunk: append to last assistant message
          setMessages((prev) => {
            // safe guard: copy prev
            const copy = prev.slice();
            // find last assistant message index
            let idx = copy.map((m) => m.role).lastIndexOf("assistant");
            if (idx === -1) {
              // if not found, push new
              copy.push({ role: "assistant", text: data || "" });
            } else {
              copy[idx] = { ...copy[idx], text: (copy[idx].text || "") + (typeof data === "string" ? data : String(data)) };
            }
            return copy;
          });
        } else if (event === "done") {
          // final payload: may include sessionId, answer, sources
          if (data?.sessionId) setSessionId(data.sessionId);
          if (data?.answer) {
            // replace last assistant msg with final answer
            setMessages((prev) => {
              const copy = prev.slice();
              let idx = copy.map((m) => m.role).lastIndexOf("assistant");
              if (idx === -1) {
                copy.push({ role: "assistant", text: data.answer });
              } else {
                copy[idx] = { ...copy[idx], text: data.answer };
              }
              return copy;
            });
          }
          if (Array.isArray(data?.sources)) setSources(data.sources);
          setLoading(false);
        } else if (event === "error") {
          const errText = data?.error ? String(data.error) : "Unknown stream error";
          setMessages((prev) => {
            const copy = prev.slice();
            const idx = copy.map((m) => m.role).lastIndexOf("assistant");
            if (idx !== -1) {
              copy[idx] = { ...copy[idx], text: (copy[idx].text || "") + `\n\n[Error: ${errText}]` };
            } else {
              copy.push({ role: "assistant", text: `[Error: ${errText}]` });
            }
            return copy;
          });
          setLoading(false);
        }
      };

      const doneData = await postChatStream({
        message,
        sessionId,
        onEvent,
        signal: controller.signal,
      });

      // fallback: if doneData contains final answer or sources, ensure state updated
      if (doneData?.answer) {
        setMessages((prev) => {
          const copy = prev.slice();
          let idx = copy.map((m) => m.role).lastIndexOf("assistant");
          if (idx === -1) copy.push({ role: "assistant", text: doneData.answer });
          else copy[idx] = { ...copy[idx], text: doneData.answer };
          return copy;
        });
      }
      if (doneData?.sources) setSources(doneData.sources);
      setSessionId((s) => s || doneData?.sessionId || sessionId);
      setLoading(false);
      return doneData;
    } catch (err) {
      setLoading(false);
      // append error as assistant text
      appendMessage({ role: "assistant", text: `Error: ${err.message || err}` });
      throw err;
    }
  }, [appendMessage, sessionId]);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
    }
  }, []);

  const reset = useCallback(async () => {
    // If your backend has DELETE /session/:id implement here
    if (!sessionId) {
      setMessages([]);
      setSources([]);
      return;
    }
    try {
      await fetch(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"}/session/${sessionId}`, { method: "DELETE" });
    } catch (e) { /* ignore */ }
    setMessages([]);
    setSources([]);
    setSessionId(null);
  }, [sessionId]);

  return {
    sessionId,
    messages,
    loading,
    sources,
    send,
    cancelStream,
    reset,
  };
}
