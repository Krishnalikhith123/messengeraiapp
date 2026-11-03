import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

const requestJson = async (url, { method = 'GET', headers = {}, body, params } = {}) => {
  const requestUrl = new URL(url);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) requestUrl.searchParams.set(key, value);
    });
  }

  const response = await fetch(requestUrl, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.data = data;
    throw error;
  }
  return data;
};

const getGithubHeaders = (token) => ({
  ...(token ? { Authorization: `token ${token}` } : {}),
  Accept: 'application/vnd.github.v3+json'
});

const summarizeGithubItem = (item, type) => {
  const changedFiles = item.changed_files || 0;
  const comments = item.comments || 0;
  const riskScore = Math.min(100, Math.round((changedFiles * 8) + (comments * 2) + ((item.additions || 0) + (item.deletions || 0)) / 30));
  return {
    type,
    id: item.id,
    title: item.title,
    number: item.number,
    state: item.state,
    author: item.user?.login,
    url: item.html_url,
    description: item.body?.substring(0, 240) || '',
    labels: item.labels?.map((label) => label.name) || [],
    reviewers: item.requested_reviewers?.map((reviewer) => reviewer.login) || [],
    additions: item.additions || 0,
    deletions: item.deletions || 0,
    changedFiles,
    riskScore,
    recommendation: riskScore > 70
      ? 'High review attention recommended.'
      : riskScore > 35
        ? 'Moderate review attention recommended.'
        : 'Looks lightweight from available metadata.'
  };
};

// ========================
// GITHUB INTEGRATION
// ========================

// GitHub OAuth callback handler
router.post('/github/authenticate', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id);

    // Exchange code for access token
    // In production, implement full OAuth flow
    const tokenResponse = await requestJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      }
    });

    const accessToken = tokenResponse.access_token;

    // Save to user
    if (!user.integrationConnections) user.integrationConnections = [];
    
    user.integrationConnections = user.integrationConnections.filter(i => i.provider !== 'github');
    user.integrationConnections.push({
      provider: 'github',
      token: accessToken,
      config: { authenticated: true },
      isActive: true
    });

    await user.save();

    res.status(200).json({ message: 'GitHub connected successfully' });
  } catch (error) {
    console.error('GitHub auth error:', error);
    res.status(500).json({ message: 'Failed to authenticate with GitHub' });
  }
});

// Get GitHub repositories
router.get('/github/repos', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');

    if (!ghConnection?.token) {
      return res.status(400).json({ message: 'GitHub not connected' });
    }

    // Fetch repos from GitHub
    const reposData = await requestJson('https://api.github.com/user/repos', {
      headers: {
        Authorization: `token ${ghConnection.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const repos = reposData.map(repo => ({
      id: repo.id,
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      isPrivate: repo.private
    }));

    res.status(200).json({ repos });
  } catch (error) {
    console.error('GitHub repos error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get specific PR details
router.get('/github/pr/:owner/:repo/:number', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');
    const { owner, repo, number } = req.params;

    if (!ghConnection?.token) {
      return res.status(400).json({ message: 'GitHub not connected' });
    }

    const pr = await requestJson(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      {
        headers: {
          Authorization: `token ${ghConnection.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    res.status(200).json({
      id: pr.id,
      title: pr.title,
      number: pr.number,
      state: pr.state,
      author: pr.user.login,
      url: pr.html_url,
      description: pr.body?.substring(0, 200),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      reviewers: pr.requested_reviewers?.map(r => r.login) || [],
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      draft: pr.draft
    });
  } catch (error) {
    console.error('GitHub PR fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch PR details' });
  }
});

// Get issue details
router.get('/github/issue/:owner/:repo/:number', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');
    const { owner, repo, number } = req.params;

    if (!ghConnection?.token) {
      return res.status(400).json({ message: 'GitHub not connected' });
    }

    const issue = await requestJson(
      `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
      {
        headers: {
          Authorization: `token ${ghConnection.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    res.status(200).json({
      id: issue.id,
      title: issue.title,
      number: issue.number,
      state: issue.state,
      author: issue.user.login,
      url: issue.html_url,
      description: issue.body?.substring(0, 200),
      labels: issue.labels?.map(l => l.name) || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      assignees: issue.assignees?.map(a => a.login) || [],
      comments: issue.comments
    });
  } catch (error) {
    console.error('GitHub issue fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch issue details' });
  }
});

// ========================
// JIRA INTEGRATION
// ========================

