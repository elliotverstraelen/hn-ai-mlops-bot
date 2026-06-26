import Link from "next/link";
import { getRun, getArticles } from "@/lib/db";
import { notFound } from "next/navigation";
import TweetCarousel from "./TweetCarousel";
import PostButton from "./PostButton";

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
          { label: "Generated", value: run.articles_fetched },
          { label: "Avg inference", value: run.avg_inference_seconds > 0 ? `${run.avg_inference_seconds.toFixed(2)}s` : "N/A" },
          { label: "Run cost", value: run.total_cost_usd && run.total_cost_usd > 0 ? `$${run.total_cost_usd.toFixed(4)}` : "N/A" },
          { label: "Avg quality", value: run.avg_quality_score && run.avg_quality_score > 0 ? `${run.avg_quality_score.toFixed(1)}/10` : "N/A" },
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
      {articles.length > 0 && <TweetCarousel articles={articles} />}

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
                  <PostButton articleId={article.id} />
                )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  GPT-4o-mini output
                </p>
                <p className="text-gray-300 text-sm leading-relaxed">{article.summary}</p>
                {article.quality_score != null && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-500">Quality score:</span>
                    <span className={`text-xs font-semibold ${
                      article.quality_score >= 7 ? "text-green-400" :
                      article.quality_score >= 5 ? "text-yellow-400" : "text-red-400"
                    }`}>{article.quality_score}/10</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
