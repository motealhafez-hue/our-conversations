'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAnalysis, DEFAULT_SETTINGS, type ConversationAnalysis } from '@/lib/analytics';
import { parseConversationFiles } from '@/lib/parsers';
import { loadLatestConversation, loadSettings, resetLocalData, saveConversation, saveSettings } from '@/lib/storage';
import type { AnalysisSettings, ConversationCandidate, Message } from '@/lib/types';

const navigation = ['Overview', 'Us', 'Words', 'Quotes', 'Timeline', 'Activity', 'Replies', 'Emojis', 'Calendar', 'How We Text', 'Memories', 'Chat Explorer', 'Settings'] as const;
type View = typeof navigation[number];

const number = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const exactNumber = new Intl.NumberFormat('en');

function formatDate(timestamp?: number, short = false) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en', short ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(timestamp);
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function duration(ms: number) {
  if (!ms) return '—';
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} sec`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(ms < 10_800_000 ? 1 : 0)} hr`;
  return `${(ms / 86_400_000).toFixed(1)} days`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase() || '?';
}

function ImportExperience({ onImported }: { onImported: (candidate: ConversationCandidate) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [candidates, setCandidates] = useState<ConversationCandidate[]>([]);
  const [error, setError] = useState('');

  async function importFiles(files: File[]) {
    if (!files.length) return;
    setError(''); setCandidates([]); setProgress(1);
    try {
      const parsed = await parseConversationFiles(files, (value, label) => { setProgress(value); setProgressLabel(label); });
      if (!parsed.length) throw new Error('No supported conversation messages were found in these files.');
      setCandidates(parsed); setProgress(100); setProgressLabel(`${parsed.length} conversation${parsed.length === 1 ? '' : 's'} detected`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The export could not be parsed.'); setProgress(0);
    }
  }

  if (candidates.length) return (
    <section className="import-review" aria-live="polite">
      <div className="review-heading"><div><p className="section-kicker">IMPORT REVIEW</p><h2>Choose a conversation</h2><p>Confirm the detected people and date range before anything is saved locally.</p></div><button className="ghost-button" type="button" onClick={() => setCandidates([])}>Choose other files</button></div>
      <div className="candidate-list">
        {candidates.slice(0, 30).map((candidate) => <article className="candidate-card" key={candidate.id}>
          <div className="candidate-avatars">{candidate.participants.slice(0, 2).map((name, index) => <span className={`avatar p${index}`} key={name}>{initials(name)}</span>)}</div>
          <div className="candidate-copy"><small>{candidate.source.toUpperCase()}</small><h3>{candidate.title}</h3><p>{candidate.participants.join(' · ')}</p><div className="candidate-meta"><span>{exactNumber.format(candidate.messages.length)} messages</span><span>{formatDate(candidate.messages[0]?.timestamp, true)} — {formatDate(candidate.messages.at(-1)?.timestamp, true)}</span></div>{candidate.warnings.length > 0 && <p className="warning">{candidate.warnings[0]}</p>}</div>
          <button className="primary-button" type="button" onClick={() => onImported(candidate)}>Open this archive</button>
        </article>)}
      </div>
      {candidates.length > 30 && <p className="muted-note">Showing the 30 largest detected conversations.</p>}
    </section>
  );

  return <>
    <div className="hero-grid">
      <section className="intro-card">
        <div className="orb orb-one" /><div className="orb orb-two" />
        <p className="section-kicker"><span /> YOUR STORY, IN YOUR WORDS</p>
        <h2>Every message holds<br />a little piece of time.</h2>
        <p className="intro-copy">Bring your conversation archive to life through patterns, memories, and moments — calculated privately in your browser.</p>
        <div className="participant-preview"><span className="avatar p0">Y</span><span className="avatar p1">T</span><p><strong>You &amp; them</strong><small>Names are confirmed after import</small></p></div>
      </section>
      <section className={dragging ? 'import-card dragging' : 'import-card'} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFiles([...event.dataTransfer.files]); }}>
        <div className="import-icon" aria-hidden="true">↥</div><p className="section-kicker">BEGIN HERE</p><h2>Import a conversation</h2><p>WhatsApp, Telegram, Instagram, JSON, CSV, or plain text.</p>
        <input ref={inputRef} className="sr-only" type="file" accept=".zip,.json,.csv,.txt" multiple onChange={(event) => void importFiles([...event.target.files ?? []])} />
        <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>Choose your export</button>
        {progress > 0 ? <div className="progress-wrap"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{progressLabel}</small></div> : <small>Nothing is uploaded. Your messages never leave this device.</small>}
        {error && <p className="error-message">{error}</p>}
      </section>
    </div>
    <section className="preview-section"><div className="preview-heading"><div><p className="eyebrow">A glimpse of what awaits</p><h2>Your conversation, made visible</h2></div><p>Exact calculations stay separate from suggested interpretations.</p></div><div className="metric-row">
      {[['✦','MESSAGES','Every exchange','Counts, words, balance, and active days.'],['◷','RHYTHM','How time moved','Replies, sessions, streaks, and silences.'],['Aa','LANGUAGE','Words that became yours','Arabic and English words, phrases, and emojis.'],['“','MEMORIES','Moments worth keeping','Verified quotes with their original context.']].map((item) => <article key={item[1]}><span className="metric-icon">{item[0]}</span><small>{item[1]}</small><strong>{item[2]}</strong><p>{item[3]}</p></article>)}
    </div></section>
  </>;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card"><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}

function ParticipantKey({ participants }: { participants: string[] }) {
  return <div className="participant-key">{participants.slice(0, 2).map((name, index) => <span key={name}><i className={`tone tone-${index}`} />{name}</span>)}</div>;
}

function Overview({ analysis, setView }: { analysis: ConversationAnalysis; setView: (view: View) => void }) {
  const [a, b] = analysis.participants;
  const total = analysis.totalMessages || 1;
  const dailyMax = Math.max(...analysis.daily.map((day) => day.messages), 1);
  return <div className="view-stack">
    <section className="story-header"><div><p className="eyebrow">{formatDate(analysis.firstMessage?.timestamp, true)} — {formatDate(analysis.lastMessage?.timestamp, true)}</p><h2>{a} <em>&amp;</em> {b || 'Unknown'}</h2><p>{exactNumber.format(analysis.totalMessages)} messages exchanged across {exactNumber.format(analysis.activeDays)} active days.</p></div><div className="story-orbit"><span>{initials(a)}</span><span>{initials(b || '?')}</span></div></section>
    <section className="stats-grid">
      <StatCard label="TOTAL MESSAGES" value={exactNumber.format(analysis.totalMessages)} detail="Every supported message in this archive" />
      <StatCard label="WORDS EXCHANGED" value={number.format(analysis.totalWords)} detail={`${number.format(analysis.wordsBySender[a] ?? 0)} · ${number.format(analysis.wordsBySender[b] ?? 0)}`} />
      <StatCard label="ACTIVE DAYS" value={exactNumber.format(analysis.activeDays)} detail={`${analysis.averagePerActiveDay.toFixed(1)} messages per active day`} />
      <StatCard label="LONGEST STREAK" value={`${analysis.longestStreak} days`} detail="Consecutive calendar days with messages" />
    </section>
    <section className="analysis-grid two-one">
      <article className="chart-card"><div className="card-heading"><div><p className="eyebrow">CONVERSATION RHYTHM</p><h3>Messages over time</h3></div><button type="button" onClick={() => setView('Timeline')}>Explore timeline →</button></div><div className="timeline-bars" aria-label="Message activity by day">{analysis.daily.slice(-96).map((day) => <span key={day.date} title={`${day.date}: ${day.messages} messages`} style={{ height: `${Math.max(3, day.messages / dailyMax * 100)}%` }} />)}</div><div className="chart-footer"><span>{analysis.daily.at(-96)?.date ?? analysis.daily[0]?.date}</span><span>{analysis.daily.at(-1)?.date}</span></div></article>
      <article className="chart-card balance-card"><div className="card-heading"><div><p className="eyebrow">CONVERSATION BALANCE</p><h3>Two voices</h3></div></div><div className="balance-ring" style={{ '--split': `${((analysis.bySender[a] ?? 0) / total) * 100}%` } as React.CSSProperties}><div><strong>{Math.round(((analysis.bySender[a] ?? 0) / total) * 100)}<small>%</small></strong><span>{a}</span></div></div><ParticipantKey participants={analysis.participants} /><div className="balance-numbers">{analysis.participants.slice(0,2).map((name) => <p key={name}><span>{name}</span><strong>{exactNumber.format(analysis.bySender[name] ?? 0)}</strong></p>)}</div></article>
    </section>
    <section className="analysis-grid equal">
      <article className="chart-card"><div className="card-heading"><div><p className="eyebrow">WHEN YOU TALK</p><h3>A day in messages</h3></div><button type="button" onClick={() => setView('Activity')}>See activity →</button></div><div className="hour-chart">{analysis.hourly.map((item) => <span key={item.hour} title={`${item.hour}:00 · ${item.count}`} style={{ height: `${Math.max(4, item.count / Math.max(...analysis.hourly.map((entry) => entry.count),1) * 100)}%` }} />)}</div><div className="chart-footer"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div></article>
      <article className="quote-feature"><p className="eyebrow">A SUGGESTED MEMORY</p>{analysis.quoteCandidates[0] ? <><blockquote dir="auto">“{analysis.quoteCandidates[0].text}”</blockquote><footer>{analysis.quoteCandidates[0].sender} · {formatDate(analysis.quoteCandidates[0].timestamp, true)} · {formatTime(analysis.quoteCandidates[0].timestamp)}</footer><button type="button" onClick={() => setView('Quotes')}>See verified quotes →</button></> : <p className="empty-copy">No quote candidates met the conservative local scoring threshold.</p>}</article>
    </section>
  </div>;
}

function UsView({ analysis, setView }: { analysis: ConversationAnalysis; setView: (view: View) => void }) {
  const sessions = [...analysis.sessions].sort((a,b) => b.messages.length - a.messages.length);
  const sharedEmoji = analysis.participants.map((name) => analysis.emojiStats[name] as {emoji:string;count:number}[]).flat().sort((a,b) => b.count - a.count)[0]?.emoji ?? '—';
  return <div className="view-stack"><section className="us-hero"><p className="eyebrow">US, IN NUMBERS</p><h2>A history made of<br /><em>{number.format(analysis.totalMessages)}</em> small moments.</h2><p>Everything here is calculated from the archive. It describes the conversation without guessing what either person felt.</p></section><section className="keepsake-grid">
    <StatCard label="MESSAGES" value={exactNumber.format(analysis.totalMessages)} detail="exchanged" /><StatCard label="TOGETHER" value={`${analysis.activeDays} days`} detail="with at least one message" /><StatCard label="WORDS" value={number.format(analysis.totalWords)} detail="written across the archive" /><StatCard label="OUR EMOJI" value={sharedEmoji} detail="most frequent overall" /><StatCard label="SESSIONS" value={exactNumber.format(analysis.sessions.length)} detail={`using a ${DEFAULT_SETTINGS.sessionGapHours}-hour gap`} /><StatCard label="LONGEST TALK" value={`${sessions[0]?.messages.length ?? 0}`} detail="messages in one detected session" />
  </section><article className="memory-strip"><p className="eyebrow">MEMORIES FROM THE ARCHIVE</p><div>{analysis.quoteCandidates.slice(0,3).map((message) => <button type="button" key={message.id} onClick={() => setView('Quotes')}><blockquote dir="auto">“{message.text}”</blockquote><span>{message.sender} · {formatDate(message.timestamp,true)}</span></button>)}</div></article></div>;
}

function WordsView({ analysis }: { analysis: ConversationAnalysis }) {
  const [limit, setLimit] = useState(25);
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">THE LANGUAGE OF THIS CONVERSATION</p><h2>Words that kept returning.</h2><p>Original text is never changed. Normalization only groups safe spelling variants for analysis.</p></section><div className="segmented">{[10,25,50].map((value) => <button className={limit===value?'active':''} key={value} type="button" onClick={() => setLimit(value)}>Top {value}</button>)}</div><section className="analysis-grid equal">
    {analysis.participants.slice(0,2).map((name,index) => <article className="chart-card word-card" key={name}><div className="card-heading"><div><p className="eyebrow">WORDS BY</p><h3>{name}</h3></div><span className={`avatar p${index}`}>{initials(name)}</span></div><div className="word-list">{(analysis.wordStats[name] as {word:string;count:number;messageRate:number}[]).slice(0,limit).map((entry,rank) => <div key={entry.word}><span className="rank">{String(rank+1).padStart(2,'0')}</span><strong dir="auto">{entry.word}</strong><i><b style={{width:`${Math.max(4, entry.count / Math.max((analysis.wordStats[name] as {count:number}[])[0]?.count ?? 1,1)*100)}%`}} /></i><span>{exactNumber.format(entry.count)}</span><small>{(entry.messageRate*100).toFixed(1)}% msgs</small></div>)}</div></article>)}
  </section><section className="analysis-grid equal">{analysis.participants.slice(0,2).map((name) => <article className="chart-card" key={name}><div className="card-heading"><div><p className="eyebrow">CHARACTERISTIC PHRASES</p><h3>{name}</h3></div><span className="label-chip">DETECTED</span></div><div className="phrase-cloud">{(analysis.phraseStats[name] as {phrase:string;count:number}[]).slice(0,18).map((entry) => <span dir="auto" key={entry.phrase}>{entry.phrase}<small>×{entry.count}</small></span>)}</div></article>)}</section></div>;
}

function QuotesView({ analysis, conversation }: { analysis: ConversationAnalysis; conversation: ConversationCandidate }) {
  const storageKey = `our-conversations:favorites:${conversation.id}`;
  const [favorites, setFavorites] = useState<string[]>(() => typeof window === 'undefined' ? [] : JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
  function toggle(id:string){ const next=favorites.includes(id)?favorites.filter((item)=>item!==id):[...favorites,id]; setFavorites(next); localStorage.setItem(storageKey,JSON.stringify(next)); }
  function exportCard(message: Message) { const canvas=document.createElement('canvas'); canvas.width=1200; canvas.height=1200; const ctx=canvas.getContext('2d'); if(!ctx)return; const gradient=ctx.createLinearGradient(0,0,1200,1200); gradient.addColorStop(0,'#151118'); gradient.addColorStop(1,'#443049'); ctx.fillStyle=gradient; ctx.fillRect(0,0,1200,1200); ctx.strokeStyle='rgba(221,196,230,.22)'; ctx.strokeRect(65,65,1070,1070); ctx.fillStyle='#b998c8'; ctx.font='700 25px Segoe UI'; ctx.fillText('OUR CONVERSATIONS',105,130); ctx.fillStyle='#f6eff8'; ctx.font='52px Georgia'; const words=`“${message.text}”`.split(' '); let line=''; let y=270; for(const word of words){const test=`${line}${word} `; if(ctx.measureText(test).width>980){ctx.fillText(line,105,y);line=`${word} `;y+=72;}else line=test;} ctx.fillText(line,105,y); ctx.fillStyle='#c2b4c6'; ctx.font='28px Segoe UI'; ctx.fillText(`${message.sender} · ${formatDate(message.timestamp,true)}`,105,1080); const link=document.createElement('a'); link.download='our-conversations-memory.png'; link.href=canvas.toDataURL('image/png'); link.click(); }
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">SUGGESTED, NEVER INVENTED</p><h2>Words worth finding again.</h2><p>These exact messages were conservatively detected from the archive. Their meaning remains yours to decide.</p></section>{analysis.quoteCandidates.length ? <section className="quote-grid">{analysis.quoteCandidates.map((message,index)=><article className={index%5===0?'quote-card featured':'quote-card'} key={message.id}><div className="quote-top"><span className="label-chip">SUGGESTED</span><button type="button" className={favorites.includes(message.id)?'favorite active':'favorite'} onClick={()=>toggle(message.id)} aria-label="Favorite quote">{favorites.includes(message.id)?'★':'☆'}</button></div><blockquote dir="auto">“{message.text}”</blockquote><footer><span className={`avatar p${analysis.participants.indexOf(message.sender)}`}>{initials(message.sender)}</span><p><strong>{message.sender}</strong><small>{formatDate(message.timestamp,true)} · {formatTime(message.timestamp)}</small></p></footer><button className="card-action" type="button" onClick={()=>exportCard(message)}>Export memory card</button></article>)}</section>:<EmptyState title="No suggested quotes yet" copy="The local scoring rules did not find messages that passed the conservative threshold." />}</div>;
}

function TimelineView({ analysis, setView }: { analysis: ConversationAnalysis; setView:(view:View)=>void }) {
  const topDays=[...analysis.daily].sort((a,b)=>b.messages-a.messages).slice(0,8);
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">ACTIVITY, NOT ASSUMPTIONS</p><h2>The shape of time.</h2><p>Spikes and returns are shown as message activity only. No meaning is assigned without explicit evidence.</p></section><section className="timeline-list">{topDays.map((day,index)=><article key={day.date}><div className="timeline-marker"><span>{index+1}</span></div><div><p className="eyebrow">{index===0?'MOST ACTIVE DAY':'ACTIVITY SPIKE'}</p><h3>{formatDate(Date.parse(`${day.date}T12:00:00`))}</h3><p>Message activity reached {exactNumber.format(day.messages)} messages and {exactNumber.format(day.words)} words on this day.</p><ParticipantKey participants={analysis.participants}/></div><button type="button" onClick={()=>setView('Chat Explorer')}>Open messages →</button></article>)}</section><section className="chart-card"><div className="card-heading"><div><p className="eyebrow">LONG SILENCES</p><h3>Returns after a gap</h3></div><span className="label-chip">NEUTRAL</span></div><div className="gap-list">{analysis.gaps.slice(0,10).map((gap)=><div key={`${gap.start}-${gap.end}`}><strong>{duration(gap.duration)}</strong><span>{formatDate(gap.start,true)} → {formatDate(gap.end,true)}</span><small>Conversation resumed by {gap.resumedBy}</small></div>)}</div></section></div>;
}

function ActivityView({ analysis }: { analysis: ConversationAnalysis }) {
  const max=Math.max(...analysis.hourly.map((entry)=>entry.count),1); const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">TIME OF DAY</p><h2>When the conversation comes alive.</h2><p>Based on the timestamps in the imported export and this device’s selected timezone.</p></section><section className="chart-card tall"><div className="card-heading"><div><p className="eyebrow">24-HOUR RHYTHM</p><h3>Messages by hour</h3></div></div><div className="hour-chart detailed">{analysis.hourly.map((entry)=><span key={entry.hour} style={{height:`${Math.max(3,entry.count/max*100)}%`}} title={`${entry.hour}:00 — ${entry.count} messages`}><i>{entry.hour%3===0?entry.hour:''}</i></span>)}</div></section><section className="analysis-grid equal"><article className="chart-card"><div className="card-heading"><div><p className="eyebrow">WEEKLY RHYTHM</p><h3>Days of the week</h3></div></div><div className="horizontal-bars">{analysis.weekdays.map((entry)=><div key={entry.day}><span>{weekdays[entry.day]}</span><i><b style={{width:`${entry.count/Math.max(...analysis.weekdays.map((item)=>item.count),1)*100}%`}}/></i><strong>{exactNumber.format(entry.count)}</strong></div>)}</div></article><article className="chart-card"><div className="card-heading"><div><p className="eyebrow">MESSAGE TYPES</p><h3>What was shared</h3></div></div><div className="type-list">{['text','image','video','voice','sticker','link','document','call'].map((kind)=><div key={kind}><span>{kind}</span>{analysis.participants.slice(0,2).map((name)=><b key={name}>{exactNumber.format((analysis.kindStats[name] as Record<string,number>)?.[kind]??0)}</b>)}</div>)}</div><ParticipantKey participants={analysis.participants}/></article></section></div>;
}

function RepliesView({ analysis, settings, onSettings }: { analysis:ConversationAnalysis;settings:AnalysisSettings;onSettings:(settings:AnalysisSettings)=>void }) {
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">REPLIES &amp; CONVERSATION STARTS</p><h2>The rhythm between messages.</h2><p>Consecutive messages from the same person are never counted as replies.</p></section><div className="settings-inline"><span>New session after</span>{([1,3,6,12,24] as const).map((hours)=><button className={settings.sessionGapHours===hours?'active':''} type="button" key={hours} onClick={()=>onSettings({...settings,sessionGapHours:hours})}>{hours}h</button>)}</div><section className="analysis-grid equal">{analysis.participants.slice(0,2).map((name,index)=>{const reply=analysis.replies.find((entry)=>entry.sender===name);const sessions=analysis.sessions.length||1;return <article className="reply-card" key={name}><header><span className={`avatar p${index}`}>{initials(name)}</span><div><small>REPLY PATTERN</small><h3>{name}</h3></div></header><div className="reply-primary"><p><small>MEDIAN REPLY</small><strong>{duration(reply?.medianMs??0)}</strong></p><p><small>AVERAGE REPLY</small><strong>{duration(reply?.averageMs??0)}</strong></p></div><div className="reply-grid"><p><span>Under 1 min</span><strong>{exactNumber.format(reply?.underMinute??0)}</strong></p><p><span>Under 5 min</span><strong>{exactNumber.format(reply?.underFive??0)}</strong></p><p><span>Under 15 min</span><strong>{exactNumber.format(reply?.underFifteen??0)}</strong></p><p><span>Over 1 hour</span><strong>{exactNumber.format(reply?.overHours??0)}</strong></p></div><footer><span>Sessions initiated</span><strong>{analysis.initiation[name]??0} <small>· {Math.round((analysis.initiation[name]??0)/sessions*100)}%</small></strong></footer></article>})}</section><section className="chart-card"><div className="card-heading"><div><p className="eyebrow">SESSION STARTERS</p><h3>Who opened the conversation?</h3></div><span className="label-chip">DETERMINISTIC</span></div><div className="initiation-bar">{analysis.participants.slice(0,2).map((name,index)=><span className={`fill tone-bg-${index}`} key={name} style={{width:`${(analysis.initiation[name]??0)/Math.max(analysis.sessions.length,1)*100}%`}} title={`${name}: ${analysis.initiation[name]??0}`}/>)}</div><div className="balance-numbers">{analysis.participants.slice(0,2).map((name)=><p key={name}><span>{name}</span><strong>{analysis.initiation[name]??0}</strong></p>)}</div></section></div>;
}

function EmojisView({ analysis }: { analysis:ConversationAnalysis }) {
  const all=analysis.participants.flatMap((name)=>analysis.emojiStats[name] as {emoji:string;count:number}[]); const overall=[...all.reduce((map,item)=>map.set(item.emoji,(map.get(item.emoji)??0)+item.count),new Map<string,number>())].sort((a,b)=>b[1]-a[1]);
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">EMOJI &amp; LAUGHTER</p><h2>The expressions between words.</h2><p>Emoji counts are exact. Humor indicators are labeled detected and use conservative local patterns.</p></section><section className="emoji-hero">{overall.slice(0,8).map(([emoji,count],index)=><article key={emoji}><span>{emoji}</span><strong>#{index+1}</strong><small>{exactNumber.format(count)} uses</small></article>)}</section><section className="analysis-grid equal">{analysis.participants.slice(0,2).map((name,index)=><article className="chart-card" key={name}><div className="card-heading"><div><p className="eyebrow">EMOJIS BY</p><h3>{name}</h3></div><span className={`avatar p${index}`}>{initials(name)}</span></div><div className="emoji-list">{(analysis.emojiStats[name] as {emoji:string;count:number}[]).slice(0,20).map((item,rank)=><div key={item.emoji}><span>{item.emoji}</span><strong>{item.count}</strong><small>#{rank+1}</small></div>)}</div><p className="detected-note"><span className="label-chip">DETECTED</span> {exactNumber.format(analysis.laughterStats[name]??0)} messages contain clear laughter indicators.</p></article>)}</section></div>;
}

function CalendarView({ analysis, setView }: { analysis:ConversationAnalysis;setView:(view:View)=>void }) {
  const [selected,setSelected]=useState(analysis.daily.at(-1)); const max=Math.max(...analysis.daily.map((day)=>day.messages),1);
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">CALENDAR HEATMAP</p><h2>Every day you found each other.</h2><p>Choose any active day to see its first and last messages.</p></section><section className="calendar-layout"><article className="chart-card"><div className="calendar-grid">{analysis.daily.slice(-366).map((day)=><button key={day.date} type="button" className={selected?.date===day.date?'selected':''} title={`${day.date}: ${day.messages} messages`} style={{'--intensity':Math.max(.08,day.messages/max)} as React.CSSProperties} onClick={()=>setSelected(day)}><span className="sr-only">{day.date}: {day.messages} messages</span></button>)}</div><div className="heat-legend"><span>Quiet</span>{[.08,.25,.45,.7,1].map((value)=><i key={value} style={{'--intensity':value} as React.CSSProperties}/>)}<span>Full</span></div></article>{selected&&<article className="day-detail"><p className="eyebrow">{selected.date}</p><h3>{exactNumber.format(selected.messages)} messages</h3><p>{exactNumber.format(selected.words)} words exchanged</p><div className="day-balance">{analysis.participants.slice(0,2).map((name,index)=><p key={name}><span className={`tone tone-${index}`}/><b>{name}</b><strong>{selected.bySender[name]??0}</strong></p>)}</div><div className="message-mini"><small>FIRST · {formatTime(selected.first.timestamp)}</small><p dir="auto">{selected.first.text||`[${selected.first.kind}]`}</p></div><div className="message-mini"><small>LAST · {formatTime(selected.last.timestamp)}</small><p dir="auto">{selected.last.text||`[${selected.last.kind}]`}</p></div><button className="primary-button" type="button" onClick={()=>setView('Chat Explorer')}>Open chat explorer</button></article>}</section></div>;
}

function HowWeText({ analysis }: { analysis:ConversationAnalysis }) {
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">DESCRIPTIVE, NOT PSYCHOLOGICAL</p><h2>How you text.</h2><p>Patterns in length, questions, replies, and bursts — without guessing motives.</p></section><section className="style-grid">{analysis.participants.slice(0,2).map((name,index)=>{const reply=analysis.replies.find((item)=>item.sender===name);const messages=analysis.bySender[name]||1;return <article key={name}><header><span className={`avatar p${index}`}>{initials(name)}</span><h3>{name}</h3></header><div className="style-stat"><span>Average message</span><strong>{analysis.averageLength[name].toFixed(0)} characters</strong><i><b style={{width:`${Math.min(100,analysis.averageLength[name]/3)}%`}}/></i></div><div className="style-stat"><span>Question rate</span><strong>{((analysis.questionStats[name]??0)/messages*100).toFixed(1)}%</strong><i><b style={{width:`${Math.min(100,(analysis.questionStats[name]??0)/messages*500)}%`}}/></i></div><div className="style-stat"><span>Median reply</span><strong>{duration(reply?.medianMs??0)}</strong><i><b style={{width:`${Math.min(100,(reply?.medianMs??0)/3_600_000*100)}%`}}/></i></div><div className="style-stat"><span>Total words</span><strong>{number.format(analysis.wordsBySender[name]??0)}</strong><i><b style={{width:`${(analysis.wordsBySender[name]??0)/Math.max(...Object.values(analysis.wordsBySender),1)*100}%`}}/></i></div></article>})}</section><section className="chart-card"><div className="card-heading"><div><p className="eyebrow">WHAT THE DATA SAYS</p><h3>Plain-language comparison</h3></div><span className="label-chip">DETERMINISTIC</span></div><ul className="insight-list">{analysis.participants.slice(0,2).map((name)=><li key={name}><span>{name}</span> wrote {((analysis.bySender[name]??0)/Math.max(analysis.totalMessages,1)*100).toFixed(1)}% of messages, averaging {analysis.averageLength[name].toFixed(0)} characters each.</li>)}<li><span>Sessions</span> were detected using {analysis.sessions.length} gaps of the configured length; changing the threshold recalculates them.</li></ul></section></div>;
}

function MemoriesView({ analysis, setView }: { analysis:ConversationAnalysis;setView:(view:View)=>void }) {
  const sharedWords=analysis.participants.length>=2?(analysis.wordStats[analysis.participants[0]] as {word:string;count:number}[]).filter((item)=>(analysis.wordStats[analysis.participants[1]] as {word:string}[]).some((other)=>other.word===item.word)).slice(0,12):[];
  return <div className="view-stack"><section className="memories-hero"><p className="eyebrow">THINGS WE SAID</p><h2>A little memory book,<br />written in real words.</h2><p>Everything below comes from exact messages and repeated expressions in this archive.</p></section><section className="memory-columns">{analysis.participants.slice(0,2).map((name)=><article key={name}><p className="eyebrow">THINGS {name.toLocaleUpperCase()} SAID</p>{analysis.quoteCandidates.filter((message)=>message.sender===name).slice(0,3).map((message)=><blockquote dir="auto" key={message.id}>“{message.text}”<small>{formatDate(message.timestamp,true)}</small></blockquote>)}</article>)}</section><article className="shared-language"><p className="eyebrow">WORDS THAT BECAME PART OF THE CONVERSATION</p><h3>Things you both kept saying</h3><div>{sharedWords.map((item)=><span dir="auto" key={item.word}>{item.word}<small>×{item.count}</small></span>)}</div><button type="button" onClick={()=>setView('Words')}>Explore all words →</button></article></div>;
}

function ChatExplorer({ conversation, analysis }: { conversation:ConversationCandidate;analysis:ConversationAnalysis }) {
  const [query,setQuery]=useState(''); const [sender,setSender]=useState('all'); const [kind,setKind]=useState('all'); const [page,setPage]=useState(0); const pageSize=80;
  const filtered=useMemo(()=>conversation.messages.filter((message)=>(sender==='all'||message.sender===sender)&&(kind==='all'||message.kind===kind)&&(!query||message.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))),[conversation.messages,query,sender,kind]);
  const start=Math.max(0,filtered.length-(page+1)*pageSize); const visible=filtered.slice(start,filtered.length-page*pageSize);
  return <div className="view-stack explorer-view"><section className="view-heading"><p className="eyebrow">SEARCHABLE RAW CONVERSATION</p><h2>Find the original moment.</h2><p>{exactNumber.format(filtered.length)} messages match the current filters.</p></section><div className="explorer-toolbar"><label><span className="sr-only">Search messages</span><input value={query} onChange={(event)=>{setQuery(event.target.value);setPage(0);}} placeholder="Search exact words, phrases, or emoji…" /></label><select aria-label="Filter sender" value={sender} onChange={(event)=>{setSender(event.target.value);setPage(0);}}><option value="all">Both people</option>{analysis.participants.map((name)=><option key={name}>{name}</option>)}</select><select aria-label="Filter message type" value={kind} onChange={(event)=>{setKind(event.target.value);setPage(0);}}><option value="all">All message types</option>{['text','image','video','voice','sticker','link','document','call','deleted'].map((item)=><option key={item}>{item}</option>)}</select></div><section className="chat-window">{start>0&&<button className="load-more" type="button" onClick={()=>setPage(page+1)}>Load {Math.min(pageSize,start)} earlier messages</button>}{visible.map((message,index)=>{const participantIndex=analysis.participants.indexOf(message.sender);const showSender=index===0||visible[index-1].sender!==message.sender;return <div className={`message-row person-${participantIndex}`} key={message.id}>{showSender&&<span className={`avatar p${participantIndex}`}>{initials(message.sender)}</span>}<div className="message-bubble"><header>{showSender&&<strong>{message.sender}</strong>}<time>{formatDate(message.timestamp,true)} · {formatTime(message.timestamp)}</time></header>{message.text?<p dir="auto">{message.text}</p>:<p className="attachment-placeholder">[{message.kind}{message.attachmentName?` · ${message.attachmentName}`:''}]</p>}</div></div>})}</section></div>;
}

function SettingsView({ conversation, settings, onSettings, onReset }: { conversation:ConversationCandidate;settings:AnalysisSettings;onSettings:(settings:AnalysisSettings)=>void;onReset:()=>void }) {
  return <div className="view-stack"><section className="view-heading"><p className="eyebrow">SETTINGS</p><h2>Keep the analysis yours.</h2><p>These preferences and the imported archive are stored only in this browser.</p></section><section className="settings-list"><article><div><h3>Conversation sessions</h3><p>A new session begins after this much inactivity.</p></div><select value={settings.sessionGapHours} onChange={(event)=>onSettings({...settings,sessionGapHours:Number(event.target.value) as AnalysisSettings['sessionGapHours']})}>{[1,3,6,12,24].map((hours)=><option key={hours} value={hours}>{hours} hours</option>)}</select></article><article><div><h3>Arabic normalization</h3><p>Safely group Alef variants, diacritics, and tatweel for analytics only.</p></div><button className={settings.normalizeArabic?'toggle active':'toggle'} type="button" onClick={()=>onSettings({...settings,normalizeArabic:!settings.normalizeArabic})}><span/></button></article><article><div><h3>ة / ه normalization</h3><p>Off by default because this merge is not appropriate for every analysis.</p></div><button className={settings.normalizeTaaMarbuta?'toggle active':'toggle'} type="button" onClick={()=>onSettings({...settings,normalizeTaaMarbuta:!settings.normalizeTaaMarbuta})}><span/></button></article><article><div><h3>Exclude common stop words</h3><p>Hide common Arabic and English words in frequency views.</p></div><button className={settings.excludeStopWords?'toggle active':'toggle'} type="button" onClick={()=>onSettings({...settings,excludeStopWords:!settings.excludeStopWords})}><span/></button></article></section><section className="danger-zone"><div><p className="eyebrow">LOCAL DATA</p><h3>Remove this archive from the device</h3><p>{conversation.title} · {exactNumber.format(conversation.messages.length)} messages</p></div><button type="button" onClick={onReset}>Delete local data</button></section></div>;
}

function EmptyState({title,copy}:{title:string;copy:string}){return <section className="empty-state"><span>✦</span><h3>{title}</h3><p>{copy}</p></section>}

export default function ConversationApp() {
  const [view,setView]=useState<View>('Overview'); const [conversation,setConversation]=useState<ConversationCandidate|null>(null); const [settings,setSettings]=useState<AnalysisSettings>(DEFAULT_SETTINGS); const [loading,setLoading]=useState(true);
  useEffect(()=>{void Promise.all([loadLatestConversation(),loadSettings()]).then(([saved,savedSettings])=>{setConversation(saved);if(savedSettings)setSettings(savedSettings);}).finally(()=>setLoading(false));},[]);
  const analysis=useMemo(()=>conversation?buildAnalysis(conversation.messages,settings):null,[conversation,settings]);
  async function openCandidate(candidate:ConversationCandidate){setLoading(true);await saveConversation(candidate);setConversation(candidate);setView('Overview');setLoading(false);}
  function updateSettings(next:AnalysisSettings){setSettings(next);void saveSettings(next);}
  async function reset(){if(!window.confirm('Delete the imported archive and local settings from this browser?'))return;await resetLocalData();setConversation(null);setView('Overview');}
  let content:React.ReactNode;
  if(!conversation||!analysis) content=<ImportExperience onImported={(candidate)=>void openCandidate(candidate)}/>;
  else if(view==='Overview') content=<Overview analysis={analysis} setView={setView}/>;
  else if(view==='Us') content=<UsView analysis={analysis} setView={setView}/>;
  else if(view==='Words') content=<WordsView analysis={analysis}/>;
  else if(view==='Quotes') content=<QuotesView analysis={analysis} conversation={conversation}/>;
  else if(view==='Timeline') content=<TimelineView analysis={analysis} setView={setView}/>;
  else if(view==='Activity') content=<ActivityView analysis={analysis}/>;
  else if(view==='Replies') content=<RepliesView analysis={analysis} settings={settings} onSettings={updateSettings}/>;
  else if(view==='Emojis') content=<EmojisView analysis={analysis}/>;
  else if(view==='Calendar') content=<CalendarView analysis={analysis} setView={setView}/>;
  else if(view==='How We Text') content=<HowWeText analysis={analysis}/>;
  else if(view==='Memories') content=<MemoriesView analysis={analysis} setView={setView}/>;
  else if(view==='Chat Explorer') content=<ChatExplorer conversation={conversation} analysis={analysis}/>;
  else content=<SettingsView conversation={conversation} settings={settings} onSettings={updateSettings} onReset={()=>void reset()}/>;
  return <main className="app-shell"><aside className="sidebar"><button className="brand-mark" type="button" aria-label="Go to overview" onClick={()=>setView('Overview')}><span/><span/></button><nav aria-label="Main navigation">{navigation.map((item,index)=><button className={view===item?'nav-item active':'nav-item'} key={item} type="button" onClick={()=>setView(item)} disabled={!conversation&&index>0}><span className="nav-dot"/><span>{item}</span></button>)}</nav><div className="privacy-chip"><span>⌁</span> Stays on this device</div></aside><section className="main-panel"><header className="topbar"><div><p className="eyebrow">{conversation?`${conversation.participants.slice(0,2).join(' & ')} · private archive`:'A private space for two people'}</p><h1>Our Conversations</h1></div>{conversation&&<button className="settings-button" type="button" onClick={()=>setView('Settings')}>Settings</button>}</header>{loading?<div className="loading-state"><span/><p>Preparing your private archive…</p></div>:content}</section></main>;
}
