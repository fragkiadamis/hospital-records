// Loads the development seed data (seed-bundle.json) into the local HAPI server: npm run seed
// Every entry is a PUT with a fixed id, so running it again resets the seed resources
// instead of creating duplicates. The port is resolved like proxy.conf.mjs does.
//
// It also installs the custom search parameters the patient search needs, built from the app's
// list of patient identifier types (patient-identifiers.json): one string search on any
// identifier's value, and one per identifier type. HAPI reindexes the patients in the background,
// so a new search parameter takes a minute or so to find existing patients.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const setting = (name, fallback) => process.env[name] || dotenv[name] || fallback;
const fhirPort = setting('FHIR_HTTP_PORT', '8080');
// Where the compose stack publishes its ports: localhost unless bound to one specific address.
const bind = setting('BIND_ADDRESS', '127.0.0.1');
const host = ['127.0.0.1', '0.0.0.0', '::', ''].includes(bind) ? 'localhost' : bind;
const base = `http://${host}:${fhirPort}/fhir`;

const seed = JSON.parse(readFileSync(new URL('./seed-bundle.json', import.meta.url), 'utf8'));
const identifiers = JSON.parse(
  readFileSync(
    new URL('../../src/app/fhir/resources/patient/patient-identifiers.json', import.meta.url),
    'utf8',
  ),
);

/** A Patient string search parameter, matched like a name: from the start, ignoring case. */
function searchParameter(code, description, expression) {
  const id = `patient-${code}`;
  return {
    fullUrl: `SearchParameter/${id}`,
    resource: {
      resourceType: 'SearchParameter',
      id,
      url: `urn:hospital-records:SearchParameter/${id}`,
      name: code,
      status: 'active',
      description,
      code,
      base: ['Patient'],
      type: 'string',
      expression,
    },
    request: { method: 'PUT', url: `SearchParameter/${id}` },
  };
}

const searchParameters = [
  searchParameter(
    identifiers.anyIdentifierSearchParam,
    'The value of any of the patient identifiers',
    'Patient.identifier.value',
  ),
  ...identifiers.types.map((type) =>
    searchParameter(
      type.searchParam,
      `The patient's ${type.label}`,
      `Patient.identifier.where(system='${type.system}').value`,
    ),
  ),
];
const bundle = JSON.stringify({ ...seed, entry: [...searchParameters, ...seed.entry] });

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
