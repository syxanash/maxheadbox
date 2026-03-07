import { execFile } from 'child_process';

export default function (app) {
  app.get('/fortune', (_req, res) => {
    execFile('fortune', (err, stdout) => {
      if (err) return res.json({ error: `Failed to get fortune command output: ${err.message}` });
      res.json({ text: stdout });
    });
  });
}
