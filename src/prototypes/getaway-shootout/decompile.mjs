// Unpack the shipped Getaway Shootout Unity build into editable source.
//
// The game in src/games/content/getaway-shootout.html is an IL2CPP AOT export: the
// C# was compiled to C++, then to asm.js. There is no IL left to decompile, so the
// only faithful source of the game's logic is the asm.js program itself. This script
// takes that program out of the payload and re-emits it as indented, navigable
// source, can repack it into a runnable game file, and proves the two are the same
// program by comparing the complete token stream.
//
// Usage (from the repository root):
//   node src/prototypes/getaway-shootout/decompile.mjs            # rewrite this folder's source
//   node src/prototypes/getaway-shootout/decompile.mjs --check    # verify it still is the payload
//   node src/prototypes/getaway-shootout/decompile.mjs --rebuild <out.html>   # repack the source
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const GAME = resolve(root, 'src/games/content/getaway-shootout/unity/GetawayShootout.asm.code.unityweb');
const OUT = fileURLToPath(new URL('.', import.meta.url));
const CODE_KEY = 'GetawayShootout.asm.code.unityweb';
const DATA_KEY = 'GetawayShootout.data.unityweb';
const UNITY_COMMENT = 'UnityWeb Compressed Content (gzip)\0';
const SOURCE = resolve(OUT, 'source/getaway-shootout.code.js');
const DATA = resolve(root, 'src/games/content/getaway-shootout/unity/', DATA_KEY);
const SOURCE_MARKER = '// ========== EDITABLE UNITY ASM.JS PROGRAM ==========' + '\n';

// ---------------------------------------------------------------- payload access

function readBuild() {
  // The original Unity WebGL export is vendored as files, not embedded in HTML.
  return { build: {}, html: null, start: 0, end: 0 };
}

function unityGunzip(buf) {
  try {
    return gunzipSync(buf);
  } catch {
    // Some exporters leave the comment where zlib will not skip it.
    const at = buf.indexOf(UNITY_COMMENT);
    if (at < 0) throw new Error('not a Unity gzip payload');
    const header = Buffer.from(buf.subarray(0, 10));
    header[3] = 0;
    return gunzipSync(Buffer.concat([header, buf.subarray(at + UNITY_COMMENT.length)]));
  }
}

function unityGzip(text) {
  const raw = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  raw[3] = 0x10; // FCOMMENT: the loader looks for Unity's comment, not the magic alone
  return Buffer.concat([raw.subarray(0, 10), Buffer.from(UNITY_COMMENT, 'latin1'), raw.subarray(10)]);
}

// UnityWebData1.0: magic, int32 headerEnd, then (offset, size, pathLength, path).
function unityWebFiles(buf) {
  const magic = 'UnityWebData1.0\0';
  if (!buf.subarray(0, magic.length).equals(Buffer.from(magic, 'latin1'))) throw new Error('not a UnityWebData container');
  const headerEnd = buf.readInt32LE(magic.length);
  const files = new Map();
  for (let at = magic.length + 4; at < headerEnd;) {
    const offset = buf.readInt32LE(at);
    const size = buf.readInt32LE(at + 4);
    const nameLength = buf.readInt32LE(at + 8);
    const name = buf.subarray(at + 12, at + 12 + nameLength).toString('utf8');
    files.set(name, buf.subarray(offset, offset + size));
    at += 12 + nameLength;
  }
  return files;
}

function metadataBuffer() {
  const files = unityWebFiles(unityGunzip(readFileSync(DATA)));
  const found = files.get('Il2CppData/Metadata/global-metadata.dat') ||
    [...files].find(([name]) => /global-metadata\\.dat$/.test(name))?.[1];
  if (!found) throw new Error('No IL2CPP global-metadata.dat in Unity data archive');
  return found;
}

function codeText() {
  return unityGunzip(readFileSync(GAME)).toString('utf8');
}

// ---------------------------------------------------------------- scanner
// Char-code driven so a 22 MB program scans in a couple of seconds.

