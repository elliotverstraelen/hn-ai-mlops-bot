import Link from "next/link";
import { getRun, getArticles } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
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

  const tweeted = articles.filter((a) => a.tweet_id);

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
      {tweeted.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">Tweets posted</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
            {tweeted.map((article) => (
              <a
                key={article.tweet_id}
                href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="snap-start shrink-0 w-72 bg-gray-900 border border-gray-800 hover:border-sky-500/50 rounded-xl p-4 flex flex-col gap-2 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sky-400 text-xs font-medium">@ElliotVerstrae1</span>
                  <svg className="w-3.5 h-3.5 text-sky-400 ml-auto" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed line-clamp-4">{article.summary}</p>
                <p className="text-xs text-gray-500 truncate mt-auto">{article.title}</p>
                <span className="text-xs text-sky-400 group-hover:text-sky-300">View on X →</span>
              </a>
            ))}
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
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Input</p>
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-white hover:text-blue-400 truncate block"
                  >
                    {article.title}
                  </a>
                </div>
                {article.tweet_id && (
                  <a
                    href={`https://twitter.com/i/web/status/${article.tweet_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs px-3 py-1 rounded-full"
                  >
                    View tweet →
                  </a>
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
