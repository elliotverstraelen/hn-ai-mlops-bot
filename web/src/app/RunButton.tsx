"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const router = useRouter();

  async function trigger() {
    setState("loading");
    try {
      const res = await fetch("/api/trigger", { method: "POST" });
      if (res.ok) {
        setState("done");
        router.refresh();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 5000);
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
