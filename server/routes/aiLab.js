import express from 'express';
import { auth } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

let aiLabGemini;

const getAiLabGeminiModel = () => {
  if (!aiLabGemini && process.env.AI_LAB_GEMINI_API_KEY) {
    aiLabGemini = new GoogleGenerativeAI(process.env.AI_LAB_GEMINI_API_KEY);
  }

  return aiLabGemini?.getGenerativeModel({
    model: process.env.AI_LAB_GEMINI_MODEL || 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 2600,
      responseMimeType: 'application/json'
    }
  });
};

const LAB_MODES = {
  code_debug: {
    title: 'Code debugger',
    system: 'You are a senior software engineer. Find bugs, risks, security issues, performance problems, and practical fixes. Be specific and concise.',
    output: 'Return JSON with keys: summary, findings, fixedCode, tests, nextSteps.'
  },
  repo_extract: {
    title: 'GitHub project extractor',
    system: 'You are a project architect. Analyze repositories, identify stack, setup steps, architecture, risks, missing features, and roadmap.',
    output: 'Return JSON with keys: summary, stack, architecture, setupGuide, risks, improvements, roadmap, readmeDraft.'
  },
  research_brief: {
    title: 'Research brief',
    system: 'You are a careful research analyst. Create balanced, structured research notes. Do not invent sources; mark claims that need verification.',
    output: 'Return JSON with keys: executiveSummary, keyPoints, comparisonTable, openQuestions, sourceQueries, finalBrief.'
  },
  study_tutor: {
    title: 'Study tutor',
    system: 'You are a patient tutor. Teach clearly, ask useful questions, and produce revision material for students.',
    output: 'Return JSON with keys: explanation, examples, flashcards, quiz, memoryHooks, studyPlan.'
  },
  personal_planner: {
    title: 'Personal planner',
    system: 'You are a practical life planner. Help with daily planning, habits, decisions, priorities, and emotional load without overclaiming medical or legal advice.',
    output: 'Return JSON with keys: plan, priorities, reminders, risks, gentleCheckIn, nextActions.'
  },
  decision_matrix: {
    title: 'Decision matrix',
    system: 'You are a decision analyst. Compare options using criteria, tradeoffs, risks, and a clear recommendation.',
    output: 'Return JSON with keys: options, criteria, matrix, recommendation, assumptions, nextSteps.'
  },
  paper_notes: {
    title: 'Paper and notes explainer',
    system: 'You are an academic reading assistant. Explain papers, notes, chapters, and dense material in simple language.',
    output: 'Return JSON with keys: abstract, simpleExplanation, importantTerms, method, limitations, examNotes, questionsToAsk.'
  },
  automation_designer: {
    title: 'Automation designer',
    system: 'You are a personal automation architect. Convert user needs into safe, specific automation rules and fallback behavior.',
    output: 'Return JSON with keys: automations, triggers, conditions, actions, safetyChecks, implementationNotes.'
  }
};

const clampText = (text = '', limit = 16000) => String(text).slice(0, limit);

const parseJsonish = (text) => {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { raw: cleaned };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { raw: cleaned };
    }
  }
};

