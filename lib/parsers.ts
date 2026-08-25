import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import type { ConversationCandidate, Message, MessageKind } from './types';

type Progress = (percent: number, label: string) => void;

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

function candidateId(source: string, title: string, firstTimestamp: number): string {
  return `${source}-${stableId(`${title}-${firstTimestamp}`)}`;
}

function telegramText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => typeof part === 'string' ? part : telegramText((part as { text?: unknown }).text)).join('');
  return '';
}

function detectKind(raw: Record<string, unknown>, text: string): MessageKind {
  const media = String(raw.media_type ?? raw.type ?? '').toLowerCase();
  const file = String(raw.file ?? raw.attachmentName ?? '').toLowerCase();
  if (/deleted|unsent/.test(text.toLowerCase())) return 'deleted';
  if (/voice|audio/.test(media) || /\.(ogg|opus|m4a|mp3)$/.test(file)) return 'voice';
  if (/sticker/.test(media)) return 'sticker';
  if (/video/.test(media) || /\.(mp4|mov|webm)$/.test(file)) return 'video';
  if (/photo|image/.test(media) || /\.(jpe?g|png|webp|gif)$/.test(file)) return 'image';
  if (/call/.test(media)) return 'call';
  if (file) return 'document';
  if (/https?:\/\//i.test(text)) return 'link';
  return text ? 'text' : 'other';
}

function finalize(candidate: Omit<ConversationCandidate, 'id'>): ConversationCandidate {
  candidate.messages.sort((a, b) => a.timestamp - b.timestamp);
  const id = candidateId(candidate.source, candidate.title, candidate.messages[0]?.timestamp ?? 0);
  const messages = candidate.messages.map((message, index) => ({ ...message, conversationId: id, id: message.id || `${id}-${index}` }));
  return { ...candidate, id, messages, participants: candidate.participants.filter(Boolean).slice(0, 8) };
}

function parseTelegramJson(data: Record<string, unknown>, sourceName: string): ConversationCandidate[] {
  if (!Array.isArray(data.messages)) return [];
  const rawMessages = data.messages as Record<string, unknown>[];
  const messages: Message[] = rawMessages.filter((raw) => raw.type === 'message').map((raw, index) => {
    const text = telegramText(raw.text);
    return {
      id: `tg-${String(raw.id ?? index)}`,
      conversationId: '',
      sender: String(raw.from ?? 'Unknown'),
      timestamp: Number(raw.date_unixtime ? Number(raw.date_unixtime) * 1000 : Date.parse(String(raw.date ?? ''))),
      text,
      kind: detectKind(raw, text),
      source: 'telegram' as const,
      attachmentName: raw.file ? String(raw.file).split(/[\\/]/).at(-1) : undefined,
    };
  }).filter((message) => Number.isFinite(message.timestamp));
  if (!messages.length) return [];
  return [finalize({
    title: String(data.name ?? 'Telegram conversation'),
    sourceName,
    source: 'telegram',
    participants: [...new Set(messages.map((message) => message.sender))],
    messages,
    warnings: rawMessages.length !== messages.length ? [`Skipped ${rawMessages.length - messages.length} service or malformed entries.`] : [],
  })];
}

function decodeInstagram(value: string): string {
  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /[\u0080-\u009fÃð]/.test(value) ? decoded : value;
  } catch { return value; }
}

function instagramKind(raw: Record<string, unknown>, text: string): MessageKind {
  if (raw.audio_files) return 'voice';
  if (raw.photos) return 'image';
  if (raw.videos) return 'video';
  if (raw.share) return 'link';
  if (raw.call_duration || raw.missed_video_call || raw.missed_audio_call) return 'call';
  return detectKind(raw, text);
}

function parseInstagramJson(data: Record<string, unknown>, sourceName: string, titleHint?: string): ConversationCandidate[] {
  if (!Array.isArray(data.messages)) return [];
  const participants = Array.isArray(data.participants) ? (data.participants as Record<string, unknown>[]).map((participant) => decodeInstagram(String(participant.name ?? 'Unknown'))) : [];
  const messages: Message[] = (data.messages as Record<string, unknown>[]).map((raw, index) => {
    const text = decodeInstagram(String(raw.content ?? ''));
    const timestamp = Number(raw.timestamp_ms ?? 0);
    return { id: `ig-${timestamp}-${index}`, conversationId: '', sender: decodeInstagram(String(raw.sender_name ?? 'Unknown')), timestamp, text, kind: instagramKind(raw, text), source: 'instagram' as const };
  }).filter((message) => Number.isFinite(message.timestamp) && message.timestamp > 0);
  if (!messages.length) return [];
  return [finalize({ title: participants.join(' & ') || titleHint || 'Instagram conversation', sourceName, source: 'instagram', participants: participants.length ? participants : [...new Set(messages.map((message) => message.sender))], messages, warnings: [] })];
}

