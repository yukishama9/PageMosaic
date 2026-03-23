/**
 * 幽灵节点核清除器 (Nuclear Cleanup)
 * 此脚本利用原生 JavaScript 循环遍历 DOM 片段，通过识别特征类名（snippet），
 * 计算层级的深度平衡（depth），安全且绝不对称地切割掉废弃的遗留大块外层容器 div
 */
const fs = require('fs');

/**
 * @param {string} html 当前文件代码文本
 * @param {string} classStrSnippet 要寻找消除的多余的特征 className 前缀片段
 */
function removeDivByClassPrefix(html, classStrSnippet) {
    let result = html;
    let targetIdx = result.indexOf(classStrSnippet);
    
    while (targetIdx !== -1) {
        // 往前摸索最近的所属 <div 标签的开头
        let startIdx = -1;
        for (let i = targetIdx; i >= 0; i--) {
            if (result.startsWith('<div', i)) {
                startIdx = i;
                break;
            }
        }
        
        if (startIdx === -1) break;

        // 往后游历以算准相应的闭合 </div>
        let depth = 1;
        let p = startIdx + 4;
        let endIdx = -1;
        while (depth > 0 && p < result.length) {
            const nextOpen = result.indexOf('<div', p);
            const nextClose = result.indexOf('</div', p);
            
            if (nextClose === -1) break; // 防止死循环

            // 碰到内部新的开启 div 先递增深度
            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++;
                p = nextOpen + 4;
            } else {
                // 否则证明碰到了平层或当前层的闭包
                depth--;
                p = nextClose + 5;
            }
        }

        if (depth === 0) {
            const closingBracket = result.indexOf('>', p);
            if (closingBracket !== -1) {
                endIdx = closingBracket + 1;
                // 将该包含目标外骨骼元素的完整体字符串剔除
                result = result.substring(0, startIdx) + result.substring(endIdx);
                console.log(`[清除成功] 歼灭残余幽灵容器特征: ${classStrSnippet.substring(0, 30)}...`);
                // 再次查找确保没有同类遗留
                targetIdx = result.indexOf(classStrSnippet);
                continue;
            }
        }
        break; // 以防匹配脱轨
    }
    return result;
}

// 示例调用：
// let files = ['contact.html'];
// for (const file of files) {
//     let html = fs.readFileSync(file, 'utf8');
//     html = removeDivByClassPrefix(html, 'class="fixed bottom-6 right-6 z-50'); /* 替换为你的特征片段 */
//     fs.writeFileSync(file, html);
// }
// module.exports = removeDivByClassPrefix;