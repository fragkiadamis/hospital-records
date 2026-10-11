// Loads the development seed data (seed-bundle.json) into the local HAPI server: npm run seed
// Every entry is a PUT with a fixed id, so running it again resets the seed resources
// instead of creating duplicates. The port is resolved like proxy.conf.mjs does.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const fhirPort = process.env.FHIR_HTTP_PORT || dotenv.FHIR_HTTP_PORT || '8080';
const base = `http://localhost:${fhirPort}/fhir`;

const bundle = readFileSync(new URL('./seed-bundle.json', import.meta.url), 'utf8');

let response;
try {
  response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: bundle,
  });
} catch {
  console.error(`Cannot reach HAPI at ${base}. Start it with: podman compose up -d`);
  process.exit(1);
}

const result = await response.json();
if (!response.ok) {
  const issues = result.issue?.map((i) => i.diagnostics ?? i.code).join('\n  ') ?? '';
  console.error(`Seeding failed (HTTP ${response.status})\n  ${issues}`);
  process.exit(1);
}

for (const entry of result.entry ?? []) {
  console.log(`${entry.response.status.padEnd(12)} ${entry.response.location}`);
}
console.log(`Seeded ${result.entry?.length ?? 0} resources into ${base}`);
