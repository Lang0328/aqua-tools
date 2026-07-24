/*
 * 可信数据空间 — 数据查询与解密下载模块
 *
 * 说明: 所有已登录用户均可查询、下载、删除数据，没有角色权限差异。
 *      文件以 AES-256-GCM 加密形式存储于本地数据库（IndexedDB）。
 */

// HTML 转义，防止存储的文件名/描述造成 XSS
function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ======================
// 查询数据（按编号）
// ======================
async function searchData() {
    let id = document.getElementById("dataID").value.trim();
    if (!id) {
        showAlert("请输入数据编号");
        return;
    }

    let record = await dbGetFile(id);
    if (!record) {
        document.getElementById("result").innerHTML =
            '<div class="upload-result"><span class="ico-inline">' + Icon.get("cross") + '</span>未找到该数据</div>';
        return;
    }

    let data = null;
    try {
        data = await decryptData(record.encrypted);
    } catch (e) {
        document.getElementById("result").innerHTML =
            '<div class="upload-result"><span class="ico-inline">' + Icon.get("cross") + '</span>数据解密失败，可能密钥已变更</div>';
        return;
    }

    writeLog("查询数据", id);

    document.getElementById("result").innerHTML =
        '<div class="upload-result">' +
        '<h3>数据查询成功</h3>' +
        '<p>数据编号: ' + escapeHtml(data.id) + '</p>' +
        '<p>文件名称: ' + escapeHtml(data.filename) + '</p>' +
        '<p>数据所有者: ' + escapeHtml(data.owner) + '</p>' +
        '<p>上传时间: ' + escapeHtml(data.uploadTime) + '</p>' +
        '<p>文件大小: ' + data.size + ' Bytes</p>' +
        '<p>数据状态: <span class="ico-inline">' + Icon.get("lock") + '</span>AES-256-GCM 加密存储</p>' +
        '<button class="primary-btn" onclick="downloadData(\'' + escapeHtml(data.id) + '\')"><span class="ico-inline">' + Icon.get("download") + '</span>下载并解密</button>' +
        '</div>';
}

// ======================
// 下载数据（含下载唯一标识）
// ======================
async function downloadData(id) {
    let record = await dbGetFile(id);
    if (!record) {
        showAlert("未找到该数据");
        return;
    }

    let data = null;
    try {
        data = await decryptData(record.encrypted);
    } catch (e) {
        showAlert("数据解密失败，可能密钥已变更。请重新上传数据。");
        return;
    }

    const downloadID = "DL-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" +
        Date.now().toString(36).toUpperCase();

    let base64 = data.content.split(",")[1];
    let mime = data.fileType;

    let binary = atob(base64);
    let len = binary.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    let blob = new Blob([bytes], { type: mime });
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);

    writeLog("解密下载数据", id + " [" + downloadID + "]");
    showAlert("文件解密成功，已开始下载\n下载标识: " + downloadID);
}

// ======================
// 渲染数据存储列表（所有用户可见、可下载、可删除）
// ======================
async function renderFileList() {
    const container = document.getElementById("fileList");
    if (!container) return;

    let files = await dbGetAllFiles();

    // 按上传时间倒序
    files.sort(function (a, b) {
        return (b.uploadTime || "") < (a.uploadTime || "") ? -1 : 1;
    });

    if (!files.length) {
        container.innerHTML = '<p class="empty-state">暂无已存储的数据，请前往「数据上传」页面添加。</p>';
        return;
    }

    let rows = files.map(function (f) {
        return '<tr>' +
            '<td>' + escapeHtml(f.id) + '</td>' +
            '<td>' + escapeHtml(f.name || "-") + '</td>' +
            '<td>' + escapeHtml(f.filename || "-") + '</td>' +
            '<td>' + (f.size != null ? f.size + " Bytes" : "-") + '</td>' +
            '<td>' + escapeHtml(f.owner || "-") + '</td>' +
            '<td>' + escapeHtml(f.uploadTime || "-") + '</td>' +
            '<td class="op-cell">' +
                '<button class="primary-btn" onclick="downloadData(\'' + escapeHtml(f.id) + '\')"><span class="ico-inline">' + Icon.get("download") + '</span>下载</button>' +
                ' <button class="logout" onclick="deleteFile(\'' + escapeHtml(f.id) + '\')">删除</button>' +
            '</td>' +
        '</tr>';
    }).join("");

    container.innerHTML =
        '<table class="data-table"><thead><tr>' +
        '<th>数据编号</th><th>数据名称</th><th>文件名</th><th>大小</th><th>上传者</th><th>上传时间</th><th>操作</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

// ======================
// 删除数据
// ======================
async function deleteFile(id) {
    const record = await dbGetFile(id);
    const name = record ? (record.name || id) : id;
    showConfirm("确认删除数据「" + name + "」？此操作不可恢复。", async function () {
        await dbDeleteFile(id);
        writeLog("删除数据", id);
        renderFileList();
        showAlert("数据已删除");
    });
}