function parseWhatsAppText(text: string, sourceName: string): ConversationCandidate[] {
  const messages: Message[] = [];
  const warnings: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const pattern = /^(?:\[)?(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)(?:\])?\s*-\s*([^:]+):\s?(.*)$/iu;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const [, dateText, sender, content] = match;
      const timestamp = Date.parse(dateText.replace(/\u202f/g, ' '));
      if (!Number.isFinite(timestamp)) { warnings.push(`Could not parse a timestamp near line ${messages.length + 1}.`); continue; }
      messages.push({ id: `wa-${timestamp}-${messages.length}`, conversationId: '', sender: sender.trim(), timestamp, text: content, kind: detectKind({}, content), source: 'whatsapp' });
    } else if (messages.length && line.trim()) messages.at(-1)!.text += `\n${line}`;
  }
  if (!messages.length) return [];
  return [finalize({ title: sourceName.replace(/\.(txt|zip)$/i, '').replace(/^WhatsApp Chat with /i, ''), sourceName, source: 'whatsapp', participants: [...new Set(messages.map((message) => message.sender))], messages, warnings: [...new Set(warnings)] })];
}

function parseCsv(text: string, sourceName: string): ConversationCandidate[] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.trim().toLowerCase()) ?? [];
  const senderIndex = headers.findIndex((header) => /sender|author|from|participant|name/.test(header));
  const dateIndex = headers.findIndex((header) => /date|time|timestamp/.test(header));
  const textIndex = headers.findIndex((header) => /text|message|content|body/.test(header));
  if ([senderIndex, dateIndex, textIndex].some((index) => index < 0)) return [];
  const messages = rows.map((values, index) => ({ id: `csv-${index}`, conversationId: '', sender: values[senderIndex]?.trim() || 'Unknown', timestamp: Date.parse(values[dateIndex]), text: values[textIndex] ?? '', kind: detectKind({}, values[textIndex] ?? ''), source: 'csv' as const })).filter((message) => Number.isFinite(message.timestamp));
  if (!messages.length) return [];
  return [finalize({ title: sourceName.replace(/\.csv$/i, ''), sourceName, source: 'csv', participants: [...new Set(messages.map((message) => message.sender))], messages, warnings: [] })];
}

function parseGenericJson(data: unknown, sourceName: string): ConversationCandidate[] {
  if (!data || typeof data !== 'object') return [];
  const object = data as Record<string, unknown>;
  if (Array.isArray(object.messages) && object.messages[0] && typeof object.messages[0] === 'object' && 'date_unixtime' in (object.messages[0] as object)) return parseTelegramJson(object, sourceName);
  if (Array.isArray(object.messages) && object.messages[0] && typeof object.messages[0] === 'object' && 'timestamp_ms' in (object.messages[0] as object)) return parseInstagramJson(object, sourceName);
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : Array.isArray(object.messages) ? object.messages as Record<string, unknown>[] : [];
  const messages: Message[] = rows.map((raw, index) => {
    const sender = String(raw.sender ?? raw.from ?? raw.author ?? raw.name ?? 'Unknown');
    const rawTime = raw.timestamp ?? raw.date ?? raw.time ?? raw.created_at;
    const timestamp = typeof rawTime === 'number' ? (rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime) : Date.parse(String(rawTime ?? ''));
    const content = String(raw.text ?? raw.message ?? raw.content ?? raw.body ?? '');
    return { id: `json-${index}`, conversationId: '', sender, timestamp, text: content, kind: detectKind(raw, content), source: 'json' as const };
  }).filter((message) => Number.isFinite(message.timestamp));
  if (!messages.length) return [];
  return [finalize({ title: String(object.name ?? object.title ?? sourceName.replace(/\.json$/i, '')), sourceName, source: 'json', participants: [...new Set(messages.map((message) => message.sender))], messages, warnings: [] })];
}

