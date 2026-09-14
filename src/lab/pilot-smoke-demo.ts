import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findPort(start: number): Promise<number> {
  for (let port = start; port < start + 30; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return start;
}

(async () => {
  const port = await findPort(Number(process.env.PILOT_SMOKE_PORT || 3001));
  const baseHost = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    PILOT_SENDERS: process.env.PILOT_SENDERS || 'remetente-demo-A',
    CHANNEL_BUSINESS_MAP: process.env.CHANNEL_BUSINESS_MAP || 'canal-demo:demo',
    AGENT_CONNECTOR_TOKEN: process.env.AGENT_CONNECTOR_TOKEN || 'token-teste-local',
    PILOT_SMOKE_BASE_HOST: baseHost,
  };

  const cmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const args = process.platform === 'win32' ? ['/c', 'npm run pilot'] : ['-c', 'npm run pilot'];

  const pilotProc = spawn(cmd, args, { env, stdio: 'inherit' });

  await delay(1800);

  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'src/lab/pilot-smoke.ts', `--baseHost=${baseHost}`], {
    stdio: 'inherit',
    env,
  });

  pilotProc.kill('SIGTERM');
  process.exit(result.status ?? 0);
})();
