import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysis, DEFAULT_SETTINGS, normalizeText, replyMetrics, sessionsFor } from '../lib/analytics.ts';
import type { Message } from '../lib/types.ts';

const base = Date.parse('2024-01-01T08:00:00Z');
const messages: Message[] = [
  { id:'1', conversationId:'c', sender:'A', timestamp:base, text:'مرحبااا! How are you?', kind:'text', source:'json' },
  { id:'2', conversationId:'c', sender:'A', timestamp:base+30_000, text:'Are you there؟', kind:'text', source:'json' },
  { id:'3', conversationId:'c', sender:'B', timestamp:base+90_000, text:'أنا هنا 😂', kind:'text', source:'json' },
  { id:'4', conversationId:'c', sender:'A', timestamp:base+180_000, text:'ههههه great', kind:'text', source:'json' },
  { id:'5', conversationId:'c', sender:'B', timestamp:base+8*3_600_000, text:'back again', kind:'text', source:'json' },
];

test('normalizes Arabic Alef variants without changing stored messages', () => {
  assert.equal(normalizeText('أ إ آ ا', DEFAULT_SETTINGS), 'ا ا ا ا');
  assert.equal(messages[2].text, 'أنا هنا 😂');
});

test('starts sessions only after the configured inactivity gap', () => {
  const sessions = sessionsFor(messages, 6);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].starter, 'A');
  assert.equal(sessions[1].starter, 'B');
});

test('counts only sender switches as replies', () => {
  const replies = replyMetrics(messages);
  assert.equal(replies.find((entry) => entry.sender === 'B')?.count, 2);
  assert.equal(replies.find((entry) => entry.sender === 'A')?.count, 1);
});

test('builds deterministic mixed Arabic and English analytics', () => {
  const analysis = buildAnalysis(messages, DEFAULT_SETTINGS);
  assert.equal(analysis.totalMessages, 5);
  assert.equal(analysis.activeDays, 1);
  assert.equal(analysis.questionStats.A, 2);
  assert.equal(analysis.emojiStats.B[0].emoji, '😂');
  assert.equal(analysis.laughterStats.A, 1);
});
