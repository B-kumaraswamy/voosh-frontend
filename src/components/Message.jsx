// src/components/Message.jsx
import React from "react";

export default function Message({ role, text }) {
  const cls = role === "user" ? "msg user" : "msg assistant";
  return (
    <div className={cls}>
      <div className="msg-body">
        <pre style={{whiteSpace: "pre-wrap"}}>{text}</pre>
      </div>
    </div>
  );
}
