/*
 * 可信数据空间 — 权限控制模块
 *
 * 功能:
 * 1. 管理员: 管理所有权限（授权/撤销）
 * 2. 普通用户: 查看自己被授权的数据
 * 3. 权限检查: 在数据访问时验证
 *
 * 数据结构:
 * permission = { id, dataID, dataName, owner, allowedUser, expireTime, grantedAt }
 */

// ======================
// 获取所有权限
// ======================
function getPermissions() {
    return JSON.parse(localStorage.getItem("permissions") || "[]");
}

// ======================
// 保存权限列表
// ======================
function savePermissions(list) {
    localStorage.setItem("permissions", JSON.stringify(list));
}

// ======================
// 管理员: 授权用户访问数据
// ======================
function grantPermission(dataID, dataName, allowedUser, expireTime) {
    const user = getCurrentUser();
    if (!user || user.role !== "admin") {
        showAlert("仅管理员可以授权");
        return false;
    }

    const permissions = getPermissions();

    // 检查是否已存在相同授权
    const exists = permissions.find(
        p => p.dataID === dataID && p.allowedUser === allowedUser
    );
    if (exists) {
        showAlert("该用户已有此数据的访问权限");
        return false;
    }

    const perm = {
        id: "PERM-" + Date.now(),
        dataID: dataID,
        dataName: dataName || "未知",
        owner: user.username,
        allowedUser: allowedUser,
        expireTime: expireTime || "永久",
        grantedAt: new Date().toLocaleString()
    };

    permissions.push(perm);
    savePermissions(permissions);

    writeLog("授权数据访问", dataID + " → " + allowedUser);
    return true;
}

// ======================
// 管理员: 撤销授权
// ======================
function revokePermission(permID) {
    const user = getCurrentUser();
    if (!user || user.role !== "admin") {
        showAlert("仅管理员可以撤销授权");
        return false;
    }

    const permissions = getPermissions();
    const perm = permissions.find(p => p.id === permID);
    const newList = permissions.filter(p => p.id !== permID);
    savePermissions(newList);

    if (perm) {
        writeLog("撤销数据授权", perm.dataID + " ← " + perm.allowedUser);

        // 同步更新对应的申请记录状态为"已撤销"
        try {
            var requestsRaw = localStorage.getItem("requests");
            var requests = requestsRaw ? JSON.parse(requestsRaw) : [];
            var updated = false;
            requests.forEach(function(r) {
                if (r && r.dataID === perm.dataID &&
                    r.requester === perm.allowedUser &&
                    r.status !== "revoked" &&
                    r.status !== "pending") {
                    r.status = "revoked";
                    r.handledAt = new Date().toLocaleString();
                    updated = true;
                }
            });
            if (updated) {
                localStorage.setItem("requests", JSON.stringify(requests));
            }
        } catch (e) {
            // 忽略申请记录更新异常
        }
    }
    return true;
}

// ======================
// 管理员: 获取所有权限（用于显示）
// ======================
function getAllPermissions() {
    const user = getCurrentUser();
    if (!user || user.role !== "admin") return [];
    return getPermissions();
}

// ======================
// 普通用户: 获取自己被授权访问的数据列表
// ======================
function getMyPermissions() {
    const user = getCurrentUser();
    if (!user) return [];

    const permissions = getPermissions();
    return permissions.filter(p => p.allowedUser === user.username);
}

// ======================
// 权限验证: 检查当前用户是否可访问指定数据
// 规则:
//   - 管理员: 可访问全部
//   - 数据所有者: 可访问自己上传的数据
//   - 被授权用户: 可访问被授权的数据
// ======================
function checkAccess(dataID) {
    const user = getCurrentUser();
    if (!user) return false;

    // 管理员可访问全部
    if (user.role === "admin") return true;

    // 检查是否为数据所有者
    const encrypted = localStorage.getItem(dataID);
    if (!encrypted) return false;

    const permissions = getPermissions();
    const granted = permissions.find(
        p => p.dataID === dataID && p.allowedUser === user.username
    );

    return !!granted;
}

// ======================
// 获取数据所有者（不解密，从权限记录推断）
// ======================
function getDataOwner(dataID) {
    const permissions = getPermissions();
    const perm = permissions.find(p => p.dataID === dataID);
    return perm ? perm.owner : null;
}
