import type { AnalysisSettings, Message, ReplyMetric, Session } from './types';

export const DEFAULT_SETTINGS: AnalysisSettings = {
  sessionGapHours: 6,
  normalizeArabic: true,
  normalizeTaaMarbuta: false,
  excludeStopWords: true,
  customStopWords: [],
};

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','to','of','in','on','for','is','it','this','that','i','you','we','they','me','my','your','our','so','was','are','be','with','at','as','do','did','not','no','yes','just','have','has','had','what','when','how','why','who',
  'من','في','على','عن','الى','إلى','انا','أنا','انت','أنت','هو','هي','نحن','هم','هذا','هذه','ذلك','التي','الذي','و','او','أو','بس','ما','مو','لا','اي','إي','كان','كانت','شو','ليش','كيف','مع','عند','كل','شي','فيه','فيها','انو','إنه','ان','إن','يا'
]);

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function normalizeText(text: string, settings: AnalysisSettings = DEFAULT_SETTINGS): string {
  let result = text.normalize('NFKC').toLocaleLowerCase();
  if (settings.normalizeArabic) {
    result = result
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ـ/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '');
    if (settings.normalizeTaaMarbuta) result = result.replace(/ة/g, 'ه');
  }
  return result.replace(/(.)\1{3,}/gu, '$1$1$1');
}

export function tokenize(text: string, settings: AnalysisSettings = DEFAULT_SETTINGS): string[] {
  const custom = new Set(settings.customStopWords.map((word) => normalizeText(word, settings)));
  return normalizeText(text, settings)
    .split(/[^\p{L}\p{N}_']+/u)
    .filter((word) => word.length > 1 && (!settings.excludeStopWords || (!STOP_WORDS.has(word) && !custom.has(word))));
}

export function sessionsFor(messages: Message[], gapHours = 6): Session[] {
  if (!messages.length) return [];
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const threshold = gapHours * 3_600_000;
  const groups: Message[][] = [[sorted[0]]];
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].timestamp - sorted[index - 1].timestamp >= threshold) groups.push([]);
    groups.at(-1)!.push(sorted[index]);
  }
  return groups.map((group, index) => ({
    id: `session-${index}`,
    start: group[0].timestamp,
    end: group.at(-1)!.timestamp,
    starter: group[0].sender,
    closer: group.at(-1)!.sender,
    messages: group,
    alternations: group.slice(1).reduce((count, message, i) => count + (message.sender !== group[i].sender ? 1 : 0), 0),
  }));
}

export function replyMetrics(messages: Message[]): ReplyMetric[] {
  const replies = new Map<string, number[]>();
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = sorted[index - 1];
    if (current.sender === previous.sender) continue;
    const wait = current.timestamp - previous.timestamp;
    if (wait < 0 || wait > 7 * 86_400_000) continue;
    replies.set(current.sender, [...(replies.get(current.sender) ?? []), wait]);
  }
  return [...replies.entries()].map(([sender, values]) => ({
    sender,
    averageMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianMs: median(values),
    fastestMs: Math.min(...values),
    underMinute: values.filter((value) => value < 60_000).length,
    underFive: values.filter((value) => value < 300_000).length,
    underFifteen: values.filter((value) => value < 900_000).length,
    underHour: values.filter((value) => value < 3_600_000).length,
    overHours: values.filter((value) => value >= 3_600_000).length,
    count: values.length,
  }));
}

