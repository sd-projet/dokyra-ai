// Écrit src/config.js au build (Vercel) :
//   API_URL défini  -> le site appelle ce backend ;
//   sinon           -> mode démo (API simulée dans le navigateur), sauf DEMO=false.
import { writeFileSync } from 'node:fs';

const apiUrl = (process.env.API_URL || '').trim().replace(/\/+$/, '');
const demo = process.env.DEMO ? process.env.DEMO === 'true' : !apiUrl;
writeFileSync('src/config.js',
  `window.__API_URL__ = ${JSON.stringify(apiUrl || '/api')};\nwindow.__DEMO__ = ${demo};\n`);
console.log(`config.js : API=${apiUrl || '/api'} DEMO=${demo}`);