import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';

function getPortPid(port: number): number[] {
  try {
    const data = execSync(`Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: 'powershell.exe',
      encoding: 'utf8',
    });
    return data
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => Number(line))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

const PORT = Number(process.env.PILOT_E2E_PORT || '3002');
const pids = getPortPid(PORT);
for (const pid of pids) {
  try {
    execSync(`Stop-Process -Id ${pid} -Force`, { shell: 'powershell.exe', stdio: 'ignore' });
    // eslint-disable-next-line no-console
    console.log(`killed ${pid}`);
  } catch {
    // ignore
  }
}

const pilot = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'pilot'],
  {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    shell: true,
    env: {
      ...process.env,
      APP_MODE: 'pilot',
      AGENT_CONNECTOR_TOKEN: 'token-teste-local',
      PILOT_SENDERS: 'remetente-demo-A',
      PORT: String(PORT),
    },
  },
);
pilot.unref();

await new Promise((resolve) => setTimeout(resolve, 2000));

let commandOutput = '';
try {
  commandOutput = execSync('npm.cmd run pilot:e2e', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  // eslint-disable-next-line no-console
  console.log(commandOutput);
} catch (error: any) {
  if (error?.stdout) {
    console.log(error.stdout.toString());
  }
  if (error?.stderr) {
    console.error(error.stderr.toString());
  }
  process.exitCode = 1;
} finally {
  try {
    pilot.kill();
  } catch {
    // ignore
  }
  await fs.writeFile('state/.pilot-clean-e2e.last.log', commandOutput || String(process.exitCode || 0), 'utf8');
}