function mergeInstagramParts(parts: { name: string; data: Record<string, unknown> }[], sourceName: string): ConversationCandidate[] {
  const grouped = new Map<string, { participants: Record<string, unknown>[]; messages: Record<string, unknown>[] }>();
  for (const part of parts) {
    const match = part.name.match(/messages\/inbox\/([^/]+)\/message_\d+\.json$/i);
    const key = match?.[1] ?? part.name;
    const existing = grouped.get(key) ?? { participants: [], messages: [] };
    if (Array.isArray(part.data.participants)) existing.participants = part.data.participants as Record<string, unknown>[];
    if (Array.isArray(part.data.messages)) existing.messages.push(...part.data.messages as Record<string, unknown>[]);
    grouped.set(key, existing);
  }
  return [...grouped.entries()].flatMap(([title, data]) => parseInstagramJson(data, sourceName, title));
}

async function parseZip(file: File, onProgress?: Progress): Promise<ConversationCandidate[]> {
  const instagramParts: { name: string; data: Record<string, unknown> }[] = [];
  const whatsappTexts: { name: string; text: string }[] = [];
  const active: Promise<void>[] = [];
  const unzip = new Unzip((entry) => {
    const normalized = entry.name.replace(/\\/g, '/');
    const isInstagram = /messages\/inbox\/[^/]+\/message_\d+\.json$/i.test(normalized);
    const isText = /\.txt$/i.test(normalized);
    if (!isInstagram && !isText) return;
    active.push(new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      entry.ondata = (error, data, final) => {
        if (error) { reject(error); return; }
        chunks.push(data);
        if (final) {
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const joined = new Uint8Array(total); let offset = 0;
          for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
          try {
            const decoded = strFromU8(joined);
            if (isInstagram) instagramParts.push({ name: normalized, data: JSON.parse(decoded) as Record<string, unknown> });
            else whatsappTexts.push({ name: normalized, text: decoded });
            resolve();
          } catch (parseError) { reject(parseError); }
        }
      };
      entry.start();
    }));
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader(); let read = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) { unzip.push(new Uint8Array(), true); break; }
    read += value.byteLength;
    unzip.push(value, false);
    onProgress?.(Math.round((read / file.size) * 100), `Reading ${file.name}`);
  }
  await Promise.all(active);
  return [...mergeInstagramParts(instagramParts, file.name), ...whatsappTexts.flatMap((entry) => parseWhatsAppText(entry.text, entry.name))];
}

export async function parseConversationFile(file: File, onProgress?: Progress): Promise<ConversationCandidate[]> {
  onProgress?.(1, `Opening ${file.name}`);
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'zip') return parseZip(file, onProgress);
  const text = await file.text();
  onProgress?.(70, `Parsing ${file.name}`);
  if (extension === 'json') return parseGenericJson(JSON.parse(text), file.name);
  if (extension === 'csv') return parseCsv(text, file.name);
  const whatsapp = parseWhatsAppText(text, file.name);
  if (whatsapp.length) return whatsapp;
  return [];
}

export async function parseConversationFiles(files: File[], onProgress?: Progress): Promise<ConversationCandidate[]> {
  const all: ConversationCandidate[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const candidates = await parseConversationFile(files[index], (percent, label) => onProgress?.(Math.round(((index + percent / 100) / files.length) * 100), label));
    all.push(...candidates);
  }
  const merged = new Map<string, ConversationCandidate>();
  for (const candidate of all) {
    const key = `${candidate.source}:${candidate.participants.map((name) => name.toLocaleLowerCase()).sort().join('|')}:${candidate.title.toLocaleLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, candidate);
    else {
      const seen = new Set(existing.messages.map((message) => `${message.timestamp}|${message.sender}|${message.text}|${message.kind}`));
      for (const message of candidate.messages) if (!seen.has(`${message.timestamp}|${message.sender}|${message.text}|${message.kind}`)) existing.messages.push({ ...message, conversationId: existing.id, id: `${existing.id}-${existing.messages.length}` });
      existing.messages.sort((a, b) => a.timestamp - b.timestamp);
      existing.warnings.push(...candidate.warnings);
    }
  }
  return [...merged.values()].sort((a, b) => b.messages.length - a.messages.length);
}
