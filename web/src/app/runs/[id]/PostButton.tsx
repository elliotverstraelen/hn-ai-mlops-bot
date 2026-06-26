"use client";
import { useState } from "react";

export default function PostButton({ articleId }: { articleId: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [tweetId, setTweetId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePost() {
    setStatus("loading");
    const res = await fetch(`/api/articles/${articleId}/post`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setTweetId(data.tweet_id);
      setStatus("done");
    } else {
      setErrorMsg(data.error ?? "Failed");
      setStatus("error");
    }
  }

  if (status === "done" && tweetId) {
    return (
      <a
        href={`https://twitter.com/i/web/status/${tweetId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs px-3 py-1 rounded-full"
      >
        View tweet →
      </a>
    );
  }

  if (status === "error") {
    return (
      <span
        title={errorMsg ?? undefined}
        className="shrink-0 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-1 rounded-full cursor-help"
      >
        Failed to post
      </span>
    );
  }

  return (
    <button
      onClick={handlePost}
      disabled={status === "loading"}
      className="shrink-0 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:text-orange-300 hover:border-orange-400/50 text-xs px-3 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {status === "loading" ? "Posting…" : "Post now →"}
    </button>
  );
}
