import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

let genAI;
const getAiModel = () => {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI?.getGenerativeModel({ model: 'gemini-2.5-flash' });
};

// ========================
// RECEIPT UPLOAD & OCR
// ========================

router.post('/upload-receipt', auth, async (req, res) => {
  try {
    const { receiptImage, manualData } = req.body;
    const model = getAiModel();
    const user = await User.findById(req.user.id);

    if (!user.expenses) user.expenses = [];

    // If manual data provided, use it
    if (manualData) {
      user.expenses.push({
        date: new Date(),
        category: manualData.category,
        amount: manualData.amount,
        description: manualData.description,
        tags: manualData.tags || [],
        currency: manualData.currency || 'USD'
      });

      await user.save();

      return res.status(200).json({
        message: 'Expense logged successfully',
        expense: user.expenses[user.expenses.length - 1]
      });
    }

    // If receipt image provided, use OCR + AI
    if (receiptImage && model) {
      // In production, use Gemini Vision API
      const prompt = `Extract expense information from this receipt image:
- Total amount
- Category (food, transport, entertainment, utilities, healthcare, shopping, other)
- Store/Vendor name
- Items purchased (if visible)
- Date (if visible)

Respond with ONLY a valid JSON object (no markdown):
{
  "amount": 25.50,
  "category": "food",
  "vendor": "Restaurant Name",
  "items": ["item1", "item2"],
  "date": "2024-05-21",
  "currency": "USD"
}`;

      try {
        const result = await model.generateContent(prompt);
        let textOut = result.response.text().trim();
        textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let extracted;
        try {
          extracted = JSON.parse(textOut);
        } catch (parseErr) {
          const match = textOut.match(/\{[\s\S]*\}/);
          extracted = JSON.parse(match[0]);
        }

        user.expenses.push({
          date: extracted.date ? new Date(extracted.date) : new Date(),
          category: extracted.category,
          amount: extracted.amount,
          description: extracted.vendor,
          receiptUrl: receiptImage,
          tags: extracted.items || [],
          currency: extracted.currency || 'USD'
        });

        await user.save();

        return res.status(200).json({
          message: 'Receipt processed successfully',
          extracted,
          expense: user.expenses[user.expenses.length - 1]
        });
      } catch (ocrErr) {
        console.error('OCR error:', ocrErr);
        return res.status(500).json({ message: 'Failed to process receipt image' });
      }
    }

    res.status(400).json({ message: 'Receipt image or manual data required' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// EXPENSE FORECASTING
// ========================

router.get('/forecast/:month', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { month } = req.params; // YYYY-MM format

    if (!user.expenses || user.expenses.length === 0) {
      return res.status(200).json({
        forecast: null,
        message: 'Not enough data for forecasting. Log some expenses first.'
      });
    }

    // Calculate spending by category for last 3 months
    const today = new Date();
    const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    const recentExpenses = user.expenses.filter(e => 
      new Date(e.date) >= threeMonthsAgo
    );

    const categorySpending = {};
    recentExpenses.forEach(e => {
      const cat = e.category || 'other';
      if (!categorySpending[cat]) categorySpending[cat] = [];
      categorySpending[cat].push(e.amount);
    });

    // Calculate averages
    const categoryAverages = {};
    let totalAvg = 0;

    for (const [category, amounts] of Object.entries(categorySpending)) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      categoryAverages[category] = {
        average: parseFloat(avg.toFixed(2)),
        trend: amounts[amounts.length - 1] > avg ? 'increasing' : 'stable'
      };
      totalAvg += avg;
    }

    // Generate forecast with AI
    const model = getAiModel();
    let aiSavingsTips = [];

    if (model) {
      const prompt = `Based on these expense patterns (last 3 months), suggest 3 specific cost-saving tips:

Category averages: ${JSON.stringify(categoryAverages)}

Respond with ONLY a valid JSON array:
[
  { "category": "category_name", "tip": "specific actionable tip", "potentialSavings": "$XX" }
]`;

      try {
        const result = await model.generateContent(prompt);
        let textOut = result.response.text().trim();
        textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
          aiSavingsTips = JSON.parse(textOut);
        } catch (parseErr) {
          const match = textOut.match(/\[[\s\S]*\]/);
          if (match) aiSavingsTips = JSON.parse(match[0]);
        }
      } catch (aiErr) {
        console.warn('AI tips error:', aiErr.message);
      }
    }

    res.status(200).json({
      month,
      forecast: {
        predictedTotal: parseFloat(totalAvg.toFixed(2)),
        byCategory: categoryAverages,
        comparisonToPrevious: ((totalAvg - (recentExpenses.slice(-30).reduce((a, b) => a + b.amount, 0) / 30)) / (recentExpenses.slice(-30).reduce((a, b) => a + b.amount, 0) / 30) * 100).toFixed(1) + '%',
        savingsTips: aiSavingsTips,
        budgetStatus: user.expenseSettings?.budgetPerMonth 
          ? totalAvg > user.expenseSettings.budgetPerMonth 
            ? 'EXCEEDING' 
            : 'ON_TRACK'
          : 'NOT_SET'
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// SMART SPLIT SUGGESTION
// ========================

router.post('/split-suggest', auth, async (req, res) => {
  try {
    const { amount, participants, items } = req.body;
    const model = getAiModel();

    if (!model) {
      // Fallback: equal split
      const perPerson = (amount / participants.length).toFixed(2);
      return res.status(200).json({
        splitType: 'equal',
        splits: participants.map(p => ({
          participant: p,
          amount: parseFloat(perPerson)
        }))
      });
    }

    // Use AI to suggest smart split
    const prompt = `Suggest the best way to split a bill of $${amount} among these people: ${participants.join(', ')}

${items ? `Items ordered:\n${items.map(i => `- ${i.name}: $${i.price}`).join('\n')}` : ''}

Consider:
1. Equal split (most fair)
2. Itemized split (if items provided)
3. Custom based on typical consumption patterns

Respond with ONLY a valid JSON object (no markdown):
{
  "recommendedSplit": "equal|itemized|custom",
  "reason": "explanation",
  "splits": [
    { "participant": "name", "amount": 25.50 }
  ],
  "note": "any special notes"
}`;

    try {
      const result = await model.generateContent(prompt);
      let textOut = result.response.text().trim();
      textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

      let suggestion;
      try {
        suggestion = JSON.parse(textOut);
      } catch (parseErr) {
        const match = textOut.match(/\{[\s\S]*\}/);
        suggestion = JSON.parse(match[0]);
      }

      res.status(200).json(suggestion);
    } catch (aiErr) {
      console.error('Split suggestion error:', aiErr);
      // Fallback to equal split
      const perPerson = (amount / participants.length).toFixed(2);
      return res.status(200).json({
        recommendedSplit: 'equal',
        splits: participants.map(p => ({
          participant: p,
          amount: parseFloat(perPerson)
        }))
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// ANALYTICS & REPORTS
// ========================

router.get('/analytics/:period', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('expenses expenseSettings wellness');
    const { period } = req.params; // 'week', 'month', 'year'

    if (!user.expenses || user.expenses.length === 0) {
      return res.status(200).json({
        message: 'No expense data available',
        analytics: null
      });
    }

    let days = 30;
    if (period === 'week') days = 7;
    if (period === 'year') days = 365;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const periodExpenses = user.expenses.filter(e => new Date(e.date) >= cutoffDate);

    // Aggregate by category
    const byCategory = {};
    periodExpenses.forEach(e => {
      const cat = e.category || 'other';
      byCategory[cat] = (byCategory[cat] || 0) + e.amount;
    });

    // Calculate totals
    const totalSpent = periodExpenses.reduce((a, b) => a + b.amount, 0);
    const avgPerDay = (totalSpent / days).toFixed(2);
    const highestCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

    // Daily spending trend
    const dailyTrend = {};
    periodExpenses.forEach(e => {
      const dateStr = new Date(e.date).toISOString().split('T')[0];
      dailyTrend[dateStr] = (dailyTrend[dateStr] || 0) + e.amount;
    });

    res.status(200).json({
      period,
      summary: {
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        avgPerDay: parseFloat(avgPerDay),
        transactionCount: periodExpenses.length,
        highestCategory: {
          name: highestCategory[0],
          amount: highestCategory[1]
        }
      },
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([cat, amount]) => [
          cat,
          {
            amount: parseFloat(amount.toFixed(2)),
            percentage: parseFloat(((amount / totalSpent) * 100).toFixed(1))
          }
        ])
      ),
      dailyTrend,
      budgetStatus: user.expenseSettings?.budgetPerMonth 
        ? {
            limit: user.expenseSettings.budgetPerMonth,
            spent: parseFloat(totalSpent.toFixed(2)),
            remaining: parseFloat((user.expenseSettings.budgetPerMonth - totalSpent).toFixed(2)),
            percentage: parseFloat(((totalSpent / user.expenseSettings.budgetPerMonth) * 100).toFixed(1))
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get recurring expense summary
router.get('/recurring', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('expenseSettings');

    const recurring = user.expenseSettings?.recurringExpenses || [];

    const upcomingDues = recurring.map(r => {
      const nextDue = new Date(r.nextDueDate);
      const daysUntil = Math.ceil((nextDue - new Date()) / (1000 * 60 * 60 * 24));

      return {
        ...r,
        daysUntil,
        isOverdue: daysUntil < 0,
        monthlyTotal: r.frequency === 'monthly' ? r.amount : 
                      r.frequency === 'weekly' ? r.amount * 4.33 :
                      r.frequency === 'daily' ? r.amount * 30 : 0
      };
    });

    const totalMonthly = upcomingDues.reduce((a, b) => a + b.monthlyTotal, 0);

    res.status(200).json({
      recurring: upcomingDues,
      totalMonthlyRecurring: parseFloat(totalMonthly.toFixed(2))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Set budget and preferences
router.put('/settings', auth, async (req, res) => {
  try {
    const { budgetPerMonth, budgetCurrency, trackingEnabled, recurringExpenses } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.expenseSettings) user.expenseSettings = {};

    if (budgetPerMonth !== undefined) user.expenseSettings.budgetPerMonth = budgetPerMonth;
    if (budgetCurrency !== undefined) user.expenseSettings.budgetCurrency = budgetCurrency;
    if (trackingEnabled !== undefined) user.expenseSettings.trackingEnabled = trackingEnabled;
    if (recurringExpenses !== undefined) user.expenseSettings.recurringExpenses = recurringExpenses;

    await user.save();

    res.status(200).json({
      message: 'Expense settings updated',
      settings: user.expenseSettings
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
