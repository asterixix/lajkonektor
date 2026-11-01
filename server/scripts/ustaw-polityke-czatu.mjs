// Wpisuje zatwierdzoną, niesekretną politykę do źródłowej konfiguracji wdrożenia.
// Klucz pozostaje sekretem Cloudflare i nie jest tu odczytywany.
import fs from 'node:fs';
const sciezka = new URL('../wrangler.jsonc', import.meta.url);
const polityka = JSON.parse(fs.readFileSync(new URL('../../docs/09-wdrozenie/polityka-czatu-2026-10-25.json', import.meta.url), 'utf8'));
let tekst = fs.readFileSync(sciezka, 'utf8');
if (tekst.includes('"CZAT_POLITYKA"')) throw Error('Polityka jest już w konfiguracji; sprawdź ją przed zmianą.');
const vars = { CZAT_MODEL: polityka.model, EDEN_AI_URL: polityka.endpoint, CZAT_LIMIT_USD: '9', CZAT_DEMO_BEZ_BUDZETU: '1', CZAT_POLITYKA: JSON.stringify(polityka) };
tekst = tekst.replace('  "triggers":', `  "vars": ${JSON.stringify(vars, null, 2).replaceAll('\n', '\n  ')},\n  "triggers":`);
fs.writeFileSync(sciezka, tekst);
