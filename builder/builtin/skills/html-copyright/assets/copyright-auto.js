/**
 * 客户端前端渲染版权运行时挂载 (Copyright Auto Runtime)
 * 
 * 作用：在客户端的浏览器挂载运行时，拦截寻找所有带有 `copyright-year` 的节点并为其附上系统当前的最新年份。
 * 建议被置入现有的框架 main.js 的事件尾部，或者单独作为一个 script tag。
 */

document.addEventListener("DOMContentLoaded", () => {
    // ---- Auto Copyright Year ----
    const yearEls = document.querySelectorAll('.copyright-year');
    if (yearEls.length > 0) {
        // 请求本地浏览器获取当下最新的格林尼治/本地自然年份
        const currentYear = new Date().getFullYear();
        yearEls.forEach(el => {
            el.textContent = currentYear;
        });
    }
});