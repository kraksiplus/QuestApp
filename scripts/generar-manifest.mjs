#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preguntasDir = join(repoRoot, 'preguntas');
const manifestPath = join(preguntasDir, 'manifest.json');

await mkdir(preguntasDir, { recursive: true });

const entries = await readdir(preguntasDir, { withFileTypes: true });
const quizzes = [];

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!entry.name.toLowerCase().endsWith('.json')) continue;
  if (entry.name === 'manifest.json') continue;

  let data;
  try {
    data = JSON.parse(await readFile(join(preguntasDir, entry.name), 'utf8'));
  } catch (err) {
    console.warn(`⚠ ${entry.name}: JSON inválido, se omite (${err.message})`);
    continue;
  }

  const total = data && Array.isArray(data.preguntas) ? data.preguntas.length : 0;
  if (total === 0) {
    console.warn(`⚠ ${entry.name}: no tiene un arreglo "preguntas" con contenido, se omite`);
    continue;
  }

  const titulo =
    typeof data.titulo === 'string' && data.titulo.trim()
      ? data.titulo.trim()
      : entry.name.replace(/\.json$/i, '');

  quizzes.push({ archivo: entry.name, titulo, total });
}

quizzes.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));

const content = JSON.stringify({ quizzes }, null, 2) + '\n';

let previous = null;
try {
  previous = await readFile(manifestPath, 'utf8');
} catch {
  previous = null;
}

if (previous === content) {
  console.log(`Sin cambios: ${quizzes.length} cuestionario(s) en preguntas/manifest.json`);
} else {
  await writeFile(manifestPath, content, 'utf8');
  console.log(`preguntas/manifest.json actualizado: ${quizzes.length} cuestionario(s)`);
  for (const q of quizzes) {
    console.log(`  · ${q.titulo} — ${q.archivo} (${q.total} preguntas)`);
  }
}
