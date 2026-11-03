// client/src/utils/encryption.js

export const encryptMessage = (text, key) => {
  if (!text) return '';
  if (!key) return text;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(unescape(encodeURIComponent(result)));
};

export const decryptMessage = (encoded, key) => {
  if (!encoded) return '';
  if (!key) return encoded;
  try {
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return decodeURIComponent(escape(result));
  } catch (e) {
    return '[Decryption Failed: Keys Mismatch]';
  }
};
