/**
 * 版权年份智能扫描替换脚本 (Batch Replace Copyright)
 * 
 * 此脚本可以被复制到项目的根目录下执行。
 * 在执行前，按照用户的意愿配置好 `OLD_YEAR`, `START_YEAR`, 以及扫描哪些目录（`TARGET_DIRS`）。
 * 它将深入这些目录找出旧版 Copyright 信息并为其重塑智能骨架。
 */

const fs = require('fs');
const path = require('path');

// ======================
// CONFIGURATION (用户设定参数)
// ======================
const OLD_YEAR = "2024";           // 需要被寻找并替换的旧硬编码年份
const START_YEAR = "2022";         // 可选：如果希望具有范围，例如 2022-现在。若是单今年份，设为空字符串 ""
const TARGET_COMPANY = "HELIOPOLIS"; // (可选) 可帮助收定匹配范围的实体名称关键词，留空则匹配通用版权符
const TARGET_DIRS = ['.', 'zh-SC', 'zh-TC']; // 定义要递归或搜索的物理目录

const currentYear = new Date().getFullYear(); 

for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) {
        console.warn(`[跳过] 找不到指定的目录范围: ${dir}`);
        continue;
    }

    // 在单层目录中寻找 .html (若有深层可自行拓展为递归逻辑)
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

    for (const file of files) {
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // 正则表达式构建：考虑到排版可能有空格以及 © 或 Copyright 标识
        // 例如：寻找 “© 2024” 或者 “Copyright (c) 2024”
        const symbolFormat = `(?:©|&copy;|Copyright(?:\\s*\\(c\\))?)`;
        const companyFormat = TARGET_COMPANY ? `(\\s+${TARGET_COMPANY})` : '()';
        
        const copyrightRegex = new RegExp(`(${symbolFormat}\\s*)${OLD_YEAR}${companyFormat}`, 'ig');

        let replacementStr = "";
        
        if (START_YEAR && START_YEAR.trim() !== "") {
            // 生成: © 2022-<span class="copyright-year">2026</span>
            replacementStr = `$1${START_YEAR}-<span class="copyright-year">${currentYear}</span>$2`;
        } else {
            // 生成: © <span class="copyright-year">2026</span>
            replacementStr = `$1<span class="copyright-year">${currentYear}</span>$2`;
        }

        const newContent = content.replace(copyrightRegex, replacementStr);

        if (content !== newContent) {
            fs.writeFileSync(filePath, newContent);
            console.log(`[替换成功] 已将动态版权骨架注入: ${filePath}`);
        }
    }
}
console.log("全站版权年份格式化流程结束。");