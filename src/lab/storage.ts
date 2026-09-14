import fs from 'node:fs';
import path from 'node:path';

import type { OutboundItem } from './outbox';
import type { PersistedWork } from './inbox';

export interface PersistedLabState {
  inbound: PersistedWork[];
  outbound: OutboundItem[];
  updatedAt: string;
}

const defaultState: PersistedLabState = {
  inbound: [],
  outbound: [],
  updatedAt: new Date(0).toISOString(),
};

const statePath = path.resolve(process.cwd(), process.env.AGENT_STATE_PATH || 'state/lab-state.json');

export function getStatePath() {
  return statePath;
}

export function clearState(): void {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  saveState({
    inbound: [],
    outbound: [],
    updatedAt: new Date().toISOString(),
  });
}

export function loadState(): PersistedLabState {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedLabState;
    return {
      inbound: parsed.inbound ?? [],
      outbound: parsed.outbound ?? [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { ...defaultState, updatedAt: new Date().toISOString() };
  }
}

export function saveState(state: PersistedLabState): void {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    statePath,
    `${JSON.stringify(
      {
        ...state,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