export function extractEmojis(text: string): string[] {
  return text.match(/(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/gu) ?? [];
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildAnalysis(messages: Message[], settings: AnalysisSettings = DEFAULT_SETTINGS) {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const participants = [...new Set(sorted.map((message) => message.sender))];
  const bySender = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender).length]));
  const wordsBySender = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender).reduce((sum, message) => sum + tokenize(message.text, { ...settings, excludeStopWords: false }).length, 0)]));
  const textLengths = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender).map((message) => message.text.length)]));
  const dayMap = new Map<string, Message[]>();
  for (const message of sorted) dayMap.set(dayKey(message.timestamp), [...(dayMap.get(dayKey(message.timestamp)) ?? []), message]);
  const daily = [...dayMap.entries()].map(([date, dayMessages]) => ({ date, messages: dayMessages.length, words: dayMessages.reduce((sum, message) => sum + tokenize(message.text, { ...settings, excludeStopWords: false }).length, 0), bySender: Object.fromEntries(participants.map((sender) => [sender, dayMessages.filter((message) => message.sender === sender).length])), first: dayMessages[0], last: dayMessages.at(-1)! }));
  const longestDay = [...daily].sort((a, b) => b.messages - a.messages)[0];
  const sessionList = sessionsFor(sorted, settings.sessionGapHours);
  const replies = replyMetrics(sorted);

  const wordStats = Object.fromEntries(participants.map((sender) => {
    const own = sorted.filter((message) => message.sender === sender);
    const counts = new Map<string, { count: number; messages: number }>();
    for (const message of own) {
      const words = tokenize(message.text, settings);
      const unique = new Set(words);
      for (const word of words) counts.set(word, { count: (counts.get(word)?.count ?? 0) + 1, messages: counts.get(word)?.messages ?? 0 });
      for (const word of unique) counts.set(word, { count: counts.get(word)!.count, messages: counts.get(word)!.messages + 1 });
    }
    return [sender, [...counts.entries()].map(([word, value]) => ({ word, ...value, messageRate: own.length ? value.messages / own.length : 0 })).sort((a, b) => b.count - a.count)];
  }));

  const phraseStats = Object.fromEntries(participants.map((sender) => {
    const counts = new Map<string, number>();
    for (const message of sorted.filter((item) => item.sender === sender)) {
      const words = tokenize(message.text, settings);
      for (const size of [2, 3]) for (let i = 0; i <= words.length - size; i += 1) {
        const phrase = words.slice(i, i + size).join(' ');
        if (new Set(words.slice(i, i + size)).size === 1) continue;
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
    return [sender, [...counts.entries()].filter(([, count]) => count >= 2).map(([phrase, count]) => ({ phrase, count })).sort((a, b) => b.count - a.count)];
  }));

  const emojiStats = Object.fromEntries(participants.map((sender) => {
    const counts = new Map<string, number>();
    for (const message of sorted.filter((item) => item.sender === sender)) for (const emoji of extractEmojis(message.text)) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    return [sender, [...counts.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a, b) => b.count - a.count)];
  }));

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: sorted.filter((message) => new Date(message.timestamp).getHours() === hour).length }));
  const weekdays = Array.from({ length: 7 }, (_, day) => ({ day, count: sorted.filter((message) => new Date(message.timestamp).getDay() === day).length }));
  const gaps = sorted.slice(1).map((message, index) => ({ start: sorted[index].timestamp, end: message.timestamp, duration: message.timestamp - sorted[index].timestamp, resumedBy: message.sender })).filter((gap) => gap.duration >= 86_400_000).sort((a, b) => b.duration - a.duration);

  const questionStats = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender && /[?؟]/u.test(message.text)).length]));
  const laughterStats = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender && /(😂|🤣|(?:^|\s)(?:ha){2,}|(?:^|\s)lol\b|lmao|ه{3,})/iu.test(message.text)).length]));
  const kindStats = Object.fromEntries(participants.map((sender) => [sender, sorted.filter((message) => message.sender === sender).reduce<Record<string, number>>((acc, message) => ({ ...acc, [message.kind]: (acc[message.kind] ?? 0) + 1 }), {})]));

  const quoteCandidates = sorted
    .filter((message) => message.kind === 'text' && message.text.trim().length >= 25 && message.text.trim().length <= 340)
    .map((message) => ({ message, score: Math.min(message.text.length / 60, 3) + (/[!؟?…]/u.test(message.text) ? 1 : 0) + (/(proud|beautiful|always|remember|thank|love|miss|فخور|جميل|دايما|دائما|تذكر|شكرا|بحب|اشتقت)/iu.test(message.text) ? 2 : 0) }))
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map(({ message }) => message);

  const dateNumbers = [...dayMap.keys()].map((key) => Date.parse(`${key}T00:00:00`)).sort((a, b) => a - b);
  let longestStreak = 0; let current = 0; let previous = 0;
  for (const date of dateNumbers) { current = previous && Math.round((date - previous) / 86_400_000) === 1 ? current + 1 : 1; longestStreak = Math.max(longestStreak, current); previous = date; }

  return {
    participants, bySender, wordsBySender,
    totalMessages: sorted.length,
    totalWords: Object.values(wordsBySender).reduce((sum, value) => sum + value, 0),
    activeDays: dayMap.size,
    firstMessage: sorted[0], lastMessage: sorted.at(-1), longestDay,
    averagePerActiveDay: dayMap.size ? sorted.length / dayMap.size : 0,
    averageLength: Object.fromEntries(participants.map((sender) => [sender, textLengths[sender].length ? textLengths[sender].reduce((a: number, b: number) => a + b, 0) / textLengths[sender].length : 0])),
    medianLength: Object.fromEntries(participants.map((sender) => [sender, median(textLengths[sender])])),
    sessions: sessionList,
    initiation: Object.fromEntries(participants.map((sender) => [sender, sessionList.filter((session) => session.starter === sender).length])),
    replies, wordStats, phraseStats, emojiStats, hourly, weekdays, daily, gaps, questionStats, laughterStats, kindStats, quoteCandidates, longestStreak,
  };
}

export type ConversationAnalysis = ReturnType<typeof buildAnalysis>;
