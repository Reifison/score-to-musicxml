/** Verify that the original corpus is byte-identical to its initial inventory. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const catalogPath = process.argv[2] ?? 'docs/validation/corpus-partituras-2026-10-07/catalog/inventory.json';
const target = process.argv[3] ?? 'docs/validation/corpus-partituras-2026-10-07/source-integrity.json';
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const sourceRoot = await fs.realpath(catalog.summary.source_root);
const files = [];
for (const item of catalog.files) {
  try {
    const file = await fs.realpath(path.join(sourceRoot, item.path));
    if (!file.startsWith(sourceRoot + path.sep)) throw new Error('Path escaped corpus root');
    const h = createHash('sha256');
    for await (const chunk of createReadStream(file)) h.update(chunk);
    const actual = h.digest('hex');
    files.push({ source: item.path, expectedSHA256: item.sha256, actualSHA256: actual, unchanged: actual === item.sha256 });
  } catch (error) {
    files.push({ source: item.path, expectedSHA256: item.sha256, unchanged: false, error: error.message });
  }
}
const result = { checkedAt: new Date().toISOString(), sourceRoot, filesChecked: files.length,
  unchanged: files.filter(f => f.unchanged).length, changedOrUnavailable: files.filter(f => !f.unchanged).length, files };
await fs.writeFile(target, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, files: undefined }));
if (result.changedOrUnavailable) process.exitCode = 1;
