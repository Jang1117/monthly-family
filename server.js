const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const DATA_FILE = path.join(__dirname, 'data', 'events.json');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = 'events';
const useRedis = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

async function readEventsFromFile() {
  try {
    const txt = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeEventsToFile(events) {
  await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(events, null, 2), 'utf8');
}

async function readEventsFromRedis() {
  const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`);
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function writeEventsToRedis(events) {
  const res = await fetch(`${UPSTASH_URL}/set/${REDIS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(events),
  });
  if (!res.ok) throw new Error(`Upstash SET failed: ${res.status}`);
}

const readEvents = useRedis ? readEventsFromRedis : readEventsFromFile;
const writeEvents = useRedis ? writeEventsToRedis : writeEventsToFile;

app.get('/events', async (req, res) => {
  const events = await readEvents();
  res.json(events);
});

app.post('/events', async (req, res) => {
  const ev = req.body;
  const events = await readEvents();
  ev.id = Date.now().toString();
  events.push(ev);
  await writeEvents(events);
  res.json(ev);
});

app.put('/events/:id', async (req, res) => {
  const id = req.params.id;
  const update = req.body;
  let events = await readEvents();
  events = events.map(ev => (ev.id === id ? { ...ev, ...update, id } : ev));
  await writeEvents(events);
  res.json({ ok: true });
});

app.delete('/events/:id', async (req, res) => {
  const id = req.params.id;
  let events = await readEvents();
  events = events.filter(ev => ev.id !== id);
  await writeEvents(events);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Storage backend: ${useRedis ? 'Upstash Redis' : 'local file (data/events.json)'}`);
});
