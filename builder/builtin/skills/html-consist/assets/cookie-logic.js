/**
 * 全局 Cookie 同步与强制隐藏逻辑 (Global Cookie Behavior)
 * 
 * 使用方式：
 * 确保您的标准化极简 HTML 中包含：
 * 弹窗本体: id="cookie-consent"
 * 接受按钮: id="accept-cookies"
 * 拒绝按钮: id="decline-cookies"
 * 
 * 将此段代码内联于目标 `<script>` 或粘贴进项目主要的 `main.js` 内部以获得全局护航。
 */
document.addEventListener("DOMContentLoaded", () => {
    // 获取全局同名弹窗节点
    const cookieConsent = document.getElementById("cookie-consent");
    
    if (cookieConsent) {
        // 利用 localStorage 探测用户是否曾有点击记录（跨所有同域名下子页面）
        if (localStorage.getItem("cookieAccepted")) {
            // 已交互情况下，通过内联强制切断一切 Tailwind/定位样式的可见性避免闪烁
            cookieConsent.style.display = "none";
            cookieConsent.style.opacity = "0";
            cookieConsent.style.visibility = "hidden";
        } else {
            // 为预防某些写死的 CSS `display:none` 导致第一次也没出现，此时需将其强制暴露
            cookieConsent.style.display = "block";  // (按 HTML 设计原始定位也可取消这行)
            
            // 绑定对应的交互行为按钮（如拒绝与同意可共用逻辑，或根据合规要求分拆存储）
            const acceptBtn = document.getElementById("accept-cookies");
            const declineBtn = document.getElementById("decline-cookies");

            // 具有平滑体验的关闭动效闭包
            const hideConsent = () => {
                // 写下永久记忆
                localStorage.setItem("cookieAccepted", "true");
                
                // 执行一个往下的消散脱离动效
                cookieConsent.style.opacity = "0";
                cookieConsent.style.transform = "translateY(100%)"; // 前提组件需带有 transition-transform
                
                // 待动画退下结束后彻底脱出渲染树
                setTimeout(() => {
                    cookieConsent.style.display = "none";
                }, 500); 
            };

            // 精确地仅对唯一按钮响应生效，拒绝泛用化的外围 onclick 扰乱
            if (acceptBtn) acceptBtn.addEventListener("click", hideConsent);
            if (declineBtn) declineBtn.addEventListener("click", hideConsent);
        }
    }
});