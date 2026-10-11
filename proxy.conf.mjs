// Dev-server proxy (ng serve). In deployment nginx does the same.
//   /fhir → the HAPI container from compose.yaml
//   /tx   → the terminology server (ICD-10 search); HL7's public test server unless
//           TERMINOLOGY_URL says otherwise
// Settings are resolved like `podman compose` does: shell environment, then .env, then defaults.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const setting = (name, fallback) => process.env[name] || dotenv[name] || fallback;

const terminology = new URL(setting('TERMINOLOGY_URL', 'https://tx.fhir.org/r4'));
// Where the compose stack publishes its ports: localhost unless bound to one specific address.
const bind = setting('BIND_ADDRESS', '127.0.0.1');
const stackHost = ['127.0.0.1', '0.0.0.0', '::', ''].includes(bind) ? 'localhost' : bind;

export default {
  '/fhir': {
    target: `http://${stackHost}:${setting('FHIR_HTTP_PORT', '8080')}`,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
  '/tx': {
    target: terminology.origin,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/tx': terminology.pathname.replace(/\/$/, '') },
  },
};
