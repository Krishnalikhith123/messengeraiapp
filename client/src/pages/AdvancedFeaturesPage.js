import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  FiActivity,
  FiBookOpen,
  FiCode,
  FiCopy,
  FiCpu,
  FiFileText,
  FiGitPullRequest,
  FiHeart,
  FiSearch,
  FiShield,
  FiTrendingUp
} from 'react-icons/fi';
import './AdvancedFeaturesPage.css';

const defaultLabModes = [
  { id: 'code_debug', title: 'Code debugger' },
  { id: 'repo_extract', title: 'GitHub extractor' },
  { id: 'research_brief', title: 'Research brief' },
  { id: 'study_tutor', title: 'Study tutor' },
  { id: 'personal_planner', title: 'Personal planner' },
  { id: 'decision_matrix', title: 'Decision matrix' },
  { id: 'paper_notes', title: 'Paper notes' },
  { id: 'automation_designer', title: 'Automation designer' }
];

const labModeIcons = {
  code_debug: FiCode,
  repo_extract: FiGitPullRequest,
  research_brief: FiSearch,
  study_tutor: FiBookOpen,
  personal_planner: FiHeart,
  decision_matrix: FiTrendingUp,
  paper_notes: FiFileText,
  automation_designer: FiCpu
};

const starterPrompts = {
  code_debug: 'Paste code, an error log, or describe the bug you want fixed.',
  repo_extract: 'Paste a GitHub repository URL and what you want to understand or improve.',
  research_brief: 'Enter a research topic, question, or debate you want analyzed.',
  study_tutor: 'Paste chapter notes or a topic you want explained with quiz and flashcards.',
  personal_planner: 'Describe your day, goals, habits, or problem you want organized.',
  decision_matrix: 'List your options and the criteria that matter.',
  paper_notes: 'Paste paper text, abstract, or dense notes.',
  automation_designer: 'Describe a personal automation rule you want created safely.'
};

