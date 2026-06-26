import Link from "next/link";
import { getRuns, getStats } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default async function HomePage() {
  const [stats, runs] = await Promise.all([getStats(), getRuns()]);

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Runs", value: stats.totalRuns },
          { label: "Tweets Posted", value: stats.totalTweets },
          { label: "Articles Processed", value: stats.totalArticles },
          { label: "Avg Inference", value: `${fmt(stats.avgInference)}s` },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Runs table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Bot Runs</h2>
        {runs.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
            No runs yet — the bot posts every 6 hours.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                  <th className="text-left px-4 py-3">Time</th>
                  <th className="text-left px-4 py-3">Articles</th>
                  <th className="text-left px-4 py-3">Tweets</th>
                  <th className="text-left px-4 py-3">Avg inference</th>
                  <th className="text-left px-4 py-3">MLflow run</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr
                    key={run.id}
                    className={`border-b border-gray-800 last:border-0 hover:bg-gray-800 transition-colors ${
                      i === 0 ? "bg-gray-800/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-300">{timeAgo(run.started_at)}</td>
                    <td className="px-4 py-3">{run.articles_fetched}</td>
                    <td className="px-4 py-3">{run.tweets_posted}</td>
                    <td className="px-4 py-3 text-gray-300">{fmt(run.avg_inference_seconds)}s</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500">
                        {run.mlflow_run_id?.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/runs/${run.id}`}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs text-center">
        Refreshes every 60 seconds · Model: facebook/bart-large-cnn via HuggingFace Inference API
      </p>
    </div>
  );
}
