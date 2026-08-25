import type { AnalysisSettings, ConversationCandidate, Message } from './types';

const DB_NAME = 'our-conversations-local';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by_conversation', 'conversationId');
        store.createIndex('by_conversation_time', ['conversationId', 'timestamp']);
      }
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveConversation(candidate: ConversationCandidate): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(['conversations', 'messages', 'preferences'], 'readwrite');
  const { messages, ...meta } = candidate;
  transaction.objectStore('conversations').put({ ...meta, savedAt: Date.now() });
  for (const message of messages) transaction.objectStore('messages').put(message);
  transaction.objectStore('preferences').put(candidate.id, 'latestConversationId');
  await done(transaction);
  db.close();
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLatestConversation(): Promise<ConversationCandidate | null> {
  const db = await openDb();
  const latest = await requestValue(db.transaction('preferences').objectStore('preferences').get('latestConversationId')) as string | undefined;
  if (!latest) { db.close(); return null; }
  const meta = await requestValue(db.transaction('conversations').objectStore('conversations').get(latest)) as Omit<ConversationCandidate, 'messages'> | undefined;
  if (!meta) { db.close(); return null; }
  const messages = await requestValue(db.transaction('messages').objectStore('messages').index('by_conversation').getAll(latest)) as Message[];
  db.close();
  messages.sort((a, b) => a.timestamp - b.timestamp);
  return { ...meta, messages };
}

export async function saveSettings(settings: AnalysisSettings): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction('preferences', 'readwrite');
  transaction.objectStore('preferences').put(settings, 'analysisSettings');
  await done(transaction);
  db.close();
}

export async function loadSettings(): Promise<AnalysisSettings | null> {
  const db = await openDb();
  const settings = await requestValue(db.transaction('preferences').objectStore('preferences').get('analysisSettings')) as AnalysisSettings | undefined;
  db.close();
  return settings ?? null;
}

export async function resetLocalData(): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(['conversations', 'messages', 'preferences'], 'readwrite');
  transaction.objectStore('conversations').clear();
  transaction.objectStore('messages').clear();
  transaction.objectStore('preferences').clear();
  await done(transaction);
  db.close();
}
