import { GoogleGenerativeAI } from '@google/generative-ai';

export function getAiModel() {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  } catch {
    return null;
  }
}
