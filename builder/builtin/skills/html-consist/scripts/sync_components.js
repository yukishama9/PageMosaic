/**
 * 跨文件组件强制同步器 (Component Synchronization)
 * 读取一个已设定好的基准 HTML（如 index.html），解析其内部最标准的版式元素（如 nav, footer 和标准的弹窗），
 * 并暴力无缝地替换到同级目录下的所有其他页面上。
 * 同时它还会规整所有 <main> 标签内联类名的全局自适应缩放一致性。
 */
const fs = require('fs');

const STANDARD_FILE = 'index.html'; // 请确保这个设为您向用户确认过的基准文件！

if (!fs.existsSync(STANDARD_FILE)) {
    console.error(`无法找到基准文件 ${STANDARD_FILE}，请先确认存在。`);
    process.exit(1);
}

const standardHtml = fs.readFileSync(STANDARD_FILE, 'utf8');

// 1. 抓取标准大件
const navMatch = standardHtml.match(/<nav[^>]*>[\s\S]*?<\/nav>/i);
const footerMatch = standardHtml.match(/<footer[^>]*>[\s\S]*?<\/footer>/i);
const cookieMatch = standardHtml.match(/<div[^>]*id=["']?cookie-consent["']?[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i); // 依实际闭合数为准

if (!navMatch || !footerMatch) {
    console.error("在基准页面中无法提取到完整的 <nav> 或 <footer>");
    process.exit(1);
}

const navBlock = navMatch[0];
const footerBlock = footerMatch[0];
// cookie 内容若存在也可选用同步
const cookieBlock = cookieMatch ? cookieMatch[0] : '';

const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== STANDARD_FILE);

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');

    // 更替老式残缺 Nav
    content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/i, navBlock);

    // 更替老版不一致的 Footer
    content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/i, footerBlock);

    // 强行规整全部子页的 <main> class
    // 可在下方 stdClass 内填入与用户商量好的规范统一样式。
    let mainMatch = content.match(/<main([^>]*)>/i);
    if (mainMatch) {
        let originalClassStrMatch = mainMatch[1].match(/class="([^"]*)"/i);
        let classStr = originalClassStrMatch ? originalClassStrMatch[1] : '';
        
        // 抹除原本参差不齐的布局宽度参数
        let cleanedClass = classStr.replace(/\b(?:pt-\d+|pb-\d+|px-\d+|md:px-\d+|max-w-\w+|mx-auto|w-full|flex-grow)\b/g, '').trim();
        
        // 【在此设置期望的全局安全宽度限制以及自适应间距！】
        const stdClass = `w-full max-w-7xl mx-auto px-6 md:px-12 pt-32 pb-24 flex-grow ${cleanedClass}`.trim();
        
        content = content.replace(/<main[^>]*>/i, `<main class="${stdClass}">`);
    }

    fs.writeFileSync(file, content);
    console.log(`[同步完成] ${file} 的组件与版式已基准化`);
}