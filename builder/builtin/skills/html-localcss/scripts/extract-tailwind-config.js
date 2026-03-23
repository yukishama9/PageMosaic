/**
 * extract-tailwind-config.js
 * 
 * 从 HTML 文件中提取内联的 tailwind.config，生成 tailwind.config.js。
 * 
 * 用法：将此脚本放在目标 HTML 项目目录中，然后运行：
 *   node extract-tailwind-config.js [可选：指定HTML文件名，默认 index.html]
 * 
 * 输出：在同目录生成 tailwind.config.js
 */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const sourceFile = process.argv[2] || 'index.html';
const sourcePath = path.join(dir, sourceFile);

if (!fs.existsSync(sourcePath)) {
  console.error('ERROR: File not found:', sourcePath);
  console.error('Usage: node extract-tailwind-config.js [filename.html]');
  process.exit(1);
}

const html = fs.readFileSync(sourcePath, 'utf8');

// Match <script id="tailwind-config"> or <script>tailwind.config = {...}</script>
const patterns = [
  // <script id="tailwind-config">tailwind.config = {...}</script>
  /<script[^>]*id=["']tailwind-config["'][^>]*>([\s\S]*?)<\/script>/i,
  // <script>tailwind.config = {...</script>
  /<script[^>]*>\s*(tailwind\.config\s*=[\s\S]*?)\s*<\/script>/i,
];

let configContent = null;

for (const pattern of patterns) {
  const match = html.match(pattern);
  if (match) {
    configContent = match[1].trim();
    break;
  }
}

if (!configContent) {
  console.log('WARNING: No inline tailwind.config found in', sourceFile);
  console.log('Generating default tailwind.config.js...');

  const defaultConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.html"],
  theme: {
    extend: {},
  },
  plugins: [],
}
`;
  fs.writeFileSync(path.join(dir, 'tailwind.config.js'), defaultConfig, 'utf8');
  console.log('Created: tailwind.config.js (default config)');
  process.exit(0);
}

// Extract the object literal from "tailwind.config = { ... }"
// or from just "{ ... }" if script only has the object
let configObj = configContent;

// Remove "tailwind.config = " prefix if present
configObj = configObj.replace(/^tailwind\.config\s*=\s*/, '').trim();
// Remove trailing semicolon if present
configObj = configObj.replace(/;$/, '').trim();

// Build the module.exports file
const outputContent = `/** @type {import('tailwindcss').Config} */
/** Extracted from ${sourceFile} inline tailwind.config */
module.exports = ${configObj}
`;

const outputPath = path.join(dir, 'tailwind.config.js');
fs.writeFileSync(outputPath, outputContent, 'utf8');

console.log('SUCCESS: tailwind.config.js created from', sourceFile);
console.log('Output:', outputPath);

// Show a preview of what was extracted
const preview = configObj.substring(0, 200);
console.log('\nConfig preview:');
console.log(preview + (configObj.length > 200 ? '...' : ''));