// Dev-server proxy (ng serve). Forwards /fhir to the HAPI container from compose.yaml.
// The port is resolved like `podman compose` does: shell environment, then .env, then the default.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const fhirPort = process.env.FHIR_HTTP_PORT || dotenv.FHIR_HTTP_PORT || '8080';

export default {
  '/fhir': {
    target: `http://localhost:${fhirPort}`,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
};
