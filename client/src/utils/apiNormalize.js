/**
 * Coerce API payloads to arrays. Prevents crashes when the server returns
 * { message: "..." }, { chats: [] }, or proxy errors as plain objects.
 */
export function normalizeList(data, keys = []) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return [];
}

export const normalizeChatsList = (data) => normalizeList(data, ['chats']);
export const normalizeMessagesList = (data) => normalizeList(data, ['messages']);
export const normalizeUsersList = (data) => normalizeList(data, ['users']);
export function normalizeContactsList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.contacts)) return data.contacts;
  return normalizeList(data, ['contacts']);
}
