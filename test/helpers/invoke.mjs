import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './runtime.mjs';

let serial = 0;

export function invoke(command, payload, { stateDir, runId = null, expectedRevision } = {}) {
  if (!stateDir) throw new Error('Explicit isolated stateDir required');
  const statePath = join(stateDir, 'account-state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  const writes = command === 'record' || command === 'news-step' || (command === 'config' && payload.operation === 'update');
  const request = { schema_version: 1, run_id: runId, expected_revision: expectedRevision ?? (writes ? state?.revision ?? 0 : null), payload };
  const workDir = join(stateDir, '.test-invocations');
  mkdirSync(workDir, { recursive: true });
  const stem = `${process.pid}-${serial++}-${command}-${payload.operation ?? 'compute'}`;
  const input = join(workDir, `${stem}-input.json`);
  const output = join(workDir, `${stem}-output.json`);
  writeFileSync(input, `${JSON.stringify(request, null, 2)}\n`);
  const entry = fileURLToPath(runtimeUrl('scripts/x-ops.mjs'));
  const proc = spawnSync(process.execPath, [entry, command, '--input', input, '--output', output, '--state-dir', stateDir], { encoding: 'utf8' });
  if (proc.error) throw proc.error;
  const envelope = JSON.parse(proc.stdout);
  if (![0, 3].includes(proc.status)) throw Object.assign(new Error(JSON.stringify(envelope.errors)), { envelope, exit_code: proc.status });
  return { envelope, exit_code: proc.status };
}
