import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execFile } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { readdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawRecordingsDir = process.env.RECORDINGS_DIR || 'recordings';
const RECORDINGS_DIR = rawRecordingsDir.startsWith('~')
  ? path.join(os.homedir(), rawRecordingsDir.slice(1))
  : path.resolve(__dirname, rawRecordingsDir);
if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });
console.log(`RECORDINGS_DIR: ${RECORDINGS_DIR}`);

let recordingProcess = null;
let listenerProcess = null;
let currentRecordingFile = null;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Only accept WebSocket upgrades at /ws
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

async function transcribeFile(filePath) {
  const response = await fetch('http://localhost:8000/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  return response.json();
}

function isRecording() {
  return recordingProcess !== null;
}

// Cleanup on exit
function cleanup() {
  console.log('Shutting down... cleaning up child processes.');
  if (recordingProcess) {
    try {
      process.kill(recordingProcess.pid, 'SIGTERM');
      console.log(`Stopped recording process ${recordingProcess.pid}.`);
    } catch {}
  }
  if (listenerProcess) {
    try {
      process.kill(listenerProcess.pid, 'SIGKILL');
      console.log(`Stopped listener process ${listenerProcess.pid}.`);
    } catch {}
  }
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

// MARK: Middleware Setup

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.options('*', (_req, res) => res.sendStatus(200));

// MARK: Main Routes

app.get('/', (_req, res) => {
  res.json({ message: 'Express is ok' });
});

// Unused route, kept for future reference
app.post('/speak', (req, res) => {
  const { content } = req.body;
  const cmd = `amixer set Master 20% && echo "${content}" | piper --model en_US-amy-medium --output-raw | aplay -r 22050 -f S16_LE -t raw -`;
  execFile('sh', ['-c', cmd], (err) => {
    if (err) console.error(`speak error: ${err.message}`);
  });
  console.log(`Spoke text: ${content}`);
  res.json({ message: 'ok' });
});

app.post('/start_recording', (_req, res) => {
  if (isRecording()) {
    return res.status(409).json({ error: 'Recording is already in progress.' });
  }

  if (listenerProcess) {
    try { process.kill(listenerProcess.pid, 'SIGKILL'); } catch {}
    console.log(`Stopped listener process ${listenerProcess.pid}.`);
    listenerProcess = null;
  }

  const filename = 'recording.wav';
  const filepath = path.join(RECORDINGS_DIR, filename);

  try {
    const child = spawn('rec', [
      '-c', '1', '-r', '16000', filepath,
      'silence', '1', '0.1', '1%', '1', '1.0', '1%',
    ]);
    child.stderr.on('data', (data) => console.error(`rec stderr: ${data}`));

    recordingProcess = child;
    currentRecordingFile = filepath;
    console.log(`Started recording (PID: ${child.pid}) to ${filepath}`);

    child.on('close', async () => {
      console.log(`Process ${child.pid} finished. Starting transcription...`);
      broadcast({ event: 'process_recording' });

      if (existsSync(filepath)) {
        try {
          const segments = await transcribeFile(filepath);
          const messageOutput = segments.map((s) => s.text).join('');
          broadcast({ event: 'recording_finished', message: 'Recording stopped.', output: messageOutput });
          console.log('Sent recording_finished event via WebSocket.');
        } catch (err) {
          broadcast({ event: 'recording_error', error: `Transcription failed: ${err.message}` });
        }
      } else {
        console.warn('Recording file was not found after process finished.');
        broadcast({ event: 'recording_error', error: 'Recording stopped, but the output file was not found.' });
      }

      recordingProcess = null;
      currentRecordingFile = null;
    });

    res.json({ message: 'Recording started.', filename, filepath });
  } catch (err) {
    console.error(`Error starting recording: ${err.message}`);
    res.status(500).json({ error: `Failed to start recording. Is 'rec' installed and in PATH? ${err.message}` });
  }
});

app.post('/stop_recording', (_req, res) => {
  if (!isRecording()) {
    return res.status(400).json({ error: 'No recording is currently in progress.' });
  }

  try {
    recordingProcess.kill('SIGINT');
    console.log(`Sent SIGINT to PID ${recordingProcess.pid}.`);
    res.json({ message: 'Manual stop initiated.' });
  } catch (err) {
    console.error(`Error stopping recording: ${err.message}`);
    res.status(500).json({ error: `An unexpected error occurred: ${err.message}` });
  }
});

app.get('/is_recording', (_req, res) => {
  if (isRecording()) {
    res.json({ message: 'recording', current_file: currentRecordingFile });
  } else {
    res.json({ message: 'idle' });
  }
});

app.get('/ws', (_req, res) => {
  res.status(426).send('WebSocket connection required');
});

app.post('/spawn-listener', (_req, res) => {
  if (!listenerProcess) {
    listenerProcess = spawn('python3', ['backend/awaker.py'], { detached: true, stdio: 'ignore' });
    listenerProcess.unref();
    console.log(`Spawning listener: ${listenerProcess.pid}`);
  }
  res.json({ message: 'listener spawned' });
});

app.post('/wake', (_req, res) => {
  if (listenerProcess) {
    try { process.kill(listenerProcess.pid, 'SIGKILL'); } catch {}
    listenerProcess = null;
  }
  broadcast({ event: 'wake_word_received' });
  res.json({ message: 'wake word received' });
});

// MARK: WebSocket Handler
wss.on('connection', (ws) => {
  console.log('WebSocket opened');
  ws.on('message', (msg) => console.log(`Received message: ${msg}`));
  ws.on('close', () => console.log('WebSocket closed'));
});

// MARK: Server Listener

// Dynamically load notions
const notionsDir = path.join(__dirname, 'notions');
const notionFiles = (await readdir(notionsDir)).filter((f) => f.endsWith('.js'));
for (const file of notionFiles) {
  const notion = await import(path.join(notionsDir, file));
  notion.default(app);
  console.log(`Loaded notion: ${file}`);
}

const PORT = process.env.PORT || 4567;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
