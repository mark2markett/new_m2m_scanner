import type { NewsItem } from '@/lib/types';

export function analyzeSentimentFromTitle(title: string): 'Positive' | 'Negative' | 'Neutral' {
  const positiveWords = [
    'beats', 'exceeds', 'strong', 'growth', 'gains', 'bullish', 'upgrade',
    'buy', 'outperforms', 'record', 'high',
  ];
  const negativeWords = [
    'misses', 'falls', 'drops', 'weak', 'decline', 'bearish', 'downgrade',
    'sell', 'loss', 'low', 'concern',
  ];

  const lowerTitle = title.toLowerCase();

  // Bug Fix #6: use word-boundary matching to avoid partial-word false positives
  // (e.g. "up" inside "support", "down" inside "markdown", "high" inside "highlight")
  const matchesWord = (text: string, word: string): boolean => {
    const re = new RegExp(`(?<![a-z])${word}(?![a-z])`, 'i');
    return re.test(text);
  };

  const positiveCount = positiveWords.filter(w => matchesWord(lowerTitle, w)).length;
  const negativeCount = negativeWords.filter(w => matchesWord(lowerTitle, w)).length;

  if (positiveCount > negativeCount) return 'Positive';
  if (negativeCount > positiveCount) return 'Negative';
  return 'Neutral';
}

export function analyzeSentiment(news: NewsItem[]): 'Positive' | 'Neutral' | 'Negative' {
  if (news.length === 0) return 'Neutral';

  const sentimentScores = {
    'Positive': 1,
    'Neutral': 0,
    'Negative': -1
  };

  const totalScore = news.reduce((sum, item) => sum + sentimentScores[item.sentiment], 0);
  const avgScore = totalScore / news.length;

  if (avgScore > 0.2) return 'Positive';
  if (avgScore < -0.2) return 'Negative';
  return 'Neutral';
}
