export async function fetchLinkPreview(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ChatFlowBot/1.0' }
    });
    clearTimeout(timeout);
    const html = await response.text();
    const getMeta = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
      return m ? m[1] : '';
    };
    const title = getMeta('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || url;
    const description = getMeta('og:description') || getMeta('description') || '';
    const image = getMeta('og:image') || '';
    return { url, title: title.trim(), description: description.trim(), image };
  } catch {
    return { url, title: url, description: '', image: '' };
  }
}
