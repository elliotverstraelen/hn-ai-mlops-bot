import Link from "next/link";
import { getRun, getArticles } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  const [run, articles] = await Promise.all([getRun(id), getArticles(id)]);

  if (!run) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm">
          ← All runs
        </Link>
        <h2 className="text-xl font-bold mt-2">
          Run #{run.id}{" "}
          <span className="text-gray-500 font-normal text-base">
            {new Date(run.started_at).toLocaleString()}
          </span>
        </h2>
      </div>

      {/* Run stats */}
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
