import React, { useState, useEffect, useRef } from 'react';
import './WorkspaceTutor.css';

const WorkspaceTutor = ({ chat, onClose }) => {
  const [notebookText, setNotebookText] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Tab navigation: 'chat' | 'flashcards' | 'quiz' | 'mindmap' | 'sandbox' | 'kanban'
  const [activeTab, setActiveTab] = useState('chat');

  // Flashcards state
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quizzes state
  const [quizzes, setQuizzes] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { quizIndex: optionIndex }
  const [quizScores, setQuizScores] = useState({}); // { quizIndex: true/false }

  // Chat tutoring history state
  const [tutorMessages, setTutorMessages] = useState([]);
  const chatBottomRef = useRef(null);

  // Pomodoro states
  const [pomodoroSeconds, setPomodoroSeconds] = useState(1500); // 25 mins
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState('focus'); // 'focus' | 'break'
  const [lofiActive, setLofiActive] = useState(false);

  // Document Vault state
  const [uploadedDocName, setUploadedDocName] = useState('');
  const [uploadedDocText, setUploadedDocText] = useState('');

  // Mind map state
  const [mindMapData, setMindMapData] = useState(null);
  const [draggingNodeId, setDraggingNodeId] = useState(null);

  // Code Sandbox state
  const [sandboxCode, setSandboxCode] = useState('// Write JavaScript / Python code snippet here...\nfunction calculateFactorial(n) {\n  if (n <= 1) return 1;\n  return n * calculateFactorial(n - 1);\n}\nconsole.log(calculateFactorial(5));');
  const [sandboxLanguage, setSandboxLanguage] = useState('javascript');
  const [sandboxResult, setSandboxResult] = useState(null);
  const [isRunningCode, setIsRunningCode] = useState(false);

  // Kanban task state
  const [tasks, setTasks] = useState([
    { id: '1', title: 'Prepare Math syllabus notes', deadline: 'In 2 days', status: 'todo' },
    { id: '2', title: 'Review study flashcards with Kane', deadline: 'Tomorrow', status: 'in_progress' }
  ]);

  // Load saved notepad for this group chat from LocalStorage
  useEffect(() => {
    if (chat?._id) {
      const savedText = localStorage.getItem(`workspace_note_${chat._id}`);
      if (savedText) {
        setNotebookText(savedText);
      } else {
        setNotebookText('// Collaborative Workspace Notebook\n// Type your study notes, formulas, or homework topics here!\n\n');
      }
    }
  }, [chat?._id]);

  // Handle notebook typing auto-save
  const handleNotebookChange = (e) => {
    const val = e.target.value;
    setNotebookText(val);
    if (chat?._id) {
      localStorage.setItem(`workspace_note_${chat._id}`, val);
    }
  };

  // Scroll tutor chat to bottom when message arrives
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutorMessages]);

  // Pomodoro Interval Timer Hook
  useEffect(() => {
    let timer = null;
    if (pomodoroActive && pomodoroSeconds > 0) {
      timer = setInterval(() => {
        setPomodoroSeconds(prev => prev - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0) {
      if (pomodoroMode === 'focus') {
        setPomodoroMode('break');
        setPomodoroSeconds(300); // 5 mins break
        alert('🎉 Focus Pomodoro session complete! Kane recommends taking a 5-minute break.');
      } else {
        setPomodoroMode('focus');
        setPomodoroSeconds(1500); // 25 mins focus
        alert('💪 Break session complete! Time to focus again.');
      }
      setPomodoroActive(false);
    }
    return () => clearInterval(timer);
  }, [pomodoroActive, pomodoroSeconds, pomodoroMode]);

  // Document upload file reader parser
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedDocName(file.name);
      setUploadedDocText(event.target.result);
      setTutorMessages(prev => [...prev, {
        sender: 'system',
        text: `📄 Document Vault: Loaded file "${file.name}" (${file.size} bytes). Kane study context is refreshed.`
      }]);
      setActiveTab('chat');
    };
    reader.readAsText(file);
  };

  // Clear Uploaded File Context
  const clearUploadedDoc = () => {
    setUploadedDocName('');
    setUploadedDocText('');
  };

  // Ask AI Tutor Endpoint Submit
  const handleAskTutor = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    setIsSubmitting(true);
    const userMsg = { sender: 'student', text: questionText };
    setTutorMessages(prev => [...prev, userMsg]);
    const activeQuestion = questionText;
    setQuestionText('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/messages/workspace/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: chat._id,
          question: activeQuestion,
          notepadContent: notebookText,
          docContext: uploadedDocText
        })
      });

      if (!response.ok) {
        throw new Error('Failed to ask tutor');
      }

      const messageObj = await response.json();
      const parsedData = JSON.parse(messageObj.content);

      const botMsg = {
        sender: 'kane',
        text: parsedData.textResponse
      };

      setTutorMessages(prev => [...prev, botMsg]);

      if (parsedData.flashcards && parsedData.flashcards.length > 0) {
        setFlashcards(parsedData.flashcards);
        setCurrentCardIndex(0);
        setIsFlipped(false);
      }

      if (parsedData.quizzes && parsedData.quizzes.length > 0) {
        setQuizzes(parsedData.quizzes);
        setSelectedAnswers({});
        setQuizScores({});
      }

      if (parsedData.mindMap) {
        setMindMapData(parsedData.mindMap);
      }

      if (parsedData.kanbanTasks && parsedData.kanbanTasks.length > 0) {
        setTasks(parsedData.kanbanTasks);
      }

    } catch (err) {
      console.error('Tutor ask error:', err);
      setTutorMessages(prev => [...prev, { sender: 'system', text: '⚠️ Connection lost. Kane is rebooting study modules.' }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Code Execution Run Handler
  const handleRunCodeSandbox = async () => {
    setIsRunningCode(true);
    setSandboxResult(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/messages/workspace/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: chat._id,
          question: `Act as the virtual code executor. Evaluate the following snippet in ${sandboxLanguage} and simulated run. Return console log logs:
Code:
${sandboxCode}`,
          notepadContent: notebookText,
          docContext: uploadedDocText
        })
      });

      if (!response.ok) throw new Error('Sandbox failed');
      const messageObj = await response.json();
      const parsedData = JSON.parse(messageObj.content);

      if (parsedData.sandboxResult) {
        setSandboxResult(parsedData.sandboxResult);
      } else {
        setSandboxResult({
          consoleOutput: parsedData.textResponse || 'Sandbox executed with zero warnings.',
          errors: '',
          advice: 'Execution successful.'
        });
      }
    } catch (err) {
      console.error(err);
      setSandboxResult({
        consoleOutput: '',
        errors: '⚠️ Sandbox Execution Error: Offline.',
        advice: 'Verify network connection or ask Kane directly.'
      });
    } finally {
      setIsRunningCode(false);
    }
  };

  // Trigger Kane to Extract mind map nodes from notes
  const handleGenerateMindMap = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/messages/workspace/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: chat._id,
          question: 'Generate an SVG Mind Map visualization configuration with 4-5 concept nodes structured dynamically.',
          notepadContent: notebookText,
          docContext: uploadedDocText
        })
      });

      if (!response.ok) throw new Error('Mindmap failed');
      const messageObj = await response.json();
      const parsedData = JSON.parse(messageObj.content);

      if (parsedData.mindMap) {
        setMindMapData(parsedData.mindMap);
        setActiveTab('mindmap');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Kane to Scan Tasks
  const handleAutoExtractTasks = async () => {
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/messages/workspace/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chatId: chat._id,
          question: 'Extract task checklist with deadlines from my collaborative note document.',
          notepadContent: notebookText,
          docContext: uploadedDocText
        })
      });

      if (!response.ok) throw new Error('Task extraction failed');
      const messageObj = await response.json();
      const parsedData = JSON.parse(messageObj.content);

      if (parsedData.kanbanTasks && parsedData.kanbanTasks.length > 0) {
        setTasks(parsedData.kanbanTasks);
        setActiveTab('kanban');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move tasks along status columns
  const handleMoveTaskStatus = (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  // Draggable node mouse handlers
  const handleNodeMouseDown = (e, nodeId) => {
    e.preventDefault();
    setDraggingNodeId(nodeId);
  };

  const handleNodeMouseMove = (e) => {
    if (!draggingNodeId || !mindMapData) return;
    const container = e.currentTarget.getBoundingClientRect();
    const newX = e.clientX - container.left;
    const newY = e.clientY - container.top;

    setMindMapData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        nodes: prev.nodes.map(n => 
          n.id === draggingNodeId
            ? { ...n, x: Math.max(15, Math.min(newX - 50, container.width - 120)), y: Math.max(15, Math.min(newY - 20, container.height - 50)) }
            : n
        )
      };
    });
  };

  const handleNodeMouseUp = () => {
    setDraggingNodeId(null);
  };

  const drawBezierEdge = (nodeA, nodeB) => {
    if (!nodeA || !nodeB) return '';
    const x1 = nodeA.x + 60; // Node center offsets
    const y1 = nodeA.y + 20;
    const x2 = nodeB.x + 60;
    const y2 = nodeB.y + 20;
    const dx = Math.abs(x2 - x1) * 0.4;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const handleSelectOption = (quizIdx, optIdx, correctOptIdx) => {
    if (selectedAnswers[quizIdx] !== undefined) return;
    
    setSelectedAnswers(prev => ({ ...prev, [quizIdx]: optIdx }));
    setQuizScores(prev => ({ ...prev, [quizIdx]: optIdx === correctOptIdx }));
  };

  const handleNextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
    }, 150);
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCardIndex(prev => (prev - 1 + flashcards.length) % flashcards.length);
    }, 150);
  };

  const formatTimerVal = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  return (
    <div className="workspace-panel glass-panel">
      {/* Top Header Row with Title & Pomodoro timer & Lofi Lounge toggle */}
      <div className="workspace-header">
        <div className="workspace-title">
          <span className="workspace-icon">📚</span>
          <div>
            <h3>Interactive Student Workspace</h3>
            <p>Collaborative Note Hub & AI Tutor Kane</p>
          </div>
        </div>

        {/* Dynamic Pomodoro widget & YouTube Playlist lo-fi lounges */}
        <div className="pomodoro-header-widget" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className={`pomodoro-badge-timer ${pomodoroActive ? 'ticking' : ''}`}>
            <span>⏱️ {pomodoroMode === 'focus' ? 'Focus' : 'Break'} Session</span>
            <strong style={{ color: '#a855f7', marginLeft: '5px' }}>{formatTimerVal(pomodoroSeconds)}</strong>
            <button 
              className="pomo-control-btn"
              onClick={() => setPomodoroActive(!pomodoroActive)}
              style={{ marginLeft: '10px' }}
            >
              {pomodoroActive ? '⏸️' : '▶️'}
            </button>
            <button 
              className="pomo-control-btn"
              onClick={() => { setPomodoroActive(false); setPomodoroSeconds(1500); setPomodoroMode('focus'); }}
            >
              🔄
            </button>
          </div>

          <button 
            className={`lofi-lounge-btn ${lofiActive ? 'playing' : ''}`}
            onClick={() => setLofiActive(!lofiActive)}
          >
            🎵 Lo-Fi Chill Lounge
          </button>
        </div>

        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      {/* Embedded IFrame Lo-Fi chill beats when lounge toggle is active */}
      {lofiActive && (
        <div className="lofi-player-frame-box" style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: '11px', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="soundwave-bar animate-bounce">⚡</span> Ambient Chill Lo-fi Study Streams (Mute if needed via youtube)
          </span>
          <iframe 
            width="280" 
            height="80" 
            src="https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&mute=0" 
            title="Lofi Lounge" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            style={{ borderRadius: '6px' }}
          />
        </div>
      )}

      <div className="workspace-body">
        {/* Left Side: Note Editor */}
        <div className="notepad-section">
          <div className="notepad-header">
            <span>📝 Collaborative Notepad</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className="save-badge">Auto-Saved</span>
            </div>
          </div>
          <textarea
            className="notepad-textarea"
            value={notebookText}
            onChange={handleNotebookChange}
            placeholder="Type formulas, code snippets, or notes here. Kane will scan this notebook to formulate custom flashcards and quizzes when you ask questions!"
          />
        </div>

        {/* Right Side: AI Tutor Chat & Upgraded Interactive Tabs */}
        <div className="tutor-section">
          <div className="tutor-chat-container">
            {/* Action tabs to shift widget views */}
            <div className="workspace-tabs-strip">
              <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>🤖 AI Tutor</button>
              <button className={activeTab === 'flashcards' ? 'active' : ''} onClick={() => setActiveTab('flashcards')}>🎴 Flashcards ({flashcards.length})</button>
              <button className={activeTab === 'quiz' ? 'active' : ''} onClick={() => setActiveTab('quiz')}>🧠 Quizzes ({quizzes.length})</button>
              <button className={activeTab === 'mindmap' ? 'active' : ''} onClick={() => setActiveTab('mindmap')}>🧠 Mind Map</button>
              <button className={activeTab === 'sandbox' ? 'active' : ''} onClick={() => setActiveTab('sandbox')}>💻 Code Sandbox</button>
              <button className={activeTab === 'kanban' ? 'active' : ''} onClick={() => setActiveTab('kanban')}>📋 Kanban Tasks</button>
            </div>

            {/* TAB CONTENT: Chat Window & Doc Upload */}
            {activeTab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div className="tutor-messages-box">
                  {tutorMessages.length === 0 && (
                    <div className="tutor-welcome">
                      <div className="welcome-avatar">🤖</div>
                      <h4>Welcome to Workspace Mode!</h4>
                      <p>I'm Kane, your AI study coach. Ask me to explain concepts, execute code in the sandbox, construct interactive mind maps, or organize Kanban boards!</p>
                      
                      {/* Document Vault Drag & Drop Drop-zone */}
                      <div className="vault-file-drag-zone" style={{ marginTop: '20px', padding: '15px', border: '1px dashed #3b82f6', borderRadius: '10px', background: 'rgba(59,130,246,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '24px' }}>📄</span>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                          {uploadedDocName ? `Loaded: ${uploadedDocName}` : 'Upload code, notes or syllabus files'}
                        </p>
                        {!uploadedDocName ? (
                          <>
                            <input 
                              type="file" 
                              id="vault-file-input" 
                              accept=".txt,.js,.py,.html,.css,.md,.json" 
                              onChange={handleFileUpload} 
                              style={{ display: 'none' }} 
                            />
                            <label htmlFor="vault-file-input" style={{ background: '#3b82f6', color: '#fff', padding: '4px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                              Choose Text File
                            </label>
                          </>
                        ) : (
                          <button onClick={clearUploadedDoc} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
                            Clear Document Context
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {tutorMessages.map((msg, index) => (
                    <div key={index} className={`tutor-msg-bubble ${msg.sender}`}>
                      {msg.sender === 'kane' ? (
                        <div className="kane-matte-black-box">
                          <div className="matte-header">🤖 Kane Study Coach</div>
                          <div className="matte-body">{msg.text}</div>
                        </div>
                      ) : msg.sender === 'system' ? (
                        <div className="workspace-system-notice" style={{ width: '100%', textAlign: 'center', fontSize: '11px', color: '#a855f7', background: 'rgba(168,85,247,0.1)', padding: '6px 12px', borderRadius: '6px', margin: '4px 0' }}>
                          {msg.text}
                        </div>
                      ) : (
                        <div className="student-bubble">{msg.text}</div>
                      )}
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>

                <form className="tutor-input-form" onSubmit={handleAskTutor}>
                  <input
                    type="text"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder={uploadedDocName ? `Ask Kane about: ${uploadedDocName}...` : "Ask Kane: 'Explain binary search' or 'Quiz me'..."}
                    disabled={isSubmitting}
                  />
                  <button type="submit" disabled={isSubmitting || !questionText.trim()}>
                    {isSubmitting ? '...' : 'Ask'}
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: 3D Flashcards */}
            {activeTab === 'flashcards' && (
              <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {flashcards.length > 0 ? (
                  <div className="widget-card flashcards-widget" style={{ width: '100%' }}>
                    <div className="widget-header">
                      <span>🎴 Study Flashcards ({currentCardIndex + 1}/{flashcards.length})</span>
                      <div className="card-nav-btns">
                        <button onClick={handlePrevCard}>&larr;</button>
                        <button onClick={handleNextCard}>&rarr;</button>
                      </div>
                    </div>
                    
                    <div 
                      className={`flashcard-3d ${isFlipped ? 'flipped' : ''}`}
                      onClick={() => setIsFlipped(!isFlipped)}
                      style={{ height: '220px' }}
                    >
                      <div className="flashcard-inner">
                        <div className="flashcard-front" style={{ padding: '30px' }}>
                          <div className="card-side-label">QUESTION</div>
                          <div className="card-content-text" style={{ fontSize: '17px' }}>{flashcards[currentCardIndex]?.front}</div>
                          <div className="card-action-hint">Click Card to Flip</div>
                        </div>
                        <div className="flashcard-back" style={{ padding: '30px' }}>
                          <div className="card-side-label">EXPLANATION</div>
                          <div className="card-content-text" style={{ fontSize: '15px' }}>{flashcards[currentCardIndex]?.back}</div>
                          <div className="card-action-hint">Click to Flip Back</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-tab-view" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <span>🎴</span>
                    <p style={{ margin: '10px 0 0 0', fontSize: '13px' }}>No flashcards generated yet.</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px' }}>Ask Kane: "Generate 5 flashcards based on my notes."</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Quiz Master MCQs */}
            {activeTab === 'quiz' && (
              <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                {quizzes.length > 0 ? (
                  <div className="widget-card quizzes-widget" style={{ width: '100%' }}>
                    <div className="widget-header">
                      <span>🧠 AI Quiz Master</span>
                      <span className="quiz-count">{quizzes.length} Questions</span>
                    </div>
                    
                    <div className="quiz-list">
                      {quizzes.map((quiz, quizIdx) => (
                        <div key={quizIdx} className="quiz-item" style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="quiz-question" style={{ fontSize: '15px' }}>Q{quizIdx + 1}: {quiz.question}</p>
                          
                          <div className="quiz-options-list" style={{ margin: '12px 0' }}>
                            {quiz.options.map((opt, optIdx) => {
                              const isSelected = selectedAnswers[quizIdx] === optIdx;
                              const isCorrect = optIdx === quiz.correctAnswer;
                              const hasAnswered = selectedAnswers[quizIdx] !== undefined;

                              let optionClass = '';
                              if (isSelected) {
                                optionClass = isCorrect ? 'correct-glow' : 'incorrect-glow';
                              } else if (hasAnswered && isCorrect) {
                                optionClass = 'correct-glow';
                              }

                              return (
                                <button
                                  key={optIdx}
                                  className={`quiz-option-btn ${optionClass}`}
                                  onClick={() => handleSelectOption(quizIdx, optIdx, quiz.correctAnswer)}
                                  disabled={hasAnswered}
                                  style={{ padding: '12px', fontSize: '13.5px', marginBottom: '8px' }}
                                >
                                  <span className="option-letter">{['A', 'B', 'C', 'D'][optIdx]}.</span> {opt}
                                </button>
                              );
                            })}
                          </div>

                          {selectedAnswers[quizIdx] !== undefined && (
                            <div className={`quiz-explanation-box ${quizScores[quizIdx] ? 'success' : 'failed'}`} style={{ marginBottom: '15px' }}>
                              <strong>{quizScores[quizIdx] ? '🎉 Correct!' : '❌ Incorrect.'}</strong>
                              <p style={{ margin: '4px 0 0 0' }}>{quiz.explanation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="empty-tab-view" style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <span>🧠</span>
                    <p style={{ margin: '10px 0 0 0', fontSize: '13px' }}>No quizzes generated yet.</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '11px' }}>Ask Kane: "Create an MCQ quiz based on my notepad."</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Interactive SVG AI Mind Maps */}
            {activeTab === 'mindmap' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#c084fc' }}>🧠 Draggable AI Mind Map Concept Graph</span>
                  <button 
                    onClick={handleGenerateMindMap}
                    disabled={isSubmitting}
                    style={{ background: '#a855f7', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {isSubmitting ? 'Generating...' : '✨ Generate Map from Notes'}
                  </button>
                </div>

                <div 
                  className="mindmap-draw-canvas"
                  onMouseMove={handleNodeMouseMove}
                  onMouseUp={handleNodeMouseUp}
                  onMouseLeave={handleNodeMouseUp}
                  style={{ flex: 1, position: 'relative', background: 'rgba(5,8,18,0.4)', overflow: 'hidden', cursor: draggingNodeId ? 'grabbing' : 'default' }}
                >
                  {mindMapData ? (
                    <>
                      {/* Curved Edge Connections */}
                      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        {mindMapData.edges?.map((edge, idx) => {
                          const nodeA = mindMapData.nodes.find(n => n.id === edge.from);
                          const nodeB = mindMapData.nodes.find(n => n.to === edge.to || n.id === edge.to);
                          return (
                            <path 
                              key={idx}
                              d={drawBezierEdge(nodeA, nodeB)} 
                              fill="none" 
                              stroke="rgba(168, 85, 247, 0.35)" 
                              strokeWidth="2.5"
                              strokeDasharray="4,4"
                            />
                          );
                        })}
                      </svg>

                      {/* Interactive Drag nodes */}
                      {mindMapData.nodes?.map(node => (
                        <div
                          key={node.id}
                          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                          style={{
                            position: 'absolute',
                            left: `${node.x}px`,
                            top: `${node.y}px`,
                            padding: '8px 16px',
                            background: node.type === 'root' ? 'linear-gradient(135deg, #a855f7, #3b82f6)' : 'rgba(15, 23, 42, 0.85)',
                            border: `1px solid ${node.type === 'root' ? '#c084fc' : 'rgba(255,255,255,0.1)'}`,
                            color: '#fff',
                            borderRadius: '8px',
                            cursor: 'grab',
                            userSelect: 'none',
                            fontSize: '12px',
                            fontWeight: '600',
                            textAlign: 'center',
                            minWidth: '100px',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                            zIndex: 10
                          }}
                        >
                          {node.label}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', top: '40%', position: 'relative', color: '#94a3b8' }}>
                      <span style={{ fontSize: '28px' }}>🧠</span>
                      <p style={{ margin: '10px 0 0 0', fontSize: '13px' }}>No mind map active yet.</p>
                      <button 
                        onClick={handleGenerateMindMap}
                        style={{ marginTop: '12px', background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Create Concept Map Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: Interactive AI Code Sandbox */}
            {activeTab === 'sandbox' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <select 
                    value={sandboxLanguage} 
                    onChange={(e) => setSandboxLanguage(e.target.value)}
                    style={{ background: 'rgba(15,23,42,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px' }}
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="html">HTML / CSS</option>
                  </select>

                  <button 
                    onClick={handleRunCodeSandbox}
                    disabled={isRunningCode}
                    style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {isRunningCode ? 'Running...' : '▶️ Run Sandbox'}
                  </button>
                </div>

                {/* Simulated Code Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea
                    value={sandboxCode}
                    onChange={(e) => setSandboxCode(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(9,15,30,0.85)',
                      color: '#4ade80',
                      fontFamily: 'Fira Code, monospace',
                      padding: '15px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      outline: 'none',
                      resize: 'none',
                      fontSize: '13px',
                      lineHeight: '1.5'
                    }}
                  />

                  {/* Hacker-style execution console output */}
                  <div style={{ height: '140px', background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '12px', overflowY: 'auto', fontFamily: 'monospace' }}>
                    <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🖥️ AI Console Output</span>
                    {isRunningCode ? (
                      <p style={{ margin: '5px 0 0 0', color: '#a855f7', fontSize: '12px' }} className="animate-pulse">> Compiling sandbox runtime...</p>
                    ) : sandboxResult ? (
                      <div style={{ marginTop: '5px', fontSize: '12px' }}>
                        {sandboxResult.consoleOutput && (
                          <pre style={{ margin: 0, color: '#38bdf8', whiteSpace: 'pre-wrap' }}>{sandboxResult.consoleOutput}</pre>
                        )}
                        {sandboxResult.errors && (
                          <pre style={{ margin: 0, color: '#ef4444', whiteSpace: 'pre-wrap' }}>{sandboxResult.errors}</pre>
                        )}
                        {sandboxResult.advice && (
                          <p style={{ margin: '8px 0 0 0', color: '#c084fc', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                            <strong>💡 Kane Advice:</strong> {sandboxResult.advice}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ margin: '5px 0 0 0', color: '#475569', fontSize: '12px' }}>Click "Run Sandbox" to execute compiler.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Collaborative Kanban Board */}
            {activeTab === 'kanban' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#38bdf8' }}>📋 Assignment & Study Kanban Tracker</span>
                  <button 
                    onClick={handleAutoExtractTasks}
                    disabled={isSubmitting}
                    style={{ background: '#38bdf8', color: '#000', border: 'none', padding: '4px 12px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {isSubmitting ? 'Scanning...' : '✨ Scan Tasks via AI'}
                  </button>
                </div>

                {/* 3 Kanban glass columns */}
                <div className="kanban-columns-container" style={{ flex: 1, display: 'flex', gap: '10px', padding: '15px', overflowY: 'auto' }}>
                  {['todo', 'in_progress', 'done'].map(status => {
                    const statusTasks = tasks.filter(t => t.status === status);
                    return (
                      <div 
                        key={status} 
                        style={{
                          flex: 1,
                          background: 'rgba(15,23,42,0.3)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.05)',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: status === 'todo' ? '#ef4444' : status === 'in_progress' ? '#eab308' : '#22c55e', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '6px' }}>
                          {status === 'todo' ? '🔴 To Do' : status === 'in_progress' ? '🟡 In Progress' : '🟢 Done'} ({statusTasks.length})
                        </span>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                          {statusTasks.map(task => (
                            <div 
                              key={task.id} 
                              style={{
                                background: 'rgba(15,23,42,0.7)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}
                            >
                              <span style={{ fontSize: '12.5px', color: '#f1f5f9', fontWeight: '600' }}>{task.title}</span>
                              <span style={{ fontSize: '10px', color: '#c084fc' }}>⏳ {task.deadline}</span>
                              
                              {/* Quick Move Buttons */}
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px' }}>
                                {status !== 'todo' && (
                                  <button onClick={() => handleMoveTaskStatus(task.id, 'todo')} style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>Todo</button>
                                )}
                                {status !== 'in_progress' && (
                                  <button onClick={() => handleMoveTaskStatus(task.id, 'in_progress')} style={{ background: 'rgba(234,179,8,0.1)', color: '#fef08a', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>Work</button>
                                )}
                                {status !== 'done' && (
                                  <button onClick={() => handleMoveTaskStatus(task.id, 'done')} style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer' }}>Done</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceTutor;
