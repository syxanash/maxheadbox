import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, truncateSync } from 'fs';
import path from 'path';
import os from 'os';

const NOTES_FILE = path.join(os.homedir(), 'Desktop', 'notes.txt');

export default function (app) {
  app.get('/notes', (_req, res) => {
    try {
      if (!existsSync(NOTES_FILE)) writeFileSync(NOTES_FILE, '');
      const notes = readFileSync(NOTES_FILE, 'utf-8');
      res.json(notes.trim() === '' ? { text: 'No notes found.' } : { text: notes });
    } catch (err) {
      res.json({ error: `Failed to retrieve notes: ${err.message}` });
    }
  });

  app.post('/save-note', (req, res) => {
    const note = req.body.note ?? req.query.note ?? '';
    const dir = path.dirname(NOTES_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(NOTES_FILE, note + '\n');
    res.json({ message: 'successfully saved the note!' });
  });

  app.post('/clear-notes', (_req, res) => {
    const dir = path.dirname(NOTES_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    truncateSync(NOTES_FILE, 0);
    res.json({ message: 'Successfully cleared all notes!' });
  });
}