// JIRA OAuth callback
router.post('/jira/authenticate', auth, async (req, res) => {
  try {
    const { accessToken, cloudId } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.integrationConnections) user.integrationConnections = [];
    
    user.integrationConnections = user.integrationConnections.filter(i => i.provider !== 'jira');
    user.integrationConnections.push({
      provider: 'jira',
      token: accessToken,
      config: { cloudId, authenticated: true },
      isActive: true
    });

    await user.save();

    res.status(200).json({ message: 'JIRA connected successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get JIRA issues assigned to user
router.get('/jira/issues', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const jiraConnection = user.integrationConnections?.find(i => i.provider === 'jira');

    if (!jiraConnection?.token) {
      return res.status(400).json({ message: 'JIRA not connected' });
    }

    const cloudId = jiraConnection.config?.cloudId;
    const jql = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC';

    try {
      const issuesData = await requestJson(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
        {
          params: { jql, maxResults: 10 },
          headers: {
            'Authorization': `Bearer ${jiraConnection.token}`,
            'Accept': 'application/json'
          }
        }
      );

      const issues = issuesData.issues?.map(issue => ({
        id: issue.id,
        key: issue.key,
        title: issue.fields.summary,
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name,
        dueDate: issue.fields.duedate,
        url: issue.self
      })) || [];

      res.status(200).json({ issues });
    } catch (jiraErr) {
      console.error('JIRA API error:', jiraErr.data || jiraErr.message);
      res.status(500).json({ message: 'Failed to fetch JIRA issues' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// COMMON INTEGRATION FEATURES
// ========================

// Disconnect an integration
router.post('/:provider/disconnect', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await User.findById(req.user.id);

    if (!user.integrationConnections) {
      return res.status(400).json({ message: 'No integrations found' });
    }

    user.integrationConnections = user.integrationConnections.filter(i => i.provider !== provider);
    await user.save();

    res.status(200).json({ message: `${provider} disconnected successfully` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get connected integrations
router.get('/list', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('integrationConnections');

    const integrations = user.integrationConnections?.map(i => ({
      provider: i.provider,
      isActive: i.isActive,
      lastSync: i.lastSync
    })) || [];

    res.status(200).json({ integrations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Parse message for project links
router.post('/parse-message', auth, async (req, res) => {
  try {
    const { message } = req.body;
    
    const projectLinks = [];

    // GitHub: Find #PR or #issue or github URLs
    const githubPrMatch = message.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/g);
    const githubIssueMatch = message.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/g);

    if (githubPrMatch) {
      githubPrMatch.forEach(url => {
        const matches = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        projectLinks.push({
          type: 'github_pr',
          owner: matches[1],
          repo: matches[2],
          number: matches[3],
          url: `https://${url}`
        });
      });
    }

    if (githubIssueMatch) {
      githubIssueMatch.forEach(url => {
        const matches = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
        projectLinks.push({
          type: 'github_issue',
          owner: matches[1],
          repo: matches[2],
          number: matches[3],
          url: `https://${url}`
        });
      });
    }

    // JIRA: Find PROJ-123 pattern
    const jiraMatch = message.match(/\b([A-Z][A-Z0-9]*-\d+)\b/g);
    if (jiraMatch) {
      jiraMatch.forEach(key => {
        projectLinks.push({
          type: 'jira_issue',
          key
        });
      });
    }

    res.status(200).json({ projectLinks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/digest', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Message is required' });

    const user = await User.findById(req.user.id);
    const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');
    const parsedLinks = [];

    const githubPrMatches = [...message.matchAll(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/g)];
    const githubIssueMatches = [...message.matchAll(/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/g)];

    for (const match of githubPrMatches) {
      const [, owner, repo, number] = match;
      try {
        const data = await requestJson(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
          headers: getGithubHeaders(ghConnection?.token)
        });
        parsedLinks.push(summarizeGithubItem(data, 'github_pr'));
      } catch {
        parsedLinks.push({ type: 'github_pr', owner, repo, number, recommendation: 'Could not fetch metadata.' });
      }
    }

    for (const match of githubIssueMatches) {
      const [, owner, repo, number] = match;
      try {
        const data = await requestJson(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, {
          headers: getGithubHeaders(ghConnection?.token)
        });
        parsedLinks.push(summarizeGithubItem(data, 'github_issue'));
      } catch {
        parsedLinks.push({ type: 'github_issue', owner, repo, number, recommendation: 'Could not fetch metadata.' });
      }
    }

    const jiraKeys = [...new Set((message.match(/\b([A-Z][A-Z0-9]*-\d+)\b/g) || []))];
    jiraKeys.forEach((key) => parsedLinks.push({
      type: 'jira_issue',
      key,
      recommendation: 'Connect Jira to enrich this key with status and assignee.'
    }));

    res.json({
      count: parsedLinks.length,
      items: parsedLinks,
      summary: parsedLinks.length
        ? `Found ${parsedLinks.length} project reference${parsedLinks.length === 1 ? '' : 's'} for review.`
        : 'No project links found.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/metadata/:type/:owner/:repo/:number', auth, async (req, res) => {
  try {
    const { type, owner, repo, number } = req.params;
    if (!['github_pr', 'github_issue'].includes(type)) {
      return res.status(400).json({ message: 'Unsupported type' });
    }

    const user = await User.findById(req.user.id);
    const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');
    const endpoint = type === 'github_pr' ? 'pulls' : 'issues';
    const data = await requestJson(`https://api.github.com/repos/${owner}/${repo}/${endpoint}/${number}`, {
      headers: getGithubHeaders(ghConnection?.token)
    });

    res.json({ type, metadata: summarizeGithubItem(data, type) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to fetch metadata' });
  }
});

// Fetch metadata for message enrichment
router.get('/metadata/:type/:identifier', auth, async (req, res) => {
  try {
    const { type, identifier } = req.params;
    const user = await User.findById(req.user.id);

    if (type.startsWith('github_')) {
      const ghConnection = user.integrationConnections?.find(i => i.provider === 'github');
      if (!ghConnection?.token) {
        return res.status(400).json({ message: 'GitHub not connected' });
      }

      // Fetch PR or Issue metadata
      // identifier format: owner/repo/number
      const parts = identifier.split('/');
      const endpoint = type === 'github_pr' ? 'pulls' : 'issues';
      
      try {
        const data = await requestJson(
          `https://api.github.com/repos/${parts[0]}/${parts[1]}/${endpoint}/${parts[2]}`,
          {
            headers: {
              Authorization: `token ${ghConnection.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        return res.status(200).json({
          type,
          metadata: {
            title: data.title,
            state: data.state,
            author: data.user.login,
            url: data.html_url,
            createdAt: data.created_at
          }
        });
      } catch (ghErr) {
        return res.status(500).json({ message: 'Failed to fetch from GitHub' });
      }
    }

    res.status(400).json({ message: 'Unsupported type' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
