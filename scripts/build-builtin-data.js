#!/usr/bin/env node
/**
 * scripts/build-builtin-data.js
 *
 * Reads all built-in skill folders (SKILL.md + references/ + templates/)
 * and agent files (.agent.md) from builder/builtin/, then emits
 * builder/builtin/builtin-data.js as a self-contained JS bundle so that
 * the app works under file:// protocol without any fetch() calls.
 *
 * Usage:  node scripts/build-builtin-data.js
 */

const fs   = require('fs');
const path = require('path');

const BUILTIN_DIR = path.join(__dirname, '..', 'builder', 'builtin');
const OUT_FILE    = path.join(BUILTIN_DIR, 'builtin-data.js');

// ── YAML front-matter parser (mirrors wb-ai-chat.js implementation) ──────────
function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const m = line.match(/^([\w-]+)\s*:\s*([\s\S]+)$/);
    if (m) meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
  return { meta, body: match[2] };
}

// ── Skill loader ──────────────────────────────────────────────────────────────
function loadSkillFolder(folderPath, folderName) {
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  const text = fs.readFileSync(skillMdPath, 'utf8');
  const { meta, body } = parseFrontMatter(text);

  const skill = {
    id:          meta.name || folderName,
    name:        meta.name || folderName,
    description: meta.description || '',
    prompt:      body,
    _refs:       [],
    _templates:  [],
  };

  // references/*.md
  const refsDir = path.join(folderPath, 'references');
  if (fs.existsSync(refsDir)) {
    fs.readdirSync(refsDir).forEach(f => {
      if (f.endsWith('.md')) {
        const content = fs.readFileSync(path.join(refsDir, f), 'utf8');
        skill._refs.push({ name: f, content });
      }
    });
  }

  // templates/*.html and *.md
  const tmplDir = path.join(folderPath, 'templates');
  if (fs.existsSync(tmplDir)) {
    fs.readdirSync(tmplDir).forEach(f => {
      if (f.endsWith('.html') || f.endsWith('.md')) {
        const content = fs.readFileSync(path.join(tmplDir, f), 'utf8');
        skill._templates.push({ name: f, content });
      }
    });
  }

  return skill;
}

// ── Agent loader ──────────────────────────────────────────────────────────────
function loadAgentFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  if (fileName.endsWith('.agent.md')) {
    const { meta, body } = parseFrontMatter(text);
    const id = fileName.replace(/\.agent\.md$/, '');
    return {
      id:          meta.name || id,
      name:        meta.name || id,
      description: meta.description || '',
      prompt:      body,
    };
  }

  if (fileName.endsWith('.agent.json')) {
    try {
      const obj = JSON.parse(text);
      if (obj && obj.id && obj.name && obj.prompt) return obj;
    } catch { /* skip malformed */ }
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const skills = [];
const agents = [];

const skillsDir = path.join(BUILTIN_DIR, 'skills');
if (fs.existsSync(skillsDir)) {
  fs.readdirSync(skillsDir, { withFileTypes: true }).forEach(entry => {
    if (entry.isDirectory()) {
      const skill = loadSkillFolder(path.join(skillsDir, entry.name), entry.name);
      if (skill) {
        skills.push(skill);
        console.log(`  ✓ skill  ${skill.id}  (refs: ${skill._refs.length}, templates: ${skill._templates.length})`);
      }
    } else if (entry.isFile() && entry.name.endsWith('.skill.json')) {
      try {
        const obj = JSON.parse(fs.readFileSync(path.join(skillsDir, entry.name), 'utf8'));
        if (obj && obj.id && obj.name && obj.prompt) {
          skills.push(obj);
          console.log(`  ✓ skill  ${obj.id}  (legacy JSON)`);
        }
      } catch { /* skip */ }
    }
  });
}

const agentsDir = path.join(BUILTIN_DIR, 'agents');
if (fs.existsSync(agentsDir)) {
  fs.readdirSync(agentsDir, { withFileTypes: true }).forEach(entry => {
    if (entry.isFile()) {
      const agent = loadAgentFile(path.join(agentsDir, entry.name));
      if (agent) {
        agents.push(agent);
        console.log(`  ✓ agent  ${agent.id}`);
      }
    }
  });
}

// ── Emit output ───────────────────────────────────────────────────────────────
const payload = { skills, agents };
const json    = JSON.stringify(payload, null, 2);

const banner = `/**
 * builder/builtin/builtin-data.js
 * AUTO-GENERATED — do not edit manually.
 * Regenerate with:  node scripts/build-builtin-data.js
 *
 * Contains all built-in skill and agent definitions inlined as a JS object
 * so the app works under file:// protocol without fetch() restrictions.
 *
 * Generated: ${new Date().toISOString()}
 * Skills: ${skills.length}  |  Agents: ${agents.length}
 */
`;

fs.writeFileSync(OUT_FILE, banner + 'window.__BUILTIN_DATA__ = ' + json + ';\n', 'utf8');

console.log(`\nBuilt ${skills.length} skill(s) + ${agents.length} agent(s) → ${path.relative(process.cwd(), OUT_FILE)}`);