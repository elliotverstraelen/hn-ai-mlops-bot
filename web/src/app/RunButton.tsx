"use client";
import { useState } from "react";

export default function RunButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function trigger() {
    setState("loading");
    try {
      const res = await fetch("/api/trigger", { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 4000);
  }

  const label =
    state === "loading" ? "Queuing..." :
    state === "done"    ? "Queued! Bot runs within 30s" :
    state === "error"   ? "Error — try again" :
    "Run pipeline now";

  return (
    <button
      onClick={trigger}
      disabled={state === "loading"}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        state === "done"  ? "bg-green-600 text-white" :
        state === "error" ? "bg-red-600 text-white" :
        "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
      }`}
    >
      {label}
    </button>
  );
}
