import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const hash = text => createHash('sha256').update(text).digest('hex');
const script = path.resolve('scripts/corpus-salvage.mts');
async function fixture(wrongHash = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'corpus-salvage-test-'));
  const root = path.join(dir, 'output'), job = path.join(root, '1111111111111111'), attempt = path.join(job, 'attempts/attempt-0001');
  const catalog = path.join(dir, 'catalog.json');
  await fs.writeFile(catalog, JSON.stringify({ pages: [] }));
  await fs.mkdir(attempt, { recursive: true });
  const book = path.join(attempt, 'fixture.omr'), content = 'immutable generated parent';
  await fs.writeFile(book, content);
  await fs.writeFile(path.join(attempt, 'native-inspection.json'), JSON.stringify({ books: [{ file: book, sheets: [
    { page: 1, reachedPageStep: false, invalid: true }, { page: 2, reachedPageStep: true, invalid: false }, { page: 3, reachedPageStep: false, invalid: false }
  ] }] }));
  await fs.writeFile(path.join(job, 'result.json'), JSON.stringify({ finishedAt: '2026-10-07', source: 'fixture.pdf', sourceAbsolutePath: path.join(dir, 'fixture.pdf'),
    sourceSHA256: '1'.repeat(64), physicalPages: 3, exports: [], attemptDir: attempt, artifacts: [{ path: book, sha256: wrongHash ? '0'.repeat(64) : hash(content) }] }));
  const engine = path.join(dir, 'fake-engine.mjs');
  await fs.writeFile(engine, `#!${process.execPath}\nimport fs from 'node:fs';\nconst book=process.argv.at(-1);fs.writeFileSync(book,'copy rewritten');fs.writeFileSync(book.replace(/\\.omr$/,'.xml'),'<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note></measure></part></score-partwise>');\n`, { mode: 0o700 });
  return { dir, root, job, book, content, engine, catalog };
}

test('exports beside copied book, preserves parent, exposes missing physical pages and resumes by hash', async () => {
  const f = await fixture();
  try {
    const argv = ['--import', 'tsx', script, '--output', f.root, '--engine', f.engine, '--catalog', f.catalog];
    await exec(process.execPath, argv, { timeout: 15_000 });
    const result = JSON.parse(await fs.readFile(path.join(f.job, 'native-salvage-0001/result.json')));
    assert.equal(result.exports.length, 1);
    assert.equal(await fs.readFile(f.book, 'utf8'), f.content);
    assert.equal(await fs.readFile(path.join(f.job, 'native-salvage-0001/fixture.omr'), 'utf8'), 'copy rewritten');
    assert.deepEqual(result.reusedPhysicalPages, [2]);
    assert.deepEqual(result.omittedPagesNeedingReview, [1, 3]);
    assert.equal(result.accuracyVerified, false);
    assert.equal(result.finalExportApproved, false);
    await exec(process.execPath, argv, { timeout: 15_000 });
    assert.equal((await fs.readdir(f.job)).filter(name => name.startsWith('native-salvage-')).length, 1);
    await assert.rejects(fs.access(path.join(f.root, '.native-salvage.lock')));
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
});

test('refuses changed parent hash and preserves failed attempt unless retry explicitly requested', async () => {
  const f = await fixture(true);
  try {
    const argv = ['--import', 'tsx', script, '--output', f.root, '--engine', f.engine, '--catalog', f.catalog];
    await exec(process.execPath, argv, { timeout: 15_000 });
    const result = JSON.parse(await fs.readFile(path.join(f.job, 'native-salvage-0001/result.json')));
    assert.equal(result.exports.length, 0);
    assert.match(result.issues[0].message, /hash differs/);
    assert.equal(await fs.readFile(f.book, 'utf8'), f.content);
    await exec(process.execPath, argv, { timeout: 15_000 });
    assert.equal((await fs.readdir(f.job)).filter(name => name.startsWith('native-salvage-')).length, 1);
    await exec(process.execPath, [...argv, '--retry-failed'], { timeout: 15_000 });
    assert.equal((await fs.readdir(f.job)).filter(name => name.startsWith('native-salvage-')).length, 2);
  } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
});
