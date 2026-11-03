export const DRAFT_PREFIX = 'chatflow_draft_';

export const MESSAGE_EFFECTS = [
  { id: 'none', label: 'None', emoji: '💬' },
  { id: 'confetti', label: 'Confetti', emoji: '🎉' },
  { id: 'hearts', label: 'Hearts', emoji: '❤️' },
  { id: 'fireworks', label: 'Fireworks', emoji: '🎆' },
  { id: 'balloons', label: 'Balloons', emoji: '🎈' }
];

export const CURATED_GIFS = [
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
  'https://media.giphy.com/media/26BRuo6sGiljlGy4w/giphy.gif',
  'https://media.giphy.com/media/3o6Zt4HU9hqm6nY9eE/giphy.gif',
  'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif',
  'https://media.giphy.com/media/5GoVLqeAIo5Pu/giphy.gif',
  'https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif',
  'https://media.giphy.com/media/3o7TKsQ8MJHyTASOry/giphy.gif'
];

export const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

export function saveDraft(chatId, text) {
  if (!chatId) return;
  if (text?.trim()) {
    localStorage.setItem(`${DRAFT_PREFIX}${chatId}`, text);
  } else {
    localStorage.removeItem(`${DRAFT_PREFIX}${chatId}`);
  }
}

export function loadDraft(chatId) {
  if (!chatId) return '';
  return localStorage.getItem(`${DRAFT_PREFIX}${chatId}`) || '';
}

export function highlightSearchText(text, query) {
  if (!query?.trim() || !text) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? `<mark class="search-highlight">${part}</mark>`
      : part
  ).join('');
}

export function highlightMentions(text, isGroup) {
  if (!text || !isGroup) return text;
  return text.replace(/@(\w+)/g, '<span class="mention-tag">@$1</span>');
}

export function formatDeliveryStatus(status) {
  if (status === 'read') return { icon: '✓✓', className: 'read' };
  if (status === 'delivered') return { icon: '✓✓', className: 'delivered' };
  return { icon: '✓', className: 'sent' };
}

export function canEditMessage(message) {
  if (!message || message.messageType !== 'text') return false;
  if (message.isDeleted) return false;
  const age = Date.now() - new Date(message.createdAt).getTime();
  return age <= 15 * 60 * 1000;
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function triggerMessageEffect(effect, containerEl) {
  if (!effect || effect === 'none' || !containerEl) return;
  containerEl.classList.add(`effect-${effect}`);
  setTimeout(() => containerEl.classList.remove(`effect-${effect}`), 2500);
}