const fetchWithTimeout = async (url, options = {}, timeout = 12000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`Request failed with status ${response.status}: ${body.slice(0, 240)}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildProviderFallback = (mode, reason, technicalDetail = '') => {
  const modeConfig = LAB_MODES[mode] || LAB_MODES.research_brief;
  return {
    mode,
    title: modeConfig.title,
    model: process.env.AI_LAB_GEMINI_MODEL || 'gemini-2.0-flash',
    providerStatus: 'gemini_unavailable',
    result: {
      summary: reason,
      whatHappened: 'The AI Lab route is wired correctly, but Gemini rejected the request before generating an answer.',
      nextSteps: [
        'Confirm the AI Lab Gemini API key is active in Google AI Studio.',
        'Check project limits, quota, and API access for the Gemini key.',
        'Restart the backend server after changing .env values.',
        'Try the request again from AI Lab.'
      ],
      technicalDetail: technicalDetail || 'No extra Gemini error detail was returned.',
      temporaryWorkaround: 'Kane AI and existing non-AI-Lab tools are separate and can still use their own configured providers.'
    },
    raw: ''
  };
};

const parseGithubRepo = (input = '') => {
  const match = input.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, '')
  };
};

const loadGithubContext = async (input) => {
  const repo = parseGithubRepo(input);
  if (!repo) return null;

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ChatFlow-AI-Lab'
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const [repoRes, contentsRes] = await Promise.all([
      fetchWithTimeout(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, { headers }, 9000),
      fetchWithTimeout(`https://api.github.com/repos/${repo.owner}/${repo.repo}/contents`, { headers }, 9000)
    ]);

    const repoData = await repoRes.json();
    const contents = await contentsRes.json();
    return {
      repo: `${repo.owner}/${repo.repo}`,
      description: repoData.description,
      language: repoData.language,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      defaultBranch: repoData.default_branch,
      homepage: repoData.homepage,
      files: Array.isArray(contents)
        ? contents.slice(0, 60).map((item) => ({ name: item.name, type: item.type, path: item.path }))
        : []
    };
  } catch (error) {
    return {
      repo: `${repo.owner}/${repo.repo}`,
      warning: `Could not load GitHub metadata: ${error.message}`
    };
  }
};

const callAiLabGemini = async ({ mode, input, context = '', githubContext = null }) => {
  const model = getAiLabGeminiModel();
  if (!model) {
    const error = new Error('AI Lab Gemini API key is not configured');
    error.status = 500;
    throw error;
  }

  const modeConfig = LAB_MODES[mode] || LAB_MODES.research_brief;
  const prompt = [
    `Mode: ${modeConfig.title}`,
    `User context: ${clampText(context, 2500) || 'none'}`,
    githubContext ? `GitHub metadata:\n${JSON.stringify(githubContext, null, 2)}` : '',
    `User input:\n${clampText(input)}`,
    modeConfig.output,
    'Return only valid JSON. Keep it useful for a modern AI lab interface.'
  ].filter(Boolean).join('\n\n');

  const result = await model.generateContent([
    `${modeConfig.system} Always respond with valid JSON only.`,
    prompt
  ].join('\n\n'));
  const text = result.response.text();

  return {
    mode,
    title: modeConfig.title,
    model: process.env.AI_LAB_GEMINI_MODEL || 'gemini-2.0-flash',
    result: parseJsonish(text),
    raw: text
  };
};

router.get('/templates', auth, (req, res) => {
  res.json({
    modes: Object.entries(LAB_MODES).map(([id, mode]) => ({
      id,
      title: mode.title
    })),
    starters: {
      code_debug: 'Paste code, an error log, or describe the bug you want fixed.',
      repo_extract: 'Paste a GitHub repository URL and what you want to understand or improve.',
      research_brief: 'Enter a research topic, question, or debate you want analyzed.',
      study_tutor: 'Paste chapter notes or a topic you want explained with quiz and flashcards.',
      personal_planner: 'Describe your day, goals, habits, or problem you want organized.',
      decision_matrix: 'List your options and the criteria that matter.',
      paper_notes: 'Paste paper text, abstract, or dense notes.',
      automation_designer: 'Describe a personal automation rule you want created safely.'
    }
  });
});

const runGeminiLab = async (req, res) => {
  let mode = req.body?.mode || 'research_brief';
  try {
    const { input, context = '' } = req.body;
    if (!input?.trim()) return res.status(400).json({ message: 'Input is required' });

    const githubContext = mode === 'repo_extract' ? await loadGithubContext(input) : null;
    const result = await callAiLabGemini({ mode, input, context, githubContext });
    res.json({ ...result, githubContext });
  } catch (error) {
    console.error('AI Lab Gemini error:', error);
    if (error.status === 401 || error.status === 402 || error.status === 403 || /quota|billing|credit|insufficient|invalid api key|api key not valid|permission/i.test(error.body || error.message || '')) {
      return res.json(buildProviderFallback(
        mode,
        'Gemini could not generate the answer because the AI Lab API key, quota, or project permission needs attention.',
        String(error.body || error.message || '').slice(0, 500)
      ));
    }
    res.status(error.status || 500).json({ message: error.message || 'Gemini request failed' });
  }
};

router.post('/gemini/run', auth, runGeminiLab);

export default router;
