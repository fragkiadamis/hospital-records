// Sends the sample DICOM studies (scripts/seed/dicom/, git-ignored) to the local Orthanc over
// DICOM C-STORE: npm run seed:orthanc
// Uses dcmsend from DCMTK, so DCMTK must be installed. Orthanc keeps an instance it already has,
// so running it again does not create duplicates. Port and AE title are resolved like seed.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const setting = (name, fallback) => process.env[name] || dotenv[name] || fallback;
const dicomPort = setting('ORTHANC_DICOM_PORT', '4242');
const calledAet = setting('ORTHANC_DICOM_AET', 'HOSPITAL_RECORDS');
// Where the compose stack publishes its ports: localhost unless bound to one specific address.
const bind = setting('BIND_ADDRESS', '127.0.0.1');
const host = ['127.0.0.1', '0.0.0.0', '::', ''].includes(bind) ? 'localhost' : bind;

const dicomDir = fileURLToPath(new URL('./dicom', import.meta.url));
if (!existsSync(dicomDir)) {
  console.error(`No sample studies in ${dicomDir}. Put the DICOM series there (one folder each).`);
  process.exit(1);
}

// dcmsend is silent on success; its report file gives the per-status counts printed at the end.
const reportDir = mkdtempSync(join(tmpdir(), 'seed-orthanc-'));
const report = join(reportDir, 'report.txt');

console.log(`Sending ${dicomDir} to ${calledAet}@${host}:${dicomPort} ...`);
const { status, error } = spawnSync(
  'dcmsend',
  [
    host,
    dicomPort,
    dicomDir,
    ...['--scan-directories', '--recurse', '--scan-pattern', '*.dcm'],
    ...['--aetitle', 'HR_SEED', '--call', calledAet],
    '--no-halt', // skip unreadable files instead of stopping the whole transfer
    ...['--create-report-file', report],
  ],
  { stdio: 'inherit' },
);

if (error?.code === 'ENOENT') {
  console.error('dcmsend not found. Install DCMTK (dnf/apt install dcmtk, brew install dcmtk).');
  process.exit(1);
}
const summary = existsSync(report)
  ? readFileSync(report, 'utf8').split('Status Summary\n--------------\n')[1]?.trim()
  : undefined;
rmSync(reportDir, { recursive: true, force: true });
if (summary) console.log(summary);

if (status !== 0) {
  console.error(`dcmsend failed (exit ${status}). Is Orthanc running? podman compose up -d`);
  process.exit(1);
}
console.log(`Seeded the sample studies into Orthanc (${calledAet}@${host}:${dicomPort})`);
