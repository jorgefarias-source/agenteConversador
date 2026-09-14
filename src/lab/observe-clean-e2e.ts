import { execSync, spawn } from 'node:child_process';

const port = Number(process.env.OBSERVE_E2E_PORT || '3002');
const base = `http://127.0.0.1:${port}`;

function getPortPids(portToCheck: number): number[] {
  try {
    const raw = execSync(`Get-NetTCPConnection -LocalPort ${portToCheck} -State Listen | Select-Object -ExpandProperty OwningProcess`, {
      shell: 'powershell.exe',
      encoding: 'utf8',
    });
    return raw
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

const pids = getPortPids(port);
for (const pid of pids) {
  try {
    execSync(`Stop-Process -Id ${pid} -Force`, { shell: 'powershell.exe', stdio: 'ignore' });
    console.log(`killed ${pid}`);
  } catch {
    // ignore
  }
}

const proc = spawn(
  process.platform === 'win32' ? 'cmd.exe' : 'npm',
  process.platform === 'win32' ? ['/c', 'npm.cmd', 'run', 'observe'] : ['run', 'observe'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_MODE: 'observacao',
      AGENT_CONNECTOR_TOKEN: 'token-teste-local',
      PORT: String(port),
    },
    detached: true,
    stdio: 'ignore',
    shell: false,
  },
);
proc.unref();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
await delay(2000);

let output = '';
try {
  output = execSync(`Set-Location '${process.cwd()}'; npm.cmd run observe:e2e`, {
    shell: 'powershell.exe',
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(output);
} catch (error: any) {
  if (error?.stdout) console.log(error.stdout.toString());
  if (error?.stderr) console.error(error.stderr.toString());
  process.exitCode = 1;
} finally {
  try {
    execSync(`Set-Location '${process.cwd()}'; npm.cmd run observe:state:reset`, {
      shell: 'powershell.exe',
      stdio: 'ignore',
    });
  } catch {
    // ignore
  }
  try {
    proc.kill();
  } catch {
    // ignore
  }
}

