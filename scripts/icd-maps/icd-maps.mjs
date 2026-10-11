// Converts WHO's official ICD-10 ↔ ICD-11 mapping tables into the JSON lookups the app loads
// (public/terminology/), one best-matching code per code in each direction.
//
// 1. Download mapping.zip of an ICD-11 release from WHO and unzip it, e.g.
//      curl -O https://icdcdn.who.int/static/releasefiles/2026-01/mapping.zip && unzip mapping.zip
// 2. Run: npm run icd:maps -- <folder with 10To11MapToOneCategory.txt and 11To10MapToOneCategory.txt>
//
// Writes { "source": "...", "map": { "<code>": ["<mapped code>", "<its title>"], ... } } to
//   public/terminology/icd10-to-icd11.json and public/terminology/icd11-to-icd10.json.
// The tables are © WHO (https://icd.who.int), licensed CC BY-ND 3.0 IGO.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = process.argv[2];
if (!folder) {
  console.error('usage: npm run icd:maps -- <folder of the unzipped WHO mapping.zip>');
  process.exit(1);
}

/** ICD-10 category codes (A00, C50.9); chapters (I, II…) and blocks (A00-A09) are groupings. */
const ICD10_CATEGORY = /^[A-Z]\d{2}(\.\d{1,2})?$/;
/**
 * ICD-11 MMS codes (1A00, CA40.Z), possibly combined with extension codes, which have five
 * characters (1A00&XN8P1); not chapters (01).
 */
const ICD11_CODE = /^[0-9A-Z]{4}(\.[0-9A-Z]{1,4})?([&/][0-9A-Z]{4,5}(\.[0-9A-Z]{1,4})?)*$/;

/**
 * The ICD-10 category an 11→10 target stands for. Some targets are ranges: a one-category range
 * ("C50-C50") is that category; a wider one ("J09-J18") has no single code, so it maps to none.
 */
const icd10Category = (target) => {
  const single = /^([A-Z]\d{2})-\1$/.exec(target);
  return single ? single[1] : ICD10_CATEGORY.test(target) ? target : undefined;
};

function table(file) {
  const [header, ...rows] = readFileSync(join(folder, file), 'utf8').split(/\r?\n/).filter(Boolean);
  const cols = header.split('\t');
  const col = (name) => {
    const i = cols.indexOf(name);
    if (i < 0) throw new Error(`column "${name}" not found in ${file}`);
    return i;
  };
  // The last header cell is the release date, e.g. "2026-Jan-17".
  return { rows: rows.map((r) => r.split('\t')), col, release: cols.at(-1) };
}

function write(name, title, release, map) {
  const out = `public/terminology/${name}.json`;
  mkdirSync('public/terminology', { recursive: true });
  const source = `WHO ${title} mapping table, release ${release}, © WHO, CC BY-ND 3.0 IGO`;
  writeFileSync(out, JSON.stringify({ source, map }));
  console.log(`${Object.keys(map).length} codes → ${out}`);
}

{
  const { rows, col, release } = table('10To11MapToOneCategory.txt');
  const [from, to, title] = [col('icd10Code'), col('icd11Code'), col('icd11Title')];
  const map = {};
  for (const r of rows) {
    if (ICD10_CATEGORY.test(r[from]) && ICD11_CODE.test(r[to])) {
      map[r[from]] = [r[to], r[title].trim()];
    }
  }
  write('icd10-to-icd11', 'ICD-10 to ICD-11 (10To11MapToOneCategory)', release, map);
}

{
  const { rows, col, release } = table('11To10MapToOneCategory.txt');
  const [from, to, title] = [col('icd11Code'), col('icd10Code'), col('icd10Title')];
  const map = {};
  for (const r of rows) {
    const category = icd10Category(r[to].trim());
    if (ICD11_CODE.test(r[from]) && category) map[r[from]] = [category, r[title].trim()];
  }
  write('icd11-to-icd10', 'ICD-11 to ICD-10 (11To10MapToOneCategory)', release, map);
}
