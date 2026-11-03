const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const question = `Return a strictly formatted JSON array containing exactly 15 items:
1 Motivation Quote (tag: "Motivation")
10 World Hot News headlines with 2-sentence summaries (tag: "World News")
4 Sports News headlines (tag: "Sports")
Format: [{"title": "...", "content": "...", "tag": "..."}]
Do NOT wrap in markdown, return RAW JSON ARRAY.`;

  const prompt = `You are Kane, an advanced, interactive, and futuristic AI Student Tutor.
    The student is asking: "${question}"
    
    Context 1: Collaborative Notepad Notes:
    ""

    Context 2: Uploaded Document Context (if any):
    ""

    You MUST return ONLY a valid JSON object matching this schema:
    {
      "textResponse": "Your detailed explanation, study guide, markdown formatted notes, or code blocks.",
      "quizzes": [
        {
          "question": "A multiple choice question",
          "options": ["Option 0", "Option 1", "Option 2", "Option 3"],
          "correctAnswer": 0,
          "explanation": "Detailed explanation of correct answer"
        }
      ],
      "flashcards": [
        {
          "front": "Term / Concept",
          "back": "Detailed definition or answer"
        }
      ],
      "mindMap": {
        "nodes": [
          {"id": "node1", "label": "Main Topic", "x": 200, "y": 50, "type": "root"},
          {"id": "node2", "label": "Subconcept A", "x": 100, "y": 180, "type": "concept"},
          {"id": "node3", "label": "Subconcept B", "x": 300, "y": 180, "type": "concept"}
        ],
        "edges": [
          {"from": "node1", "to": "node2"},
          {"from": "node1", "to": "node3"}
        ]
      },
      "sandboxResult": {
        "consoleOutput": "Simulated terminal output of running the code if they asked to run code. Otherwise empty.",
        "errors": "Any syntax errors or exceptions detected in their code, otherwise empty.",
        "advice": "Kane's expert debugging or refactoring suggestions if code was run, otherwise empty."
      },
      "kanbanTasks": [
        {
          "id": "task_1",
          "title": "Task description extracted from note/chat context",
          "deadline": "YYYY-MM-DD or Days left",
          "status": "todo"
        }
      ]
    }

    Note on Mind Maps:
    If they click "Generate Mind Map" or ask to visualize concepts, design an elegant, spacious node diagram. Ensure coordinates (x: 50 to 550, y: 50 to 350) represent a readable tree structure. Give nodes descriptive, short titles.
    
    Note on Sandboxes:
    If they submit code to run/debug, act as the JS/Python virtual execution environment. Print exact simulated console logs, warnings, or detailed traces.

    Note on Kanban tasks:
    If they ask to scan tasks, extract clear actionable tasks with due dates.

    Ensure textResponse is clean, highly helpful, and properly formatted with Markdown.
    Return ONLY the raw JSON block without markdown formatting wrapper.`;

    console.log("Sending to Gemini...");
    const result = await aiModel.generateContent(prompt);
    let responseText = result.response.text().trim();
    console.log("----- RAW GEMINI RESPONSE -----");
    console.log(responseText);
    console.log("-------------------------------");
    
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.log("First JSON parse failed");
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          parsed = { textResponse: responseText, quizzes: [], flashcards: [], mindMap: null, sandboxResult: null, kanbanTasks: [] };
        }
      } else {
        parsed = { textResponse: responseText, quizzes: [], flashcards: [], mindMap: null, sandboxResult: null, kanbanTasks: [] };
      }
    }

    console.log("----- BACKEND PARSED OBJECT -----");
    console.log(JSON.stringify(parsed, null, 2));
    
    // Simulate frontend extraction
    let backendContent = JSON.stringify(parsed);
    let textResponse = '';
      
    try {
      const parsedContent = JSON.parse(backendContent);
      textResponse = parsedContent.textResponse || backendContent;
    } catch (e) {
      textResponse = backendContent;
    }

    let raw = textResponse;
    // 1️⃣ Extract a JSON array from the response text
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      raw = arrayMatch[0];
    }
    
    console.log("----- FRONTEND RAW ARRAY STRING -----");
    console.log(raw);
    
    try {
      let finalParsed = JSON.parse(raw);
      console.log("SUCCESS! Extracted items count:", finalParsed.length);
    } catch (e) {
      console.error("FRONTEND JSON PARSE FAILED:", e.message);
    }
}

test();
