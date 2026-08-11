/*
 * 统一弹窗组件
 *
 * 提供:
 *   showAlert(message, onOk)        — 替代 alert()
 *   showConfirm(message, onConfirm) — 替代 confirm()，使用回调
 *   showToast(message, type)        — 轻量提示（type: success/error/info）
 *
 * 关闭后自动从 DOM 移除遮罩，恢复焦点，不影响后续交互
 */

// ====================== 内部工具 ======================

// 保存关闭前的焦点元素，关闭后恢复
var _modalPrevFocus = null;

function _createOverlay() {
    // 若已有弹窗则先移除
    var existing = document.getElementById("modal-overlay");
    if (existing) existing.remove();

    _modalPrevFocus = document.activeElement;

    var overlay = document.createElement("div");
    overlay.id = "modal-overlay";
    overlay.className = "modal-overlay";

    // 点击遮罩空白处不关闭（防止误操作），仅由按钮关闭
    overlay.addEventListener("click", function(e) {
        if (e.target === overlay) {
            // 不做任何操作，必须点击按钮
        }
    });

    document.body.appendChild(overlay);
    return overlay;
}

function _closeModal() {
    var overlay = document.getElementById("modal-overlay");
    if (overlay) {
        // 淡出动画
        overlay.classList.add("modal-fade-out");
        var card = overlay.querySelector(".modal-card");
        if (card) card.classList.add("modal-card-out");

        // 动画结束后彻底移除
        setTimeout(function() {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            // 恢复焦点
            if (_modalPrevFocus && _modalPrevFocus.focus) {
                _modalPrevFocus.focus();
            }
            _modalPrevFocus = null;
        }, 280);
    }
}

// ====================== Alert 弹窗 ======================
function showAlert(message, onOk) {
    var overlay = _createOverlay();

    var card = document.createElement("div");
    card.className = "modal-card";

    var icon = document.createElement("div");
    icon.className = "modal-icon modal-icon-info";
    icon.innerHTML = Icon.get("info");

    var body = document.createElement("div");
    body.className = "modal-body";
    body.innerHTML = message;

    var btnRow = document.createElement("div");
    btnRow.className = "modal-btn-row";

    var btn = document.createElement("button");
    btn.className = "modal-btn modal-btn-primary";
    btn.textContent = "确定";
    btn.onclick = function() {
        _closeModal();
        if (typeof onOk === "function") {
            setTimeout(onOk, 50);
        }
    };

    btnRow.appendChild(btn);
    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(btnRow);
    overlay.appendChild(card);

    // 自动聚焦按钮
    setTimeout(function() { btn.focus(); }, 50);

    // 按 Enter / Esc 关闭
    var keyHandler = function(e) {
        if (e.key === "Enter" || e.key === "Escape") {
            document.removeEventListener("keydown", keyHandler);
            _closeModal();
            if (typeof onOk === "function" && e.key === "Enter") {
                setTimeout(onOk, 50);
            }
        }
    };
    document.addEventListener("keydown", keyHandler);
}

// ====================== Confirm 弹窗 ======================
function showConfirm(message, onConfirm) {
    var overlay = _createOverlay();

    var card = document.createElement("div");
    card.className = "modal-card";

    var icon = document.createElement("div");
    icon.className = "modal-icon modal-icon-warn";
    icon.innerHTML = Icon.get("warn");

    var body = document.createElement("div");
    body.className = "modal-body";
    body.innerHTML = message;

    var btnRow = document.createElement("div");
    btnRow.className = "modal-btn-row";

    var btnConfirm = document.createElement("button");
    btnConfirm.className = "modal-btn modal-btn-confirm";
    btnConfirm.textContent = "确认";
    btnConfirm.onclick = function() {
        document.removeEventListener("keydown", keyHandler);
        _closeModal();
        if (typeof onConfirm === "function") {
            setTimeout(onConfirm, 50);
        }
    };

    var btnCancel = document.createElement("button");
    btnCancel.className = "modal-btn modal-btn-cancel";
    btnCancel.textContent = "取消";
    btnCancel.onclick = function() {
        document.removeEventListener("keydown", keyHandler);
        _closeModal();
    };

    btnRow.appendChild(btnConfirm);
    btnRow.appendChild(btnCancel);
    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(btnRow);
    overlay.appendChild(card);

    // 自动聚焦确认按钮
    setTimeout(function() { btnConfirm.focus(); }, 50);

    // 按 Enter 确认，Esc 取消
    var keyHandler = function(e) {
        if (e.key === "Enter") {
            document.removeEventListener("keydown", keyHandler);
            _closeModal();
            if (typeof onConfirm === "function") {
                setTimeout(onConfirm, 50);
            }
        } else if (e.key === "Escape") {
            document.removeEventListener("keydown", keyHandler);
            _closeModal();
        }
    };
    document.addEventListener("keydown", keyHandler);
}

// ====================== Toast 轻提示 ======================
function showToast(message, type) {
    type = type || "info";

    var existing = document.getElementById("toast-box");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "toast-box";
    toast.className = "toast-box toast-" + type;
    toast.innerHTML = message;

    document.body.appendChild(toast);

    // 入场动画
    setTimeout(function() {
        toast.classList.add("toast-show");
    }, 10);

    // 2.5 秒后自动消失
    setTimeout(function() {
        toast.classList.remove("toast-show");
        toast.classList.add("toast-hide");
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 2500);
}