const CLASS = new Uint8Array(128);
for (let c = 48; c <= 57; c++) CLASS[c] = 2; // digit
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$') CLASS[c.charCodeAt(0)] = 1;
for (const c of ' \t\n\r\v\f') CLASS[c.charCodeAt(0)] = 3;
CLASS[0x22] = 4; // "
CLASS[0x27] = 4; // '
CLASS[0x60] = 5; // `
CLASS[0x2f] = 6; // /
CLASS[0x2e] = 7; // .

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '++', '--', '+=', '-=', '*=',
  '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**', '?.',
];
const PUNCT_BY_FIRST = new Map();
for (const p of PUNCT) {
  if (!PUNCT_BY_FIRST.has(p[0])) PUNCT_BY_FIRST.set(p[0], []);
  PUNCT_BY_FIRST.get(p[0]).push(p);
}
for (const list of PUNCT_BY_FIRST.values()) list.sort((a, b) => b.length - a.length);
const SINGLE = new Set('{}()[];,<>+-*/%&|^!~?:=.'.split(''));
const EXPR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw']);
const isIdStart = (c) => (c < 128 ? CLASS[c] === 1 : true);
const isIdPart = (c) => (c < 128 ? CLASS[c] === 1 || CLASS[c] === 2 : true);
const isSpace = (c) => c < 128 ? CLASS[c] === 3 : c === 0xa0 || c === 0x2028 || c === 0x2029 || c === 0xfeff;

