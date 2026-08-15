/*
 * 可信数据空间 — 数据安全保护模块（Web Crypto API）
 *
 * 功能:
 * 1. AES-256-GCM 加密（Web Crypto API 原生实现）
 * 2. AES-256-GCM 解密
 * 3. SHA-256 完整性摘要
 *
 * 密钥派生: PBKDF2(主密码, 固定salt) → AES-256
 * 每次加密生成随机 12 字节 IV，与密文拼接后 Base64 输出
 */

// PBKDF2 固定盐值
const KEY_DERIVATION_SALT = new Uint8Array([
    0x54, 0x44, 0x53, 0x5f, 0x50, 0x52, 0x4f, 0x54,
    0x4f, 0x43, 0x4f, 0x4c, 0x32, 0x30, 0x32, 0x36
]);

let _cryptoKey = null;

// ======================
// 获取或派生 AES-256-GCM 密钥
// ======================
async function getCryptoKey() {
    if (_cryptoKey) return _cryptoKey;

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("TrustedDataSpace2026MasterKey!"),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    _cryptoKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: KEY_DERIVATION_SALT,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    return _cryptoKey;
}

// ======================
// AES-256-GCM 加密
// 输入: JS 对象 → 输出: Base64(12字节IV + 密文)
// ======================
async function encryptData(data) {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        plaintext
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

// ======================
// AES-256-GCM 解密
// 输入: Base64(12字节IV + 密文) → 输出: JS 对象
// ======================
async function decryptData(cipher) {
    const key = await getCryptoKey();
    const combined = Uint8Array.from(atob(cipher), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
}

// ======================
// SHA-256 完整性摘要
// ======================
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
