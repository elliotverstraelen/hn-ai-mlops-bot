import Link from "next/link";
import { getRun, getArticles } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const Spinner = ({ className }: { className: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
        <Spinner className="w-3 h-3" />
        Preparing
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <Spinner className="w-3 h-3" />
        Running
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      Done
    </span>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  const [run, articles] = await Promise.all([getRun(id), getArticles(id)]);

  if (!run) notFound();

  const carouselItems = articles.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">
          ← All runs
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h2 className="text-xl font-bold">
            Run #{run.id}{" "}
            <span className="text-gray-500 font-normal text-base">
              {new Date(run.started_at).toLocaleString()}
            </span>
          </h2>
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Articles fetched", value: run.articles_fetched },
          { label: "Tweets posted", value: run.tweets_posted },
          { label: "Avg inference", value: `${run.avg_inference_seconds.toFixed(2)}s` },
          { label: "Total inference", value: `${run.total_inference_seconds.toFixed(2)}s` },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-2">
        <span className="text-gray-500 text-xs">MLflow run ID:</span>
        <span className="font-mono text-xs text-gray-300">{run.mlflow_run_id}</span>
      </div>

      {/* Tweet carousel */}
      {carouselItems.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">Generated tweets</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
            {carouselItems.map((article) => {
              const posted = !!article.tweet_id;
              const inner = (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${posted ? "text-sky-400" : "text-gray-500"}`}>
                      @ElliotVerstrae1
                    </span>
                    <svg className={`w-3.5 h-3.5 ml-auto ${posted ? "text-sky-400" : "text-gray-600"}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <p className={`text-sm leading-relaxed line-clamp-4 ${posted ? "text-gray-200" : "text-gray-400"}`}>
                    {article.summary}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-auto">{article.title}</p>
                  {posted ? (
                    <span className="text-xs text-sky-400 group-hover:text-sky-300">View on X →</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full w-fit">
                      Not posted
                    </span>
                  )}
                </>
              );
              return posted ? (
                <a
                  key={article.id}
                  href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="snap-start shrink-0 w-72 bg-gray-900 border border-gray-800 hover:border-sky-500/50 rounded-xl p-4 flex flex-col gap-2 transition-colors group"
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={article.id}
                  className="snap-start shrink-0 w-72 bg-gray-900 border border-gray-800 border-dashed rounded-xl p-4 flex flex-col gap-2"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Articles */}
      <div>
        <h3 className="text-base font-semibold mb-3">Articles processed in this run</h3>
        <div className="space-y-3">
          {articles.map((article) => (
            <div
              key={article.id}
              className="group bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Input</p>
                  <p className="font-medium text-white truncate">{article.title}</p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-3 py-1 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
                  >
                    Read article →
                  </a>
                  {article.tweet_id ? (
                  <a
                    href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs px-3 py-1 rounded-full"
                  >
                    View tweet →
                  </a>
                ) : (
                  <span className="shrink-0 bg-gray-700/50 border border-gray-700 text-gray-500 text-xs px-3 py-1 rounded-full">
                    Not posted
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  BART Summary (output)
                </p>
                <p className="text-gray-300 text-sm leading-relaxed">{article.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