// Streams tokens. `onToken(type, text)` is called for every token in program order.
function scan(src, onToken) {
  const n = src.length;
  let i = 0;
  let prev = null;
  const emitToken = (type, start, end) => {
    const text = src.slice(start, end);
    onToken(type, text);
    prev = text;
  };
  const regexAllowed = () => {
    if (prev === null) return true;
    if (isIdStart(prev.charCodeAt(0)) && !EXPR_KEYWORDS.has(prev)) return false;
    if ((prev.charCodeAt(0) >= 48 && prev.charCodeAt(0) <= 57) || prev[0] === '.') return false;
    return prev !== ')' && prev !== ']';
  };

  while (i < n) {
    const code = src.charCodeAt(i);
    const kind = code < 128 ? CLASS[code] : 9;
    if (kind === 3 || (kind === 9 && isSpace(code))) { i++; continue; }
    if (kind === 4 || kind === 5) {
      const quote = code;
      const start = i++;
      if (kind === 5) {
        let depth = 0;
        while (i < n) {
          const c = src.charCodeAt(i);
          if (c === 92) { i += 2; continue; }
          if (depth === 0 && c === 96) { i++; break; }
          if (c === 36 && src.charCodeAt(i + 1) === 123) { depth++; i += 2; continue; }
          if (depth > 0 && c === 125) { depth--; i++; continue; }
          i++;
        }
      } else {
        while (i < n && src.charCodeAt(i) !== quote) i += src.charCodeAt(i) === 92 ? 2 : 1;
        i++;
      }
      emitToken('string', start, i);
      continue;
    }
    if (kind === 1 || (kind === 9 && isIdStart(code))) {
      const start = i++;
      while (i < n && isIdPart(src.charCodeAt(i))) i++;
      emitToken('ident', start, i);
      continue;
    }
    if (kind === 2 || (kind === 7 && CLASS[src.charCodeAt(i + 1)] === 2)) {
      const start = i;
      if (src.charCodeAt(i) === 48 && /[xXoObB]/.test(src[i + 1] || '')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else {
        while (i < n && CLASS[src.charCodeAt(i)] === 2) i++;
        if (src.charCodeAt(i) === 46) { i++; while (i < n && CLASS[src.charCodeAt(i)] === 2) i++; }
        if ((src[i] === 'e' || src[i] === 'E') && /[0-9+-]/.test(src[i + 1] || '')) {
          i += 2;
          while (i < n && CLASS[src.charCodeAt(i)] === 2) i++;
        }
      }
      if (src[i] === 'n') i++;
      emitToken('number', start, i);
      continue;
    }
    if (kind === 6) {
      if (src.charCodeAt(i + 1) === 47) { // //
        while (i < n && src[i] !== '\n' && src[i] !== '\u2028' && src[i] !== '\u2029') i++;
        continue;
      }
      if (src.charCodeAt(i + 1) === 42) { // /*
        const close = src.indexOf('*/', i + 2);
        i = close < 0 ? n : close + 2;
        continue;
      }
      if (regexAllowed()) {
        const start = i++;
        let inClass = false;
        while (i < n) {
          const c = src.charCodeAt(i);
          if (c === 92) { i += 2; continue; }
          if (c === 91) inClass = true;
          else if (c === 93) inClass = false;
          else if (c === 47 && !inClass) { i++; break; }
          else if (c === 10) break;
          i++;
        }
        while (i < n && isIdPart(src.charCodeAt(i))) i++;
        emitToken('regex', start, i);
        continue;
      }
    }
    const candidates = PUNCT_BY_FIRST.get(src[i]);
    let matched = null;
    if (candidates) for (const p of candidates) {
      // '?.' cannot start optional chaining when followed by a decimal digit:
      // Unity's minified `a?.1:b` means `a ? .1 : b`, not `a?. 1`.
      if (p === '?.' && /[0-9]/.test(src[i + 2] || '')) continue;
      if (src.startsWith(p, i)) { matched = p; break; }
    }
    if (matched) { const start = i; i += matched.length; emitToken('punct', start, i); continue; }
    if (SINGLE.has(src[i])) { const start = i; i++; emitToken('punct', start, i); continue; }
    throw new Error(`unexpected character ${JSON.stringify(src[i])} at ${i}`);
  }
}

// ---------------------------------------------------------------- emitter

const NO_SPACE_BEFORE = new Set([',', ';', ')', ']', '.', '(']);
const NO_SPACE_AFTER = new Set(['(', '[', '.', '!', '~']);
const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const CONTINUE_AFTER_BRACE = new Set([')', ',', ';', '.', '(', '[', 'else', 'while', 'catch', 'finally']);

function format(src) {
  const lines = [];
  const functions = [];
  const indents = [''];
  const indent = (d) => indents[d] || (indents[d] = '  '.repeat(d));
  let line = '';
  let lineIndent = 0;
  let depth = 0;
  let parens = 0;
  let prev = null;

  // Function-signature tracking, streamed over the same tokens.
  let sigName = null;
  let sigLine = 0;
  let sigDepth = -1;
  let sigParams = [];
  let lastWasFunction = false;

  const flush = () => {
    if (line !== '') lines.push(indent(lineIndent) + line);
    line = '';
    lineIndent = depth;
  };
  const append = (text) => {
    if (line === '') lineIndent = depth;
    line += text;
  };
  const atLineStart = () => line === '';

  const step = (cur, next) => {
    const { type, text } = cur;

    if (lastWasFunction && type === 'ident' && sigName === null) {
      sigName = text;
      sigLine = lines.length + 1;
    } else if (sigName !== null && sigDepth === -1 && text === '(') {
      sigDepth = 1;
      sigParams = [];
    } else if (sigDepth > 0) {
      if (text === '(') sigDepth++;
      else if (text === ')') {
        sigDepth--;
        if (sigDepth === 0) {
          functions.push({ name: sigName, line: sigLine, params: sigParams, depth });
          sigDepth = -1;
          sigName = null;
          sigParams = [];
        }
      } else if (sigDepth === 1 && type === 'ident') sigParams.push(text);
    }

    if (text === ';' && line === '' && lines.length) {
      lines[lines.length - 1] += ';';
    } else if (text === '{') {
      if (prev !== null && !NO_SPACE_AFTER.has(prev)) append(' ');
      append('{');
      flush();
      depth++;
    } else if (text === '}') {
      if (line !== '') flush();
      depth = Math.max(0, depth - 1);
      const stays = next !== null && CONTINUE_AFTER_BRACE.has(next);
      append('}');
      if (stays) line += ' ';
      else flush();
    } else if (text === ';') {
      append(';');
      if (parens === 0) flush();
    } else {
      if (text === '(') parens++;
      if (text === ')') parens = Math.max(0, parens - 1);
      const memberIndex = text === '[' && (type === 'ident' || prev === ')' || prev === ']');
      const spaced = atLineStart() || prev === null ? false
        : CONTROL.has(prev) && text === '(' ? true
          : memberIndex || NO_SPACE_BEFORE.has(text) || NO_SPACE_AFTER.has(prev) ? false
            : true;
      append((spaced ? ' ' : '') + text);
    }
    prev = text;
    lastWasFunction = text === 'function';
  };

  // One token of lookahead so `}` knows whether the statement continues.
  let held = null;
  scan(src, (type, text) => {
    if (held !== null) {
      const cur = held;
      held = { type, text };
      step(cur, text);
    } else {
      held = { type, text };
    }
  });
  if (held !== null) step(held, null);
  if (line !== '') flush();
  return { text: lines.join('\n') + '\n', lines: lines.length, functions };
}

// ---------------------------------------------------------------- IL2CPP metadata

const REGIONS = ['stringLiteral', 'stringLiteralData', 'string', 'events', 'properties', 'methods',
  'parameterDefaultValues', 'fieldDefaultValues', 'fieldAndParameterDefaultValueData',
  'fieldMarshaledSizes', 'parameters', 'fields', 'genericParameters',
  'genericParameterConstraints', 'genericContainers', 'nestedTypes', 'interfaces',
  'vtableMethods', 'interfaceOffsets', 'typeDefinitions', 'images', 'assemblies',
  'fieldRefs', 'referencedAssemblies', 'attributeData', 'attributeDataRange',
  'unresolvedVirtualCall', 'unresolvedVirtualCallParameterTypes',
  'unresolvedVirtualCallParameterRanges', 'windowsRuntimeTypeNames',
  'windowsRuntimeStrings', 'exportedTypeDefinitions'];

function readMetadata(buf) {
  if (buf.readUInt32LE(0) !== 0xfab11baf) throw new Error('bad metadata sanity word');
  const version = buf.readInt32LE(4);
  const regions = {};
  for (let r = 0; r < REGIONS.length; r++) {
    regions[REGIONS[r]] = { offset: buf.readInt32LE(8 + r * 8), count: buf.readInt32LE(12 + r * 8) };
  }
  const stringRegion = regions.string;
  const cstr = (index) => {
    if (index < 0 || index >= stringRegion.count) return null;
    const start = stringRegion.offset + index;
    return buf.subarray(start, buf.indexOf(0, start)).toString('utf8');
  };

  const TYPE_SIZE = 104;
  const FIELD_SIZE = 16;
  const METHOD_SIZE = 56;
  const types = [];
  for (let n = 0; n < regions.typeDefinitions.count / TYPE_SIZE; n++) {
    const o = regions.typeDefinitions.offset + n * TYPE_SIZE;
    types.push({
      name: cstr(buf.readInt32LE(o)),
      namespace: cstr(buf.readInt32LE(o + 4)) || '',
      fieldStart: buf.readInt32LE(o + 48),
      methodStart: buf.readInt32LE(o + 52),
      fieldCount: buf.readUInt16LE(o + 84),
      methodCount: buf.readUInt16LE(o + 80),
      token: buf.readUInt32LE(o + 100),
    });
  }
  const fields = [];
  for (let n = 0; n < regions.fields.count / FIELD_SIZE; n++) {
    fields.push(cstr(buf.readInt32LE(regions.fields.offset + n * FIELD_SIZE)));
  }
  const methods = [];
  for (let n = 0; n < regions.methods.count / METHOD_SIZE; n++) {
    const o = regions.methods.offset + n * METHOD_SIZE;
    methods.push({
      name: cstr(buf.readInt32LE(o)),
      paramCount: buf.readUInt16LE(o + 54),
      token: buf.readUInt32LE(o + 44),
    });
  }
  const literals = [];
  for (let n = 0; n < regions.stringLiteral.count / 8; n++) {
    const length = buf.readInt32LE(regions.stringLiteral.offset + n * 8);
    const at = buf.readInt32LE(regions.stringLiteral.offset + n * 8 + 4);
    literals.push(buf.subarray(regions.stringLiteralData.offset + at, regions.stringLiteralData.offset + at + length).toString('utf8'));
  }
  return { version, types, fields, methods, literals };
}

// Unity user scripts compile with no namespace; mscorlib/UnityEngine types all carry one.
function scriptClasses(meta) {
  const own = meta.types.filter((t) => t.namespace === '' && !t.name.startsWith('<'));
  const rows = own.map((t) => ({
    name: t.name,
    token: t.token,
    fields: meta.fields.slice(t.fieldStart, t.fieldStart + t.fieldCount),
    methods: meta.methods.slice(t.methodStart, t.methodStart + t.methodCount)
      .map((m) => ({ name: m.name, params: m.paramCount })),
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function classDoc(rows) {
  const out = [
    '# Recovered class model (no-namespace / Assembly-CSharp scripts)',
    '',
    'IL2CPP keeps compiled type and method names, so the shape of the original C# survives',
    'even though every body became C++ and then asm.js. What is exact here: class names,',
    'field names, method names, parameter counts, metadata tokens. What is not: field types',
    'and method signatures (that needs the runtime Il2CppType table, which this export does',
    'not expose) and bodies (the executable form is in `source/getaway-shootout.code.js`).',
    '',
    `${rows.length} types.`,
    '',
  ];
  for (const row of rows) {
    out.push(`## ${row.name}  (token 0x${row.token.toString(16).padStart(8, '0')})`, '');
    out.push('```csharp');
    out.push(`class ${row.name}`);
    out.push('{');
    for (const f of row.fields) out.push(`    /* field */ ${f};`);
    for (const m of row.methods) {
      const args = Array.from({ length: m.params }, (_, i) => `p${i + 1}`).join(', ');
      out.push(`    /* method */ ${m.name}(${args});`);
    }
    out.push('}');
    out.push('```', '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- build / check

function decompile() {
  const frame = readBuild();
  const original = codeText();
  const formatted = format(original);
  let meta;
  try { meta = readMetadata(metadataBuffer()); }
  catch (error) {
    console.warn('IL2CPP metadata unavailable:', error.message);
    meta = {types: [], fields: [], methods: [], literals: []};
  }
  return { original, formatted, meta, ...frame };
}

function hashTokens(src) {
  const hash = createHash('sha256');
  let count = 0;
  scan(src, (type, text) => {
    hash.update(type);
    hash.update(text);
    hash.update('\0');
    count++;
  });
  return { digest: hash.digest('hex'), count };
}

function writeTree() {
  const started = Date.now();
  const { original, formatted, meta } = decompile();
  mkdirSync(resolve(OUT, 'source'), { recursive: true });
  mkdirSync(resolve(OUT, 'il2cpp'), { recursive: true });

  const header = [
    '// Getaway Shootout — the shipped IL2CPP/asm.js program, as editable source.',
    '//',
    '// This file IS the game: the payload in src/games/content/getaway-shootout.html',
    '// is exactly this program, gzipped. Repack it with',
    '//   node src/prototypes/getaway-shootout/decompile.mjs --rebuild out.html',
    '// and whatever you change here is what runs once the rebuilt .unityweb is shipped.',
    '//',
    `// ${(original.length / 1048576).toFixed(2)} MB of asm.js, ${formatted.functions.length} functions,`,
    `// ${formatted.lines} lines. Functions keep their minified names (IL2CPP AOT dropped the`,
    '// C# names from the code); il2cpp/classes.md holds the recovered class model and',
    '// functions.tsv indexes every function in this file.',
    '//',
    '// Formatting is whitespace only — the token stream is identical to the shipped payload,',
    '// which is what --check verifies.',
    '//',
  ].join('\n') + '\n';

  writeFileSync(SOURCE, header + SOURCE_MARKER + formatted.text);
  const index = ['# name\tline\tparams\tparamCount\tdepth'];
  for (const f of formatted.functions) {
    index.push(`${f.name}\t${f.line}\t${f.params.join(',')}\t${f.params.length}\t${f.depth}`);
  }
  writeFileSync(resolve(OUT, 'functions.tsv'), index.join('\n') + '\n');

  const rows = scriptClasses(meta);
  writeFileSync(resolve(OUT, 'il2cpp/classes.md'), classDoc(rows));
  writeFileSync(resolve(OUT, 'il2cpp/string-literals.txt'), meta.literals.join('\n') + '\n');

  const stats = {
    sourceBytes: Buffer.byteLength(header + formatted.text),
    payloadBytes: Buffer.byteLength(original),
    sourceLines: formatted.lines,
    functions: formatted.functions.length,
    classes: rows.length,
    literals: meta.literals.length,
    methods: meta.methods.length,
    types: meta.types.length,
    sourceSha256: createHash('sha256').update(header + formatted.text).digest('hex'),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  };
  console.log(JSON.stringify(stats, null, 2));
  return stats;
}

function check() {
  if (!existsSync(SOURCE)) throw new Error('run without --check first');
  const { original } = decompile();
  const shipped = hashTokens(original);
  const written = readFileSync(SOURCE, 'utf8');
  const at = written.indexOf(SOURCE_MARKER);
  if (at < 0) throw new Error('source file does not contain the program');
  const rebuilt = hashTokens(written.slice(at + SOURCE_MARKER.length));
  if (shipped.count !== rebuilt.count) throw new Error(`token count changed: ${shipped.count} -> ${rebuilt.count}`);
  if (shipped.digest !== rebuilt.digest) throw new Error('token stream changed');
  console.log(JSON.stringify({
    ok: true,
    tokens: shipped.count,
    digest: shipped.digest,
    sourceBytes: Buffer.byteLength(written),
  }, null, 2));
}

function rebuild(outFile) {
  const editedSource = readFileSync(SOURCE, 'utf8');
  const programAt = editedSource.indexOf(SOURCE_MARKER);
  if (programAt < 0) throw new Error('editable asm.js source is missing its program marker');
  const editedProgram = editedSource.slice(programAt + SOURCE_MARKER.length);
  if (!editedProgram.trim()) throw new Error('empty edited Unity program');
  // Re-compress the executable code; the unchanged game data and runtime stay intact.
  const rebuilt = unityGzip(editedProgram);
  writeFileSync(resolve(outFile), rebuilt);
  console.log(JSON.stringify({
    written: resolve(outFile),
    bytes: rebuilt.length,
    gzipSha256: createHash('sha256').update(rebuilt).digest('hex'),
  }, null, 2));
}

const mode = process.argv[2] || '--build';
if (mode === '--check') check();
else if (mode === '--rebuild') rebuild(process.argv[3] || resolve(root, 'src/games/content/getaway-shootout/unity/GetawayShootout.asm.code.unityweb'));
else writeTree();
