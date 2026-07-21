/*
 * 可信数据空间 — 本地数据库模块（IndexedDB）
 *
 * 提供统一的加密数据存储能力，替代原先分散在 localStorage 的方案。
 * 所有已登录用户均可写入与读取，没有角色权限差异。
 *
 * 数据库:  TDS_Database
 * 对象仓库: dataspace_files (主键 id)
 * 记录结构:
 * {
 *   id, name, filename, fileType, size, owner,
 *   hash, uploadTime, description, storage, encrypted
 * }
 * 其中 encrypted 为 crypto.js 中 encryptData() 输出的 Base64 密文，
 * 其内容包含原始文件（dataURL），下载时由 decryptData() 还原。
 */

const DB_NAME = "TDS_Database";
const DB_VERSION = 1;
const STORE_NAME = "dataspace_files";

let _dbPromise = null;

// 打开（或创建）数据库
function openDB() {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = function (e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("owner", "owner", { unique: false });
                store.createIndex("uploadTime", "uploadTime", { unique: false });
            }
        };

        req.onsuccess = function (e) {
            resolve(e.target.result);
        };

        req.onerror = function (e) {
            reject(e.target.error);
        };
    });

    return _dbPromise;
}

// 写入 / 更新一条数据记录
async function dbAddFile(record) {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
    });
}

// 按编号读取一条数据记录
async function dbGetFile(id) {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
    });
}

// 读取全部数据记录（供列表展示）
async function dbGetAllFiles() {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
    });
}

// 删除一条数据记录
async function dbDeleteFile(id) {
    const db = await openDB();
    return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
    });
}
