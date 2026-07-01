import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import pytest

from main import format_tweet, summarize, rate_tweet, fetch_hn_articles


# ── format_tweet ──────────────────────────────────────────────

def test_format_tweet_basic():
    result = format_tweet("Great article about AI", "https://example.com/article")
    assert "Great article about AI" in result
    assert "https://example.com/article" in result
    assert len(result) <= 280


def test_format_tweet_truncates_long_summary():
    long_summary = "A" * 300
    url = "https://example.com"
    result = format_tweet(long_summary, url)
    assert len(result) <= 280
    assert result.endswith(f"\n\nRead more → {url}")
    assert "..." in result


def test_format_tweet_short_summary_not_truncated():
    summary = "Short summary"
    url = "https://example.com"
    result = format_tweet(summary, url)
    assert result == "Short summary\n\nRead more → https://example.com"


# ── summarize ─────────────────────────────────────────────────

def _mock_completion(content, prompt_tokens=50, completion_tokens=20):
    mock = MagicMock()
    mock.choices[0].message.content = content
    mock.usage.prompt_tokens = prompt_tokens
    mock.usage.completion_tokens = completion_tokens
    return mock


@patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})
@patch("main.OpenAI")
def test_summarize_returns_tuple(mock_openai_cls):
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.return_value = _mock_completion(
        "This is a great tweet about AI.", 50, 20
    )
    text, prompt_tokens, completion_tokens = summarize("AI breakthrough announced")
    assert text == "This is a great tweet about AI."
    assert prompt_tokens == 50
    assert completion_tokens == 20


@patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})
@patch("main.OpenAI")
def test_summarize_strips_whitespace(mock_openai_cls):
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.return_value = _mock_completion("  tweet with spaces  ")
    text, _, _ = summarize("Some title")
    assert text == "tweet with spaces"


# ── rate_tweet ────────────────────────────────────────────────

@patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})
@patch("main.OpenAI")
def test_rate_tweet_returns_score(mock_openai_cls):
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.return_value = _mock_completion("8", 30, 1)
    score, p_tok, c_tok = rate_tweet("Great tweet about AI breakthroughs")
    assert score == 8.0
    assert p_tok == 30
    assert c_tok == 1


@patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"})
@patch("main.OpenAI")
def test_rate_tweet_invalid_response_falls_back(mock_openai_cls):
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    mock_client.chat.completions.create.return_value = _mock_completion("great!")
    score, _, _ = rate_tweet("Some tweet")
    assert score == 5.0


# ── fetch_hn_articles ─────────────────────────────────────────

def _mock_hn(story_ids, items):
    def mock_get(url, timeout=10):
        r = MagicMock()
        if "topstories" in url:
            r.json.return_value = story_ids
        else:
            story_id = int(url.split("/item/")[1].split(".json")[0])
            r.json.return_value = items.get(story_id)
        return r
    return mock_get


@patch("main.requests.get")
def test_fetch_hn_articles_deduplication(mock_get):
    items = {
        1: {"type": "story", "title": "Article 1", "url": "https://example.com/1"},
        2: {"type": "story", "title": "Article 2", "url": "https://example.com/2"},
        3: {"type": "story", "title": "Article 3", "url": "https://example.com/3"},
    }
    mock_get.side_effect = _mock_hn([1, 2, 3], items)
    results = fetch_hn_articles(3, skip_urls={"https://example.com/1"})
    urls = [a["url"] for a in results]
    assert "https://example.com/1" not in urls
    assert len(results) == 2


@patch("main.requests.get")
def test_fetch_hn_articles_skips_non_stories(mock_get):
    items = {
        1: {"type": "ask", "title": "Ask HN: something", "url": "https://news.ycombinator.com/1"},
        2: {"type": "story", "title": "Real Article", "url": "https://example.com/real"},
    }
    mock_get.side_effect = _mock_hn([1, 2], items)
    results = fetch_hn_articles(2)
    assert len(results) == 1
    assert results[0]["title"] == "Real Article"
