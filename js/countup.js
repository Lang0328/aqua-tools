/*
 * 数字滚动动画
 *
 * 用法:
 *   <strong data-count="128" data-duration="1200">128</strong>
 *
 *   data-count: 最终目标数值
 *   data-duration: 动画持续毫秒（可选，默认 1200）
 *
 * 动画期间数字会快速随机跳动，最后稳定在目标值。
 * 配合页面淡入效果，达到"数据涌入"的视觉感受。
 */

(function() {
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function animateCount(el) {
        var target = parseInt(el.getAttribute("data-count"), 10);
        var duration = parseInt(el.getAttribute("data-duration"), 10) || 1200;
        if (isNaN(target)) return;

        var startTime = null;
        var lastUpdate = 0;
        var updateInterval = 40; // 每 40ms 更新一次显示

        // 动画开始时显示 0
        el.textContent = "0";

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);
            var eased = easeOutCubic(progress);

            // 节流：只在间隔超过 updateInterval 时才更新显示
            if (timestamp - lastUpdate < updateInterval && progress < 1) {
                requestAnimationFrame(step);
                return;
            }
            lastUpdate = timestamp;

            if (progress < 1) {
                // 随机跳动：随进度逼近目标值
                var max = Math.floor(target * 1.3) + 50;
                var randomVal;
                if (progress < 0.7) {
                    // 前 70% 阶段：在 0 ~ max 之间随机
                    randomVal = Math.floor(Math.random() * max);
                } else {
                    // 后 30% 阶段：在 target 附近震荡，逐渐收拢
                    var range = Math.max(2, Math.floor((1 - progress) * target * 0.8));
                    randomVal = target + Math.floor(Math.random() * range * 2 - range);
                    if (randomVal < 0) randomVal = 0;
                }
                el.textContent = randomVal;
                requestAnimationFrame(step);
            } else {
                // 动画结束，确保显示精确的目标值
                el.textContent = target;
            }
        }

        requestAnimationFrame(step);
    }

    function initAll() {
        var els = document.querySelectorAll("[data-count]");
        // 错开启动，让动画有层次感
        els.forEach(function(el, idx) {
            setTimeout(function() {
                animateCount(el);
            }, idx * 120);
        });
    }

    // 暴露给外部，便于动态更新数值后重放滚动动画
    window.animateCount = animateCount;

    // 页面加载完成后启动
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAll);
    } else {
        initAll();
    }
})();
