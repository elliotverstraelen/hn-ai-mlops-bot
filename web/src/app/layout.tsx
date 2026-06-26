import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HN AI MLOps Bot",
  description: "Live dashboard for the Hacker News AI summarizer bot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <header className="border-b border-gray-800 bg-gray-900">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h1 className="font-bold text-lg leading-none">HN AI MLOps Bot</h1>
              <p className="text-gray-400 text-sm">Hacker News → BART summarizer → Twitter</p>
            </div>
            <a
              href="https://github.com/elliotverstraelen/hn-ai-mlops-bot"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-gray-400 hover:text-white text-sm"
            >
              GitHub →
            </a>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
