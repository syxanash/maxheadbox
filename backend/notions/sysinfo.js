import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default function (app) {
  app.get('/sysinfo', async (_req, res) => {
    try {
      const dateTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

      let cpuTemperature = 'N/A';
      try {
        const { stdout } = await execAsync('vcgencmd measure_temp');
        const match = stdout.match(/[0-9.]+/);
        if (match) cpuTemperature = match[0];
      } catch {}

      let uptime = 'N/A';
      try {
        const { stdout } = await execAsync('uptime');
        uptime = stdout.trim();
      } catch {}

      res.json({ date_time: dateTime, cpu_temperature: cpuTemperature, uptime });
    } catch (err) {
      res.json({ error: `Failed to get system info: ${err.message}` });
    }
  });
}
