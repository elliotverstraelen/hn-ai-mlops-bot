import { NextRequest, NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";
import { getArticle, setArticleTweetId } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const article = await getArticle(parseInt(id));

  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (article.tweet_id) return NextResponse.json({ error: "Already posted" }, { status: 409 });

  const suffix = `\n\nRead more → ${article.source_url}`;
  let summary = article.summary;
  const max = 280 - suffix.length - 5;
  if (summary.length > max) summary = summary.slice(0, max).trimEnd() + "...";
  const tweetText = `${summary}${suffix}`;

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  });

  try {
    const { data } = await client.readWrite.v2.tweet(tweetText);
    await setArticleTweetId(article.id, data.id);
    return NextResponse.json({ tweet_id: data.id });
  } catch (e: unknown) {
    let msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("402")) msg = "Twitter API access error (402) — your API plan may not support tweet creation. Check developer.twitter.com.";
    if (msg.includes("403")) msg = "Duplicate tweet — this content was already posted recently.";
    if (msg.includes("401")) msg = "Twitter credentials invalid — check API keys in Railway settings.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
