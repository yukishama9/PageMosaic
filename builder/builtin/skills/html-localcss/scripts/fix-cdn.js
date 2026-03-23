/**
 * fix-cdn.js
 *
 * 批量移除 HTML 文件中的 Tailwind CDN script 引用，插入本地编译的 CSS link。
 *
 * 用法：将此脚本放在目标 HTML 项目目录中，然后运行：
 *   node fix-cdn.js
 *
 * 效果：
 *   - 移除 <script src="https://cdn.tailwindcss.com..."></script>
 *   - 移除 <script id="tailwind-config">...</script> 内联配置块
 *   - 在 </head> 前插入 <link rel="stylesheet" href="assets/css/tailwind.css">
 *
 * 配置：修改下方 CONFIG 区域以适配不同项目
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// 本地 CSS link 的 href 路径（相对于 HTML 文件）
const LOCAL_CSS_HREF = 'assets/css/tailwind.css';

// 要处理的文件：留空 [] 则自动扫描当前目录所有 .html 文件
const TARGET_FILES = [];
// ───────────────────────────────────────────────────────────────────────────

const dir = __dirname;

// Auto-detect HTML files if TARGET_FILES is empty
let files = TARGET_FILES;
if (!files || files.length === 0) {
  files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  console.log('Auto-detected HTML files:', files);
}

const linkTag = `  <link rel="stylesheet" href="${LOCAL_CSS_HREF}">`;
let updatedCount = 0;

for (const fname of files) {
  const fpath = path.join(dir, fname);
  if (!fs.existsSync(fpath)) {
    console.log('SKIP (not found):', fname);
    continue;
  }

  let c = fs.readFileSync(fpath, 'utf8');
  const original = c;

  // Remove Tailwind CDN script tag (handles src with or without query params)
  c = c.replace(
    /[ \t]*<script[^>]*src=["']https:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*><\/script>\r?\n?/gi,
    ''
  );

  // Remove tailwind-config inline script block
  c = c.replace(
    /[ \t]*<script[^>]*id=["']tailwind-config["'][^>]*>[\s\S]*?<\/script>\r?\n?/gi,
    ''
  );

  // Insert local CSS link before </head> if not already present
  if (!c.includes(LOCAL_CSS_HREF)) {
    c = c.replace('</head>', linkTag + '\n</head>');
  }

  if (c !== original) {
    fs.writeFileSync(fpath, c, 'utf8');
    console.log('UPDATED:', fname);
    updatedCount++;
  } else {
    console.log('NO CHANGE:', fname);
  }
}

console.log('\nDone.', updatedCount, 'file(s) updated.');

// Verification summary
console.log('\n--- Verification ---');
for (const fname of files) {
  const fpath = path.join(dir, fname);
  if (!fs.existsSync(fpath)) continue;
  const c = fs.readFileSync(fpath, 'utf8');
  const hasCDN = c.includes('cdn.tailwindcss.com');
  const hasConfig = c.includes('tailwind-config');
  const hasLink = c.includes(LOCAL_CSS_HREF);
  const status = (!hasCDN && !hasConfig && hasLink) ? '✅' : '❌';
  console.log(`${status} ${fname}: CDN=${hasCDN} config=${hasConfig} link=${hasLink}`);
}