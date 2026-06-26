import Link from "next/link";
import { getRuns, getStats } from "@/lib/db";
import RunButton from "./RunButton";
import AutoRefresh from "./AutoRefresh";

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

const Spinner = ({ className }: { className: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
        <Spinner className="w-3 h-3" />
        Preparing
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
        <Spinner className="w-3 h-3" />
        Running
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      Done
    </span>
  );
}

export default async function HomePage() {
  const [stats, runs] = await Promise.all([getStats(), getRuns()]);
  const hasRunning = runs.some((r) => r.status === "running" || r.status === "pending");

  return (
    <div className="space-y-8">
      <AutoRefresh hasRunning={hasRunning} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Runs", value: stats.totalRuns },
          { label: "Tweets Generated", value: stats.totalArticles },
          { label: "Avg Inference", value: stats.avgInference > 0 ? `${fmt(stats.avgInference)}s` : "N/A" },
          { label: "Total Spend", value: stats.totalCostUsd > 0 ? `$${stats.totalCostUsd.toFixed(4)}` : "$0.00" },
          { label: "Avg Quality", value: stats.avgQualityScore > 0 ? `${fmt(stats.avgQualityScore, 1)}/10` : "N/A" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Runs table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Bot Runs</h2>
          <RunButton />
        </div>
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
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Generated</th>
                  <th className="text-left px-4 py-3">Avg inference</th>
                  <th className="text-left px-4 py-3">Cost</th>
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
                    <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                    <td className="px-4 py-3">{run.articles_fetched}</td>
                    <td className="px-4 py-3 text-gray-300">{run.avg_inference_seconds > 0 ? `${fmt(run.avg_inference_seconds)}s` : "N/A"}</td>
                    <td className="px-4 py-3 text-gray-300">{run.total_cost_usd && run.total_cost_usd > 0 ? `$${run.total_cost_usd.toFixed(4)}` : "—"}</td>
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
        Model: OpenAI GPT-4o-mini · Experiment tracking: MLflow · Deploy: Railway
      </p>
    </div>
  );
}