const renderLabValue = (value, keyPrefix = 'lab') => {
  if (Array.isArray(value)) {
    return (
      <div className="lab-list">
        {value.map((item, idx) => (
          <div key={`${keyPrefix}-${idx}`} className="lab-list-item">
            {renderLabValue(item, `${keyPrefix}-${idx}`)}
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className="lab-object">
        {Object.entries(value).map(([key, item]) => (
          <div key={`${keyPrefix}-${key}`} className="lab-object-row">
            <strong>{key.replace(/([A-Z])/g, ' $1')}</strong>
            {renderLabValue(item, `${keyPrefix}-${key}`)}
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value ?? 'Not available')}</span>;
};

function AdvancedFeaturesPage() {
  const [code, setCode] = useState('function add(a,b){ return a+b }');
  const [analysis, setAnalysis] = useState(null);
  const [projectText, setProjectText] = useState('Check https://github.com/facebook/react/pull/12345 and PROJ-42');
  const [projectLinks, setProjectLinks] = useState([]);
  const [projectDigest, setProjectDigest] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [split, setSplit] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('48');
  const [expensePeople, setExpensePeople] = useState('Me, Ashwin, Mom');
  const [habitSuggestions, setHabitSuggestions] = useState([]);
  const [habitPlans, setHabitPlans] = useState([]);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [habitAnswers, setHabitAnswers] = useState({});
  const [labModes, setLabModes] = useState(defaultLabModes);
  const [labStarters, setLabStarters] = useState(starterPrompts);
  const [labMode, setLabMode] = useState('code_debug');
  const [labInput, setLabInput] = useState('Paste code, a GitHub repo URL, research topic, study notes, or a personal planning problem here.');
  const [labContext, setLabContext] = useState('Make it practical, modern, and action-focused.');
  const [labResult, setLabResult] = useState(null);
  const [labHistory, setLabHistory] = useState([]);
  const [loading, setLoading] = useState('');

  const run = async (key, fn) => {
    setLoading(key);
    try {
      await fn();
    } finally {
      setLoading('');
    }
  };

  const loadHealthHub = async () => {
    const [suggestionsRes, plansRes] = await Promise.all([
      axios.get('/api/health/habit-suggestions'),
      axios.get('/api/health/habit-plans')
    ]);
    setHabitSuggestions(suggestionsRes.data.suggestions || []);
    setHabitPlans(plansRes.data.plans || []);
  };

  useEffect(() => {
    loadHealthHub().catch(() => toast.error('Could not load health habit hub'));
    axios.get('/api/ai-lab/templates')
      .then((res) => {
        setLabModes(res.data.modes || defaultLabModes);
        setLabStarters(res.data.starters || starterPrompts);
      })
      .catch(() => {});
  }, []);

  const runGeminiLab = () => run('gemini-lab', async () => {
    const res = await axios.post('/api/ai-lab/gemini/run', {
      mode: labMode,
      input: labInput,
      context: labContext
    });
    setLabResult(res.data);
    setLabHistory((items) => [res.data, ...items].slice(0, 5));
    if (res.data.providerStatus === 'gemini_unavailable') {
      toast.error('AI Lab Gemini key, quota, or permission needs attention');
    } else {
      toast.success('Gemini finished the lab run');
    }
  }).catch((err) => toast.error(err.response?.data?.message || 'Gemini lab failed'));

  const copyLabResult = () => {
    if (!labResult) return;
    navigator.clipboard?.writeText(JSON.stringify(labResult.result, null, 2));
    toast.success('Lab result copied');
  };

  const analyzeCode = () => run('code', async () => {
    const res = await axios.post('/api/ai/analyze-code', { code, language: 'javascript' });
    setAnalysis(res.data);
  }).catch(() => toast.error('Code analysis needs Gemini API configured'));

  const parseProject = () => run('project', async () => {
    const [parsed, digest] = await Promise.all([
      axios.post('/api/integrations/parse-message', { message: projectText }),
      axios.post('/api/integrations/digest', { message: projectText })
    ]);
    setProjectLinks(parsed.data.projectLinks || []);
    setProjectDigest(digest.data);
  }).catch(() => toast.error('Could not parse project links'));

  const loadForecast = () => run('expense', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const res = await axios.get(`/api/expenses/forecast/${month}`);
    setForecast(res.data);
  }).catch(() => toast.error('Log expenses first to forecast'));

  const suggestSplit = () => run('split', async () => {
    const participants = expensePeople.split(',').map((name) => name.trim()).filter(Boolean);
    const res = await axios.post('/api/expenses/split-suggest', {
      amount: Number(expenseAmount),
      participants
    });
    setSplit(res.data);
  }).catch(() => toast.error('Could not suggest bill split'));

  const addManualExpense = () => run('add-expense', async () => {
    await axios.post('/api/expenses/upload-receipt', {
      manualData: {
        amount: Number(expenseAmount),
        category: 'food',
        description: 'Quick expense from AI Lab',
        currency: 'USD',
        tags: ['manual']
      }
    });
    toast.success('Expense logged');
    loadForecast();
  }).catch(() => toast.error('Could not log expense'));

  const selectHabit = (habit) => {
    const defaults = {};
    habit.questions.forEach((question) => {
      defaults[question.key] = question.defaultValue;
    });
    setSelectedHabit(habit);
    setHabitAnswers(defaults);
  };

  const updateHabitAnswer = (key, value) => {
    setHabitAnswers((answers) => ({ ...answers, [key]: value }));
  };

  const toggleDay = (key, day) => {
    const current = habitAnswers[key] || [];
    updateHabitAnswer(
      key,
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
    );
  };

  const createHabitPlan = () => run('habit-create', async () => {
    const res = await axios.post('/api/health/habit-plans', {
      type: selectedHabit.type,
      title: selectedHabit.title,
      answers: habitAnswers
    });
    toast.success(res.data.message);
    setSelectedHabit(null);
    await loadHealthHub();
  }).catch(() => toast.error('Could not create health plan'));

  const checkInHabit = (plan) => run(`habit-${plan._id}`, async () => {
    const res = await axios.post(`/api/health/habit-plans/${plan._id}/check-in`, {
      value: 'done',
      note: 'Checked in from AI Lab'
    });
    toast.success(res.data.message);
    await loadHealthHub();
  }).catch((err) => toast.error(err.response?.data?.message || 'Could not check in'));

  return (
    <div className="app-scroll-page advanced-page">
      <header className="advanced-header">
        <h1>Advanced AI Lab</h1>
        <p>Gemini-powered coding, research, study, personal planning, project intelligence, expenses, health, and creative tools in one focused workspace.</p>
      </header>

      <section className="gemini-lab">
        <div className="gemini-lab-head">
          <div>
            <span className="lab-kicker">Gemini AI Workspace</span>
            <h2>Build, study, research, debug, and plan from one command center.</h2>
            <p>Choose a lab mode, add context, run Gemini, then copy or continue from the structured result.</p>
          </div>
          <button type="button" onClick={runGeminiLab} disabled={loading === 'gemini-lab'}>
            {loading === 'gemini-lab' ? 'Running Gemini...' : 'Run Gemini Lab'}
          </button>
        </div>

        <div className="lab-mode-grid">
          {labModes.map((mode) => {
            const Icon = labModeIcons[mode.id] || FiCpu;
            return (
              <button
                key={mode.id}
                type="button"
                className={labMode === mode.id ? 'active' : ''}
                onClick={() => {
                  setLabMode(mode.id);
                  setLabInput(labStarters[mode.id] || starterPrompts[mode.id] || '');
                }}
              >
                <Icon />
                <span>{mode.title}</span>
              </button>
            );
          })}
        </div>

        <div className="lab-workbench">
          <div className="lab-input-panel">
            <label>
              <span>Main input</span>
              <textarea value={labInput} onChange={(event) => setLabInput(event.target.value)} />
            </label>
            <label>
              <span>Extra context</span>
              <input value={labContext} onChange={(event) => setLabContext(event.target.value)} />
            </label>
            <button
              type="button"
              className="lab-send-button"
              onClick={runGeminiLab}
              disabled={loading === 'gemini-lab' || !labInput.trim()}
            >
              {loading === 'gemini-lab' ? 'Sending to Gemini...' : 'Send to Gemini'}
            </button>
          </div>

          <div className="lab-output-panel">
            <div className="lab-output-head">
              <strong>{labResult?.title || 'Structured result'}</strong>
              <button type="button" onClick={copyLabResult} disabled={!labResult}><FiCopy /> Copy</button>
            </div>
            {labResult ? (
              <div className="lab-result">
                {labResult.providerStatus === 'gemini_unavailable' && (
                  <div className="lab-provider-warning">
                    AI Lab Gemini is connected separately from Kane AI, but the key, quota, or project permission needs attention before it can generate live AI results.
                  </div>
                )}
                {labResult.githubContext && (
                  <div className="github-context">
                    <strong>GitHub context</strong>
                    <span>{labResult.githubContext.repo || 'Repo detected'}</span>
                    {labResult.githubContext.warning && <small>{labResult.githubContext.warning}</small>}
                  </div>
                )}
                {renderLabValue(labResult.result)}
              </div>
            ) : (
              <div className="lab-empty">
                <FiCpu />
                <span>Gemini output will appear here as cards, lists, plans, fixes, quizzes, or research notes.</span>
              </div>
            )}
          </div>
        </div>

        {labHistory.length > 0 && (
          <div className="lab-history">
            <h3>Recent lab runs</h3>
            {labHistory.map((item, idx) => (
              <button key={`${item.mode}-${idx}`} type="button" onClick={() => setLabResult(item)}>
                <span>{item.title}</span>
                <small>{item.model}</small>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="advanced-grid">
        <section className="advanced-panel">
          <h2><FiCode /> Code Collaboration Copilot</h2>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} />
          <button type="button" onClick={analyzeCode} disabled={loading === 'code'}>
            {loading === 'code' ? 'Analyzing...' : 'Find bugs and risks'}
          </button>
          {analysis && (
            <div className="result-box">
              <strong>Score: {analysis.score ?? 'n/a'}</strong>
              <p>{analysis.explanation}</p>
              {(analysis.bugs || []).slice(0, 3).map((bug, idx) => (
                <span key={idx}>{bug.severity}: {bug.issue}</span>
              ))}
            </div>
          )}
        </section>

        <section className="advanced-panel">
          <h2><FiGitPullRequest /> GitHub/Jira Intelligence</h2>
          <textarea value={projectText} onChange={(event) => setProjectText(event.target.value)} />
          <button type="button" onClick={parseProject} disabled={loading === 'project'}>Extract project cards</button>
          <div className="result-box">
            {projectLinks.map((link, idx) => (
              <span key={idx}>{link.type}: {link.owner || link.key}/{link.repo || ''} #{link.number || ''}</span>
            ))}
            {projectLinks.length === 0 && <span>Paste GitHub PRs, issues, or Jira keys.</span>}
            {projectDigest?.items?.map((item, idx) => (
              <span key={`digest-${idx}`}>
                {item.title || item.key || item.number}: {item.recommendation}
              </span>
            ))}
          </div>
        </section>

        <section className="advanced-panel">
          <h2><FiTrendingUp /> Smart Expense Forecasting</h2>
          <p>Forecast monthly spend, budget risk, and savings ideas from logged expenses.</p>
          <div className="inline-fields">
            <input value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="Amount" />
            <input value={expensePeople} onChange={(event) => setExpensePeople(event.target.value)} placeholder="People, comma separated" />
          </div>
          <div className="button-row">
            <button type="button" onClick={addManualExpense} disabled={loading === 'add-expense'}>Log expense</button>
            <button type="button" onClick={suggestSplit} disabled={loading === 'split'}>Suggest split</button>
          </div>
          <button type="button" onClick={loadForecast} disabled={loading === 'expense'}>Load forecast</button>
          {forecast && (
            <div className="result-box">
              <strong>{forecast.month}</strong>
              <span>Predicted: {forecast.forecast?.predictedTotal ?? 'Not enough data'}</span>
              <span>Status: {forecast.forecast?.budgetStatus || forecast.message}</span>
            </div>
          )}
          {split && (
            <div className="result-box">
              <strong>{split.recommendedSplit || split.splitType || 'Split suggestion'}</strong>
              {(split.splits || []).map((item, idx) => (
                <span key={idx}>{item.participant}: {item.amount}</span>
              ))}
            </div>
          )}
        </section>

        <section className="advanced-panel">
          <h2><FiActivity /> Health/Fitness Hub</h2>
          <p>Choose a habit, answer Kane's setup questions, then check in daily. Rest days and cheat days are respected.</p>

          {!selectedHabit ? (
            <div className="habit-suggestion-grid">
              {habitSuggestions.map((habit) => (
                <button key={habit.type} type="button" className="habit-suggestion" onClick={() => selectHabit(habit)}>
                  <strong>{habit.title}</strong>
                  <span>{habit.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="habit-builder">
              <div className="habit-builder-head">
                <strong>{selectedHabit.title}</strong>
                <button type="button" onClick={() => setSelectedHabit(null)}>Change</button>
              </div>
              {selectedHabit.questions.map((question) => (
                <label key={question.key} className="habit-question">
                  <span>{question.label}</span>
                  {question.type === 'days' ? (
                    <div className="day-picker">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                        <button
                          key={day}
                          type="button"
                          className={(habitAnswers[question.key] || []).includes(idx) ? 'active' : ''}
                          onClick={() => toggleDay(question.key, idx)}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={question.type}
                      value={habitAnswers[question.key] ?? ''}
                      onChange={(event) => updateHabitAnswer(
                        question.key,
                        question.type === 'number' ? Number(event.target.value) : event.target.value
                      )}
                    />
                  )}
                </label>
              ))}
              <button type="button" onClick={createHabitPlan} disabled={loading === 'habit-create'}>
                {loading === 'habit-create' ? 'Starting...' : 'Start from tomorrow'}
              </button>
            </div>
          )}

          {habitPlans.length > 0 && (
            <div className="habit-plan-list">
              <h3>Your active health plans</h3>
              {habitPlans.map((plan) => (
                <article key={plan._id} className="habit-plan-card">
                  <div>
                    <strong>{plan.title}</strong>
                    <span>{plan.completedDays}/{plan.targetDays} days | streak {plan.currentStreak}</span>
                    <small>{plan.today?.message}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => checkInHabit(plan)}
                    disabled={plan.today?.hasCheckedInToday || plan.status !== 'active' || loading === `habit-${plan._id}`}
                  >
                    Check in
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="advanced-panel">
          <h2><FiHeart /> Mindfulness + Briefing</h2>
          <p>Kane now opens with unread messages, asks before showing news, and logs mood check-ins with a short calming suggestion.</p>
        </section>

        <section className="advanced-panel">
          <h2><FiShield /> AR Story Effects</h2>
          <p>The story camera already includes real-time filters, canvas effects, and AI-generated draggable sticker overlays.</p>
        </section>
      </div>
    </div>
  );
}

export default AdvancedFeaturesPage;
