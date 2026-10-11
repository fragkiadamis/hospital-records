// Dev-server proxy (ng serve). In deployment nginx does the same.
//   /fhir      → the HAPI container from compose.yaml
//   /dicom-web → Orthanc's DICOMweb API, logged in with ORTHANC_USER / ORTHANC_PASSWORD here, so
//                the credentials never reach the browser
//   /tx        → the terminology server (ICD-10 search); HL7's public test server unless
//                TERMINOLOGY_URL says otherwise
// Settings are resolved like `podman compose` does: shell environment, then .env, then defaults.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const dotenv = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const setting = (name, fallback) => process.env[name] || dotenv[name] || fallback;

const terminology = new URL(setting('TERMINOLOGY_URL', 'https://tx.fhir.org/r4'));
// Where the compose stack publishes its ports: localhost unless bound to one specific address.
const bind = setting('BIND_ADDRESS', '127.0.0.1');
const stackHost = ['127.0.0.1', '0.0.0.0', '::', ''].includes(bind) ? 'localhost' : bind;

// Orthanc requires a login; without a password the requests go through unauthenticated and get 401.
const orthancPassword = setting('ORTHANC_PASSWORD', '');
const orthancLogin = Buffer.from(`${setting('ORTHANC_USER', 'orthanc')}:${orthancPassword}`);

export default {
  '/fhir': {
    target: `http://${stackHost}:${setting('FHIR_HTTP_PORT', '8080')}`,
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
  '/dicom-web': {
    target: `http://${stackHost}:${setting('ORTHANC_HTTP_PORT', '8042')}`,
    secure: false,
    changeOrigin: true,
    headers: orthancPassword ? { Authorization: `Basic ${orthancLogin.toString('base64')}` } : {},
  },
  '/tx': {
    target: terminology.origin,
    secure: true,
    changeOrigin: true,
    pathRewrite: { '^/tx': terminology.pathname.replace(/\/$/, '') },
  },
};
