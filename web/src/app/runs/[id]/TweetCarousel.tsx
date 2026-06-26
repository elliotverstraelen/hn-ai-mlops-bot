"use client";

import { useState } from "react";
import type { Article } from "@/lib/db";

export default function TweetCarousel({ articles }: { articles: Article[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const items = articles.slice(0, 3);

  return (
    <div>
      <h3 className="text-base font-semibold mb-3">Generated tweets</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {items.map((article) => {
          const posted = !!article.tweet_id;
          const isExpanded = expanded === article.id;

          return (
            <div
              key={article.id}
              onClick={() => setExpanded(isExpanded ? null : article.id)}
              className={`snap-start shrink-0 flex flex-col gap-3 rounded-2xl p-4 border cursor-pointer transition-all duration-200 select-none
                ${isExpanded ? "w-96" : "w-72"}
                ${posted
                  ? "bg-black border-gray-800 hover:bg-gray-950"
                  : "bg-black border-gray-800 hover:bg-gray-950 opacity-75"
                }`}
            >
              {/* Header: avatar + name + X icon */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    E
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-bold text-sm leading-tight">Elliot Verstraelen</span>
                    <span className="text-gray-500 text-xs">@ElliotVerstrae1</span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-white shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>

              {/* Tweet text */}
              <p className={`text-white text-sm leading-relaxed ${isExpanded ? "" : "line-clamp-5"}`}>
                {article.summary}
              </p>

              {/* Footer: timestamp + status */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                <span className="text-gray-500 text-xs">
                  {new Date(article.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {posted ? (
                  <a
                    href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    View on X →
                  </a>
                ) : (
                  <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full">
                    Not posted
                  </span>
                )}
              </div>

              {/* Open on X button */}
              {posted && (
                <a
                  href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  View on X
                </a>
              )}

              {/* Action bar */}
              <div className="flex items-center justify-around text-gray-600">
                <button className="flex items-center gap-1.5 hover:text-sky-400 transition-colors" onClick={e => e.stopPropagation()}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" /></svg>
                  <span className="text-xs">Reply</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-green-400 transition-colors" onClick={e => e.stopPropagation()}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" /></svg>
                  <span className="text-xs">Repost</span>
                </button>
                <button className="flex items-center gap-1.5 hover:text-pink-400 transition-colors" onClick={e => e.stopPropagation()}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>
                  <span className="text-xs">Like</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
