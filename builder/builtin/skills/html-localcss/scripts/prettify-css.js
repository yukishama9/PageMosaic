/**
 * prettify-css.js
 *
 * 将压缩的单行 CSS 文件格式化为人类可读的多行格式。
 * 适用于 Tailwind CLI 使用 --minify 编译后的输出文件。
 *
 * 用法：将此脚本放在目标 HTML 项目目录中，然后运行：
 *   node prettify-css.js [可选：CSS文件路径，默认 assets/css/tailwind.css]
 *
 * 效果：
 *   - 每条 CSS 规则独立成行
 *   - 每个属性声明单独一行并缩进
 *   - 原地覆盖文件（不改变 CSS 语义）
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// 默认输入文件路径（相对于脚本所在目录）
const DEFAULT_CSS_PATH = path.join('assets', 'css', 'tailwind.css');
// ───────────────────────────────────────────────────────────────────────────

const dir = __dirname;
const relPath = process.argv[2] || DEFAULT_CSS_PATH;
const filePath = path.isAbsolute(relPath) ? relPath : path.join(dir, relPath);

if (!fs.existsSync(filePath)) {
  console.error('ERROR: CSS file not found:', filePath);
  console.error('Usage: node prettify-css.js [path/to/styles.css]');
  process.exit(1);
}

const originalSize = fs.statSync(filePath).size;
let css = fs.readFileSync(filePath, 'utf8');

css = css
  // Expand opening brace: selector{ → selector {\n  
  .replace(/\{/g, ' {\n  ')
  // Expand closing brace: } → \n}\n
  .replace(/\}/g, '\n}\n')
  // Expand semicolons inside rules: prop:val; → prop:val;\n  
  .replace(/;(?!\s*\n)/g, ';\n  ')
  // Clean up extra whitespace before closing brace
  .replace(/  \n\}/g, '\n}')
  // Collapse 3+ consecutive blank lines to 1
  .replace(/\n{3,}/g, '\n\n')
  // Remove lines that contain only whitespace
  .replace(/^  $/gm, '')
  .trim();

fs.writeFileSync(filePath, css, 'utf8');

const newSize = fs.statSync(filePath).size;
const lines = css.split('\n').length;

console.log('SUCCESS: CSS formatted.');
console.log(`  File  : ${filePath}`);
console.log(`  Before: ${Math.round(originalSize / 1024)} KB (minified)`);
console.log(`  After : ${Math.round(newSize / 1024)} KB (${lines} lines)`);