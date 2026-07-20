/*
 * 可信数据空间 — 数据查询与解密下载模块
 *
 * 功能:
 * 1. 查询密文数据（含权限校验）
 * 2. 解密文件并下载（含下载标识）
 * 3. 写入审计日志
 */

// ======================
// 查询数据
// ======================
async function searchData() {
    let id = document.getElementById("dataID").value.trim();

    if (!id) {
        showAlert("请输入数据编号");
        return;
    }

    // 读取加密数据
    let encrypted = localStorage.getItem(id);

    if (!encrypted) {
        document.getElementById("result").innerHTML =
            '<div class="upload-result"><span class="ico-inline">' + Icon.get("cross") + '</span>未找到该数据</div>';
        return;
    }

    // 解密
    let data = null;
    try {
        data = await decryptData(encrypted);
    } catch (e) {
        document.getElementById("result").innerHTML =
            '<div class="upload-result"><span class="ico-inline">' + Icon.get("cross") + '</span>数据解密失败，可能密钥已变更</div>';
        return;
    }

    // 权限校验
    const user = getCurrentUser();
    if (data.owner !== user.username && user.role !== "admin") {
        if (!checkAccess(id)) {
            document.getElementById("result").innerHTML =
                '<div class="upload-result" style="color:#e74c3c;">' +
                '<h3><span class="ico-inline">' + Icon.get("ban") + '</span>访问被拒绝</h3>' +
                '<p>您没有权限访问数据编号: ' + id + '</p>' +
                '<p>请联系管理员申请授权</p>' +
                '<button class="primary-btn" onclick="window.location.href=\'request.html?dataID=' + id + '\'"><span class="ico-inline">' + Icon.get("edit") + '</span>申请访问权限</button>' +
                '</div>';
            return;
        }
    }

    // 记录查询
    writeLog("查询数据", id);

    // 显示结果
    document.getElementById("result").innerHTML =
        '<div class="upload-result">' +
        '<h3>数据查询成功</h3>' +
        '<p>数据编号: ' + data.id + '</p>' +
        '<p>文件名称: ' + data.filename + '</p>' +
        '<p>数据所有者: ' + data.owner + '</p>' +
        '<p>上传时间: ' + data.uploadTime + '</p>' +
        '<p>文件大小: ' + data.size + ' Bytes</p>' +
        '<p>数据状态: <span class="ico-inline">' + Icon.get("lock") + '</span>AES-256-GCM 加密存储</p>' +
        '<button class="primary-btn" onclick="window.location.href=\'request.html?dataID=' + id + '\'"><span class="ico-inline">' + Icon.get("edit") + '</span>申请权限</button>' +
        '</div>';
}

// ======================
// 下载数据（含下载唯一标识）
// ======================
async function downloadData(id) {
    let encrypted = localStorage.getItem(id);

    if (!encrypted) {
        return;
    }

    // 解密
    let data = null;
    try {
        data = await decryptData(encrypted);
    } catch (e) {
        showAlert("数据解密失败，可能密钥已变更。请重新上传数据。");
        return;
    }

    // 再次校验权限
    const user = getCurrentUser();
    if (data.owner !== user.username && user.role !== "admin") {
        if (!checkAccess(id)) {
            showAlert("您没有下载该数据的权限");
            return;
        }
    }

    // 检查该用户对此数据的申请是否已过期
    if (user.role !== "admin") {
        try {
            var requests = JSON.parse(localStorage.getItem("requests") || "[]");
            var req = requests.find(function(r) {
                return r.dataID === id && r.requester === user.username;
            });
            if (req && req.status === "expired") {
                showAlert("该数据的授权已过期，无法下载");
                return;
            }
        } catch (e) { /* 忽略 */ }
    }

    // 生成唯一下载标识
    const downloadID = "DL-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" +
        Date.now().toString(36).toUpperCase();

    // Base64 转换 Blob
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

    // 记录下载日志（含下载标识）
    writeLog("解密下载数据", id + " [" + downloadID + "]");

    showAlert("文件解密成功，已开始下载\n下载标识: " + downloadID);
}
