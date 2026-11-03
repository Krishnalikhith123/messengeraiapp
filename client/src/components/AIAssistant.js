import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMessageSquare, FiX, FiSend, FiCpu, FiMic } from 'react-icons/fi';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useSocketStore } from '../store/socketStore';
import { useAuthStore } from '../store/authStore';
import '../styles/AIAssistant.css';

const AIAssistant = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [isGreeting, setIsGreeting] = useState(true);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isListeningForVoice, setIsListeningForVoice] = useState(false);
    const [isListeningForWakeWord, setIsListeningForWakeWord] = useState(false);
    const [isProcessingCommand, setIsProcessingCommand] = useState(false);
    const [kaneActive, setKaneActive] = useState(false);  // Always-on Kane toggle
    const kaneActiveRef = useRef(false);  // Ref for use inside callbacks
    const wakeRecognitionRef = useRef(null); // Ref to abort recognition manually
    const commandRecognitionRef = useRef(null); // Ref to abort command recognition
    const chatEndRef = useRef(null);
    
    // News Option State
    const [newsFeed, setNewsFeed] = useState([]);
    const [isNewsPopupOpen, setIsNewsPopupOpen] = useState(false);
    
    // Voice Queue State
    const { socket } = useSocketStore();
    const { user } = useAuthStore();
    const messageQueueRef = useRef([]);
    const isProcessingRef = useRef(false);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // --- Voice Assistant Queue Logic ---
    // 1. Fetch unread offline messages on mount/login
    useEffect(() => {
        if (!user) return;

        const fetchUnreadOfflineMessages = async () => {
            try {
                const response = await axios.get('/api/messages/unread/all');
                const unreadMsgs = response.data;
                
                if (unreadMsgs.length > 0) {
                    console.log(`🎤 Found ${unreadMsgs.length} offline unread messages!`);
                    let hasNew = false;
                    
                    unreadMsgs.forEach(msg => {
                        const senderName = msg.senderId.username;
                        const content = msg.content;
                        const messageId = msg._id;
                        
                        const existingSenderIndex = messageQueueRef.current.findIndex(q => q.senderName === senderName);
                        if (existingSenderIndex >= 0) {
                            // Deduplicate messages!
                            if (!messageQueueRef.current[existingSenderIndex].messageIds.includes(messageId)) {
                                messageQueueRef.current[existingSenderIndex].messages.push(content);
                                messageQueueRef.current[existingSenderIndex].messageIds.push(messageId);
                                hasNew = true;
                            }
                        } else {
                            messageQueueRef.current.push({ senderName, messages: [content], messageIds: [messageId] });
                            hasNew = true;
                        }
                    });

                    if (hasNew && !isProcessingRef.current && isMountedRef.current) {
                        console.log('🎤 Starting queue processing for offline messages');
                        setTimeout(() => {
                            if (isMountedRef.current && !isProcessingRef.current) processQueue();
                        }, 2000); 
                    }
                }
            } catch (error) {
                console.error('🎤 Error fetching unread messages:', error);
            }
        };

        fetchUnreadOfflineMessages();
    }, [user]);

    // 2. Listen for real-time messages
    useEffect(() => {
        if (!socket || !user) return;

        const handleReceiveMessage = (data) => {
            console.log('🎤 AI Assistant received message:', data);
            
            if (data.senderId._id === user.id) {
                console.log('🎤 Ignoring message from self');
                return;
            }
            if (data.messageType !== 'text') {
                console.log('🎤 Ignoring non-text message');
                return;
            }

            const senderName = data.senderId.username;
            const content = data.content;
            const messageId = data._id; // Realtime messages have _id
            console.log(`🎤 Queuing message from ${senderName}: ${content}`);

            // Add to queue
            const existingSenderIndex = messageQueueRef.current.findIndex(q => q.senderName === senderName);
            if (existingSenderIndex >= 0) {
                // Deduplicate realtime messages too, just in case
                if (!messageQueueRef.current[existingSenderIndex].messageIds.includes(messageId)) {
                    messageQueueRef.current[existingSenderIndex].messages.push(content);
                    messageQueueRef.current[existingSenderIndex].messageIds.push(messageId);
                }
            } else {
                messageQueueRef.current.push({ senderName, messages: [content], messageIds: [messageId] });
            }

            if (!isProcessingRef.current && isMountedRef.current) {
                console.log('🎤 Starting queue processing');
                processQueue();
            } else {
                console.log('🎤 Queue is already processing');
            }
        };

        socket.on('receive-message', handleReceiveMessage);

        return () => {
            socket.off('receive-message', handleReceiveMessage);
        };
    }, [socket, user]);

    // 3. Listen for proactive event reminders
    useEffect(() => {
        if (!socket) return;

        const handleEventReminder = (event) => {
            console.log('🎤 Event reminder received:', event);
            const speakMsg = `Hey boss, don't forget that you have ${event.title} at ${event.time}. You just have one hour left.`;
            
            // Proactively speak out loud!
            speakText(speakMsg);

            // Trigger a high-visibility toast alert!
            toast.error(`⏰ Reminder: ${event.title} is starting at ${event.time}! (1 hour left)`, {
                duration: 10000,
                icon: '⏰'
            });
        };

        const handleMessageReminder = (data) => {
            toast(`⏰ ${data.note}`, { duration: 8000, icon: '🔔' });
            speakText(`Reminder: ${data.note}. ${data.snippet || ''}`);
        };

        const handleKaneVoiceAlert = ({ text }) => {
            if (text) speakText(text);
        };

        socket.on('event-reminder', handleEventReminder);
        socket.on('message-reminder', handleMessageReminder);
        socket.on('kane-voice-alert', handleKaneVoiceAlert);

        return () => {
            socket.off('event-reminder', handleEventReminder);
            socket.off('message-reminder', handleMessageReminder);
            socket.off('kane-voice-alert', handleKaneVoiceAlert);
        };
    }, [socket]);

    // Handle unmount to cancel speech
    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            console.log('🎤 Component unmounted, canceling speech');
            window.speechSynthesis.cancel();
        };
    }, []);

    const speakText = (text) => {
        return new Promise((resolve) => {
            console.log("🎤 Speaking:", text);
            // Always ensure previous speech is canceled before starting new one to avoid overlapping
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            
            window.utterances = window.utterances || [];
            window.utterances.push(utterance);

            let isResolved = false;
            const cleanup = () => {
                if (isResolved) return;
                isResolved = true;
                const idx = window.utterances.indexOf(utterance);
                if (idx > -1) window.utterances.splice(idx, 1);
                resolve();
            };

            utterance.onend = cleanup;
            utterance.onerror = (e) => {
                console.error("🎤 Speech synthesis error:", e);
                cleanup();
            };
            
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }

            window.speechSynthesis.speak(utterance);
            setTimeout(cleanup, Math.max(3000, text.length * 80)); 
        });
    };

    const listenForResponse = () => {
        return new Promise((resolve) => {
            console.log("🎤 Starting Speech Recognition...");

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.error("🎤 Speech Recognition not supported in this browser");
                resolve('error');
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            let hasResponded = false;
            
            const timeoutId = setTimeout(() => {
                if (!hasResponded) {
                    console.log("🎤 Speech recognition timed out automatically.");
                    recognition.abort();
                    resolve('timeout');
                }
            }, 10000); // 10 seconds timeout for better reliability

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.toLowerCase();
                console.log("🎤 User said:", transcript);
                hasResponded = true;
                clearTimeout(timeoutId);
                
                let answer = 'unknown';
                if (['yes', 'yeah', 'read', 'sure', 'please', 'ok', 'okay', 'yep'].some(w => transcript.includes(w))) {
                    answer = 'yes';
                } else if (['no', 'nope', 'stop', 'dont', 'nah'].some(w => transcript.includes(w))) {
                    answer = 'no';
                }
                
                recognition.abort(); // FORCE MIC TO CLOSE
                resolve(answer);
            };

            recognition.onerror = (e) => {
                console.error("🎤 Speech recognition error:", e.error);
                if (e.error === 'no-speech') {
                    // Let it run until timeout or onend triggers
                    return;
                }
                hasResponded = true;
                clearTimeout(timeoutId);
                resolve('error');
            };

            recognition.onend = () => {
                clearTimeout(timeoutId);
                if (!hasResponded) {
                    resolve('timeout');
                }
            };

            try {
                recognition.start();
            } catch (e) {
                console.error("🎤 Failed to start recognition:", e);
                resolve('error');
            }
        });
    };

    // --- COMMAND & WAKE WORD FLOW ---
    const listenForCommand = () => {
        return new Promise((resolve) => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return resolve(null);
            
            const recognition = new SpeechRecognition();
            commandRecognitionRef.current = recognition;
            recognition.continuous = true; 
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            let hasResponded = false;
            let currentTranscript = '';
            let silenceTimer = null;
            
            const finish = (finalText) => {
                if (hasResponded) return;
                hasResponded = true;
                clearTimeout(timeoutId);
                clearTimeout(silenceTimer);
                recognition.abort();
                commandRecognitionRef.current = null;
                resolve(finalText);
            };

            const timeoutId = setTimeout(() => {
                finish(currentTranscript || null);
            }, 15000); // 15 seconds max

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) final += event.results[i][0].transcript;
                    else interim += event.results[i][0].transcript;
                }
                
                currentTranscript = final || interim || currentTranscript;
                
                // If we heard something, wait 2.5 seconds of silence before finalizing
                clearTimeout(silenceTimer);
                if (currentTranscript.trim().length > 0) {
                    silenceTimer = setTimeout(() => {
                        finish(currentTranscript);
                    }, 2500);
                }
            };

            recognition.onerror = (e) => {
                console.error("🎤 Command recognition error:", e.error);
                if (e.error === 'no-speech' || e.error === 'audio-capture') {
                    // Do not fail immediately on no-speech or capture errors
                    return;
                }
                finish(null);
            };

            recognition.onend = () => {
                finish(currentTranscript || null);
            };

            try { recognition.start(); } catch (e) { finish(null); }
        });
    };

    const normalizeHealthType = (value = '') => {
        const text = value.toLowerCase().replace(/\s+/g, '_');
        const map = {
            gym_streak: 'gym',
            gym: 'gym',
            workout: 'gym',
            workouts: 'gym',
            walking_steps: 'walking',
            walk: 'walking',
            walking: 'walking',
            steps: 'walking',
            drink_water: 'water',
            drinking_water: 'water',
            water: 'water',
            healthy_food: 'healthy_food',
            food: 'healthy_food',
            diet: 'healthy_food',
            medication: 'medication',
            medicine: 'medication',
            medications: 'medication',
            meditation: 'meditation',
            sleep: 'sleep',
            stretching: 'stretching',
            running: 'running',
            cycling: 'cycling',
            yoga: 'yoga',
            screen_break: 'screen_break',
            screen_breaks: 'screen_break',
            protein: 'protein',
            skincare: 'skincare',
            skin_care: 'skincare',
            journaling: 'journaling',
            journal: 'journaling'
        };
        return map[text] || text;
    };

    const parseDayNames = (spoken = '') => {
        const lower = spoken.toLowerCase();
        const dayMap = [
            ['sunday', 0],
            ['monday', 1],
            ['tuesday', 2],
            ['wednesday', 3],
            ['thursday', 4],
            ['friday', 5],
            ['saturday', 6]
        ];
        return dayMap.filter(([name]) => lower.includes(name)).map(([, value]) => value);
    };

    const askHealthQuestion = async (question) => {
        await speakText(question.label);
        while (window.speechSynthesis && window.speechSynthesis.speaking) {
            await new Promise(r => setTimeout(r, 100));
        }
        const answer = await listenForCommand();
        if (!answer) return question.defaultValue;
        if (question.type === 'number') {
            const number = Number((answer.match(/\d+/) || [question.defaultValue])[0]);
            return Number.isFinite(number) ? number : question.defaultValue;
        }
        if (question.type === 'days') {
            return parseDayNames(answer);
        }
        return answer;
    };

    const handleStartHealthHabitVoice = async (intent) => {
        const habitType = normalizeHealthType(intent.habitType);
        const suggestionsRes = await axios.get('/api/health/habit-suggestions');
        const suggestions = suggestionsRes.data.suggestions || [];
        const habit = suggestions.find((item) => item.type === habitType);
        if (!habit) {
            await speakText("I can start gym, walking, water, healthy food, medication, meditation, sleep, stretching, running, cycling, yoga, screen break, protein, skincare, or journaling streaks. Which one do you want?");
            const answer = await listenForCommand();
            const chosenType = normalizeHealthType(answer || '');
            const chosenHabit = suggestions.find((item) => item.type === chosenType);
            if (!chosenHabit) {
                await speakText("Sorry boss, I could not identify that health habit.");
                return;
            }
            return handleStartHealthHabitVoice({ ...intent, habitType: chosenHabit.type });
        }

        const details = intent.details || {};
        const answers = {};
        await speakText(`Okay boss, let's set up your ${habit.title}. I will ask a few quick questions.`);

        for (const question of habit.questions) {
            if (details[question.key] !== undefined) {
                answers[question.key] = details[question.key];
            } else {
                answers[question.key] = await askHealthQuestion(question);
            }
        }

        const res = await axios.post('/api/health/habit-plans', {
            type: habit.type,
            title: habit.title,
            answers
        });
        toast.success(res.data.message || `${habit.title} started`);
        await speakText(res.data.message || `${habit.title} will start tomorrow.`);
        navigate('/advanced');
    };

    const handleHealthHabitCheckInVoice = async (intent) => {
        const habitType = normalizeHealthType(intent.habitType);
        const plansRes = await axios.get('/api/health/habit-plans');
        const plans = plansRes.data.plans || [];
        const matchingPlans = plans.filter((plan) => (
            plan.status === 'active' &&
            (plan.type === habitType || plan.title?.toLowerCase().includes(habitType.replace('_', ' ')))
        ));

        let plan = matchingPlans[0];
        if (!plan) {
            await speakText("I could not find an active plan for that habit. Do you want me to open the health hub?");
            navigate('/advanced');
            return;
        }

        const res = await axios.post(`/api/health/habit-plans/${plan._id}/check-in`, {
            value: intent.value || 'done',
            note: intent.note || 'Voice check-in'
        });
        toast.success(res.data.message);
        await speakText(res.data.message);
    };

    const handleDailyActivitySummaryVoice = async () => {
        const res = await axios.get('/api/analytics/today');
        const habits = res.data.habitCheckIns || [];
        const habitText = habits.length
            ? ` Your health check-ins today are: ${habits.map((h) => `${h.title}, streak ${h.streak}`).join('; ')}.`
            : ' You have not checked in on any health habits yet today.';
        await speakText(`${res.data.summary}${habitText}`);
    };

    const handleSnapScoreVoice = async () => {
        if (!user?.id) {
            await speakText("I could not find your profile right now.");
            return;
        }
        const res = await axios.get(`/api/snaps/score/${user.id}`);
        const friendScores = Object.values(res.data.friendScores || {});
        const bestFriendScore = friendScores.reduce((best, item) => Math.max(best, item?.score || 0), 0);
        await speakText(`Your snap score is ${res.data.snapScore || 0}. Your best friendship snap score is ${bestFriendScore}.`);
    };

    const handleRelationshipAnalyticsVoice = async (intent) => {
        const res = await axios.get('/api/analytics/relationships');
        let relationships = res.data.relationships || [];
        if (intent.friendName) {
            const needle = intent.friendName.toLowerCase();
            relationships = relationships.filter((item) => item.friendName?.toLowerCase().includes(needle));
        }
        if (relationships.length === 0) {
            await speakText(intent.friendName ? `I could not find relationship analytics for ${intent.friendName}.` : 'I do not have enough relationship data yet.');
            return;
        }
        const top = relationships.slice(0, intent.friendName ? 1 : 3);
        const text = top.map((item) => (
            `${item.friendName}: chemistry index ${item.chemistryIndex}, ${item.totalMessages} total messages, and snap streak ${item.snapStreak}`
        )).join('. ');
        await speakText(intent.friendName ? text : `Your top relationship summaries are: ${text}.`);
    };

    const handleGamingLeaderboardVoice = async () => {
        if (!user?.id) {
            await speakText("I could not find your profile right now.");
            return;
        }
        const [tournamentRes, leaderboardRes] = await Promise.all([
            axios.get('/api/games/tournament'),
            axios.get('/api/games/leaderboard')
        ]);
        const tournament = tournamentRes.data;
        const weeklyBoard = tournament.leaderboard || [];
        const allBoard = leaderboardRes.data || [];
        const weeklyRank = weeklyBoard.findIndex((item) => item._id === user.id) + 1;
        const overallRank = allBoard.findIndex((item) => item._id === user.id) + 1;
        const first = weeklyBoard[0]?.username || allBoard[0]?.username || 'no one yet';
        await speakText(`This week's first place is ${first}. You have ${tournament.myPoints || 0} tournament points. Your weekly rank is ${weeklyRank || 'not ranked yet'}, and your overall game leaderboard rank is ${overallRank || 'not ranked yet'}.`);
    };

    const handleCommandFlow = async () => {
        if (!isMountedRef.current) return;
        
        // Stop wake word listener if running to avoid mic conflicts
        if (wakeRecognitionRef.current) {
            console.log("🎤 Aborting wake word recognition before starting command flow");
            try {
                wakeRecognitionRef.current.abort();
            } catch(e) {
                console.error("🎤 Error aborting wake word:", e);
            }
            wakeRecognitionRef.current = null;
        }

        setIsListeningForVoice(false);
        setIsListeningForWakeWord(false);
        
        await speakText("Hi boss, what can I do for you?");
        if (!isMountedRef.current) return;

        // Wait until speech synthesis is completely finished speaking
        while (window.speechSynthesis && window.speechSynthesis.speaking) {
            await new Promise(r => setTimeout(r, 100));
        }

        // Prevent Chrome echo cancellation bug by delaying mic activation
        await new Promise(r => setTimeout(r, 600));

        toast("I'm listening... Speak your command.", { icon: '🎤', id: 'ai-listening', duration: 15000 });
        setIsListeningForVoice(true);
        const command = await listenForCommand();
        setIsListeningForVoice(false);
        toast.dismiss('ai-listening');

        if (!command) {
            await speakText("I didn't catch a command. Going back to sleep.");
            listenForWakeWord(); // Start wake word listener again
            return;
        }

        console.log("🎤 Command heard:", command);
        setIsProcessingCommand(true);
        toast.loading("Gemini is extracting intent...", { id: 'ai-intent' });
        
        // Give audio feedback that it's processing
        await speakText("Got it, one moment...");

        try {
            const response = await axios.post('/api/messages/ai/extract-intent', { transcript: command }, { timeout: 15000 }); // 15s timeout
            const intent = response.data;
            console.log("🎤 Extracted Intent:", intent);
            
            if (intent.action === 'reply' && intent.recipientName && intent.content) {
                toast.success(`Intent parsed: Reply to ${intent.recipientName}`, { id: 'ai-intent' });
                // Fetch chats to find the recipient
                const chatsRes = await axios.get('/api/chats');
                const chats = chatsRes.data;
                
                let targetChat = null;
                let targetUser = null;
                
                for (const chat of chats) {
                    if (chat.isGroupChat) continue;
                    const otherUser = chat.participants.find(p => p._id !== user.id);
                    if (otherUser && otherUser.username.toLowerCase().includes(intent.recipientName.toLowerCase())) {
                        targetChat = chat;
                        targetUser = otherUser;
                        break;
                    }
                }
                
                if (targetChat && targetUser) {
                    const msgRes = await axios.post('/api/messages', {
                        chatId: targetChat._id,
                        recipientId: targetUser._id,
                        content: intent.content,
                        messageType: 'text'
                    });
                    
                    if (socket) {
                        socket.emit('send-message', {
                            ...msgRes.data,
                            recipientId: targetUser._id
                        });
                    }
                    
                    toast.success(`Message sent to ${targetUser.username}`, { id: 'ai-intent' });
                    await speakText(`Message sent to ${targetUser.username}.`);
                } else {
                    toast.error(`Contact not found: ${intent.recipientName}`, { id: 'ai-intent' });
                    await speakText(`I couldn't find a contact named ${intent.recipientName}.`);
                }
            } 
            else if (intent.action === 'create_group' && intent.groupName && intent.participantNames) {
                toast.success(`Intent parsed: Create Group ${intent.groupName}`, { id: 'ai-intent' });
                const usersRes = await axios.get('/api/users/all/list'); // Get all users or contacts
                const allUsers = usersRes.data;
                
                let matchedIds = [];
                let matchedNames = [];
                
                intent.participantNames.forEach(name => {
                    const match = allUsers.find(u => u.username.toLowerCase().includes(name.toLowerCase()));
                    if (match && match._id !== user.id) {
                        matchedIds.push(match._id);
                        matchedNames.push(match.username);
                    }
                });
                
                if (matchedIds.length > 0) {
                    const groupRes = await axios.post('/api/chats/group', {
                        groupName: intent.groupName,
                        participantIds: matchedIds
                    });
                    toast.success(`Group ${intent.groupName} created!`, { id: 'ai-intent' });
                    await speakText(`I have created the group ${intent.groupName} with ${matchedNames.join(' and ')}.`);
                } else {
                    toast.error(`Could not match any participants.`, { id: 'ai-intent' });
                    await speakText(`I couldn't find any of those contacts to add to the group.`);
                }
            }
            else if (intent.action === 'check_stories') {
                toast.success(`Analyzing Stories...`, { id: 'ai-intent' });
                try {
                    const response = await axios.get('/api/stories/analyze');
                    const summary = response.data.summary;
                    await speakText(summary);
                } catch (err) {
                    console.error('Failed to analyze stories:', err);
                    await speakText("I had trouble checking the stories right now. Please try again.");
                }
            }
            else if (intent.action === 'update_story') {
                if (!intent.content) {
                    await speakText("What would you like your story to say?");
                    return;
                }
                toast.success(`Posting story: "${intent.content}"`, { id: 'ai-intent' });
                try {
                    await axios.post('/api/stories', {
                        content: intent.content,
                        mediaType: 'text'
                    });
                    await speakText(`Successfully posted your story saying: ${intent.content}`);
                } catch (err) {
                    console.error('Failed to post story:', err);
                    await speakText("I encountered an error trying to update your story.");
                }
            }
            else if (intent.action === 'catch_me_up') {
                toast.success(`Intent parsed: Catch me up`, { id: 'ai-intent' });
                const unreadRes = await axios.get('/api/messages/unread/all');
                const unreadMsgs = unreadRes.data;
                
                if (unreadMsgs.length === 0) {
                    await speakText("You don't have any unread messages. You are all caught up!");
                } else {
                    await speakText(`You have ${unreadMsgs.length} unread messages. Let me summarize them for you.`);
                    const sumRes = await axios.post('/api/messages/ai/summarize', { messages: unreadMsgs });
                    await speakText(sumRes.data.summary);
                }
            }
            else if (intent.action === 'activate_ghost_mode') {
                toast.success(`Activating Ghost Mode...`, { id: 'ai-intent' });
                
                await speakText("Sure thing, boss. What is the reason you are turning on ghost mode?");
                
                while (window.speechSynthesis && window.speechSynthesis.speaking) {
                    await new Promise(r => setTimeout(r, 100));
                }
                await new Promise(r => setTimeout(r, 600));

                toast("Listening for reason...", { icon: '🎤', id: 'ai-ghost-reason', duration: 15000 });
                const reasonResponse = await listenForCommand();
                toast.dismiss('ai-ghost-reason');
                
                const finalReason = reasonResponse && reasonResponse.trim() ? reasonResponse : "offline for a bit";
                console.log("🎤 Ghost Mode Reason capture:", finalReason);

                await speakText("Understood. And when will you be back online? Exact time or duration.");
                
                while (window.speechSynthesis && window.speechSynthesis.speaking) {
                    await new Promise(r => setTimeout(r, 100));
                }
                await new Promise(r => setTimeout(r, 600));

                toast("Listening for return time...", { icon: '🎤', id: 'ai-ghost-time', duration: 15000 });
                const timeResponse = await listenForCommand();
                toast.dismiss('ai-ghost-time');

                const finalTime = timeResponse && timeResponse.trim() ? timeResponse : "later";
                console.log("🎤 Ghost Mode Return Time capture:", finalTime);

                try {
                    await axios.post('/api/users/ghost-mode', {
                        active: true,
                        reason: finalReason,
                        returnTime: finalTime
                    });
                    
                    toast.success("Ghost Mode activated!", { id: 'ai-intent' });
                    await speakText(`Excellent, boss. Ghost mode is active. I will tell your friends you are: ${finalReason}, and will be back at: ${finalTime}.`);
                } catch (err) {
                    console.error('Failed to activate ghost mode via AI:', err);
                    await speakText("Sorry, I had trouble enabling ghost mode on the server.");
                }
            }
            else if (intent.action === 'add_contact') {
                let contactName = intent.contactName;
                
                if (!contactName) {
                    await speakText("Sure, who would you like me to add as a contact?");
                    while (window.speechSynthesis && window.speechSynthesis.speaking) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                    await new Promise(r => setTimeout(r, 600));

                    toast("Listening for contact name...", { icon: '🎤', id: 'ai-contact-name', duration: 15000 });
                    const nameResponse = await listenForCommand();
                    toast.dismiss('ai-contact-name');
                    
                    if (nameResponse && nameResponse.trim()) {
                        contactName = nameResponse.trim();
                    }
                }

                if (!contactName) {
                    await speakText("I didn't catch the contact name. Going back to sleep.");
                    return;
                }

                toast.loading(`Searching for "${contactName}"...`, { id: 'ai-contact-search' });

                try {
                    const searchRes = await axios.get(`/api/users/search/${encodeURIComponent(contactName)}`);
                    const foundUsers = searchRes.data;

                    if (!foundUsers || foundUsers.length === 0) {
                        toast.error(`No user found matching "${contactName}"`, { id: 'ai-contact-search' });
                        await speakText(`I couldn't find any users named ${contactName} in the system.`);
                    } else {
                        const targetUser = foundUsers[0];
                        
                        await axios.post('/api/users/contacts/add', { contactId: targetUser._id });
                        
                        toast.success(`Successfully added ${targetUser.username}!`, { id: 'ai-contact-search' });
                        await speakText(`Successfully added ${targetUser.username} to your contacts list!`);
                    }
                } catch (err) {
                    console.error('Failed to add contact via AI:', err);
                    toast.error("Failed to add contact", { id: 'ai-contact-search' });
                    await speakText("Sorry, I had trouble adding that contact on the server.");
                }
            }
            else if (intent.action === 'news') {
                toast.success("Fetching 10 hot global news headlines...", { id: 'ai-intent' });
                try {
                    const res = await axios.get('/api/messages/daily-feed');
                    let feedItems = res.data.feed || [];
                    let worldNews = feedItems.filter(item => item.tag === 'World News');
                    if (worldNews.length === 0) {
                        worldNews = feedItems.slice(0, 10);
                    } else {
                        worldNews = worldNews.slice(0, 10);
                    }
                    
                    setNewsFeed(worldNews);
                    setIsNewsPopupOpen(true);
                    
                    await speakText("Here are the 10 hot global news headlines happening around the world. Would you like me to read the news details for you?");
                    
                    while (window.speechSynthesis && window.speechSynthesis.speaking) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                    await new Promise(r => setTimeout(r, 600));
                    
                    toast("Listening for yes or no...", { icon: '🎤', id: 'ai-news-read-prompt', duration: 10000 });
                    const answer = await listenForResponse();
                    toast.dismiss('ai-news-read-prompt');
                    
                    if (answer === 'yes') {
                        await speakText("Understood. I will read each news headline and detail for you now.");
                        for (let i = 0; i < worldNews.length; i++) {
                            const item = worldNews[i];
                            await speakText(`Headline ${i + 1}: ${item.title}. Details: ${item.content}`);
                            await new Promise(r => setTimeout(r, 800));
                        }
                        await speakText("That is all the news for today, boss.");
                    } else {
                        await speakText("Understood, shutting off the news reader.");
                        setIsNewsPopupOpen(false);
                    }
                } catch (err) {
                    console.error('Failed to get global news feed:', err);
                    await speakText("Sorry boss, I was unable to fetch the global hot news right now.");
                }
            }
            else if (intent.action === 'set_message_reminder') {
                toast.success('Setting message reminder...', { id: 'ai-intent' });
                const pending = window.__chatflowPendingReminder || {};
                try {
                    const parseRes = await axios.post('/api/companion/parse-reminder', {
                        transcript: command,
                        messageSnippet: pending.snippet || ''
                    });
                    await axios.post('/api/reminders', {
                        messageId: pending.messageId || null,
                        chatId: pending.chatId || null,
                        note: parseRes.data.note || intent.note || 'Message reminder',
                        remindAt: parseRes.data.remindAt,
                        createdViaVoice: true
                    });
                    const when = new Date(parseRes.data.remindAt).toLocaleString();
                    await speakText(`Got it! I'll remind you ${parseRes.data.note || ''} at ${when}.`);
                    toast.success(`Reminder set for ${when}`, { id: 'ai-intent' });
                } catch (err) {
                    console.error(err);
                    await speakText('Sorry, I could not set that reminder.');
                }
            }
            else if (intent.action === 'open_music') {
                toast.success('Opening Music Hub', { id: 'ai-intent' });
                if (intent.songQuery) {
                    navigate(`/music?q=${encodeURIComponent(intent.songQuery)}`);
                } else {
                    navigate('/music');
                }
                await speakText(intent.songQuery ? `Searching music for ${intent.songQuery}` : 'Opening your music hub now.');
            }
            else if (intent.action === 'start_health_habit') {
                toast.success('Starting health habit setup...', { id: 'ai-intent' });
                await handleStartHealthHabitVoice(intent);
            }
            else if (intent.action === 'health_habit_checkin') {
                toast.success('Updating health streak...', { id: 'ai-intent' });
                await handleHealthHabitCheckInVoice(intent);
            }
            else if (intent.action === 'daily_activity_summary') {
                toast.success("Preparing today's recap...", { id: 'ai-intent' });
                await handleDailyActivitySummaryVoice();
            }
            else if (intent.action === 'snap_score') {
                toast.success('Checking snap score...', { id: 'ai-intent' });
                await handleSnapScoreVoice();
            }
            else if (intent.action === 'relationship_analytics') {
                toast.success('Checking relationship analytics...', { id: 'ai-intent' });
                await handleRelationshipAnalyticsVoice(intent);
            }
            else if (intent.action === 'gaming_leaderboard') {
                toast.success('Checking gaming leaderboard...', { id: 'ai-intent' });
                await handleGamingLeaderboardVoice();
            }
            else {
                console.warn("🎤 AI Intent Action Unknown:", intent);
                toast.error(`I'm not sure what you mean by "${command}"`, { id: 'ai-intent' });
                await speakText(`I heard you say: ${command}. But I'm not sure how to help with that yet. Try saying: start gym streak, I went to gym today, tell me the news, create a group, or catch me up.`);
            }
        } catch (error) {
            console.error("🎤 AI Intent Error:", error);
            const errorMessage = error.response?.data?.message || "I had trouble processing that.";
            toast.error(errorMessage, { id: 'ai-intent' });
            await speakText("Sorry, I encountered an error while trying to process your command.");
        } finally {
            if (isMountedRef.current) setIsProcessingCommand(false);
            // After handling command, go back to passive listening
            setTimeout(() => {
                if (isMountedRef.current && messageQueueRef.current.length === 0) {
                    listenForWakeWord();
                }
            }, 2000);
        }
    };

    const listenForWakeWord = () => {
        if (!isMountedRef.current) return;
        setIsListeningForWakeWord(true);
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsListeningForWakeWord(false);
            return;
        }

        const recognition = new SpeechRecognition();
        wakeRecognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true; // To catch it fast
        recognition.lang = 'en-US';

        let timeoutId;
        let isStopped = false;

        const stopListening = () => {
            isStopped = true;
            recognition.abort();
            wakeRecognitionRef.current = null;
            setIsListeningForWakeWord(false);
            clearTimeout(timeoutId);
        };

        timeoutId = setTimeout(() => {
            // Only timeout if NOT in permanent Kane mode
            if (!kaneActiveRef.current) {
                console.log("🎤 Wake word listener timed out (30s).");
                stopListening();
            } else {
                console.log("🎤 Permanent Kane mode: Refreshing listener...");
                // In permanent mode, we just let it keep going or restart onend
            }
        }, 30000); // 30 seconds

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                finalTranscript += event.results[i][0].transcript.toLowerCase();
            }
            
            console.log("🎤 Wake word heard:", finalTranscript);
            const wakeWords = ['kane', 'cane', 'came', 'ken', 'can ', 'hey'];
            
            if (wakeWords.some(w => finalTranscript.includes(w))) {
                console.log("🎤 WAKE WORD DETECTED!");
                stopListening();
                handleCommandFlow();
            }
        };

        recognition.onerror = (e) => {
            console.error("🎤 Wake word error:", e.error);
            // Don't completely stop on 'no-speech' since it's passive
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
                stopListening();
            }
        };

        recognition.onend = () => {
            // If it ends but we haven't stopped it intentionally, restart it
            if (!isStopped && isMountedRef.current) {
                try { recognition.start(); } catch (e) { 
                    console.log("🎤 Retrying wake word listener...");
                    setTimeout(() => {
                        if (!isStopped && isMountedRef.current) {
                            try { recognition.start(); } catch(err) { stopListening(); }
                        }
                    }, 1000);
                }
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error("🎤 Failed to start wake word on init:", e);
            // If mic is locked, retry after 1 second
            setTimeout(() => {
                if (!isStopped && isMountedRef.current) {
                    try { recognition.start(); } catch(err) { stopListening(); }
                }
            }, 1000);
        }
    };
    // --------------------------------

    const processQueue = async (isRecursive = false) => {
        if (!isMountedRef.current) return;
        
        // Prevent concurrent queue processing loops
        if (isProcessingRef.current && !isRecursive) {
            console.log("🎤 processQueue aborted: Already processing");
            return;
        }
        
        console.log("🎤 processQueue called. Queue length:", messageQueueRef.current.length);
        if (messageQueueRef.current.length === 0) {
            isProcessingRef.current = false;
            if (isMountedRef.current) setIsListeningForVoice(false);
            console.log("🎤 Queue is empty. Stopping processing. Activating wake word listener.");
            
            // Activate wake word listener for 30 seconds
            if (isMountedRef.current) {
                setTimeout(() => {
                    if (isMountedRef.current) listenForWakeWord();
                }, 500); // small delay before listening
            }
            return;
        }

        isProcessingRef.current = true;
        const currentBatch = messageQueueRef.current[0];
        
        const senders = messageQueueRef.current.map(q => q.senderName);
        const uniqueSenders = [...new Set(senders)];
        
        let promptText = '';
        if (uniqueSenders.length > 1) {
            const names = uniqueSenders.slice(0, -1).join(', ') + ' and ' + uniqueSenders[uniqueSenders.length - 1];
            promptText = `You have new messages from ${names}. Would you like me to read the messages from ${currentBatch.senderName}?`;
        } else {
            const msgCount = currentBatch.messages.length;
            promptText = `You have ${msgCount} new message${msgCount > 1 ? 's' : ''} from ${currentBatch.senderName}. Would you like me to read ${msgCount > 1 ? 'them' : 'it'}?`;
        }

        await speakText(promptText);
        if (!isMountedRef.current) return;

        setIsListeningForVoice(true);
        const response = await listenForResponse();
        if (!isMountedRef.current) return;
        setIsListeningForVoice(false);
        
        console.log("🎤 Response to read prompt:", response);

        if (response === 'yes') {
            let msgText = `${currentBatch.senderName} says: `;
            if (currentBatch.messages.length > 1) {
                 msgText += currentBatch.messages.join('. Then they say: ');
            } else {
                 msgText += currentBatch.messages[0];
            }
            await speakText(msgText);
        } else if (response === 'no') {
            await speakText("Okay, skipping.");
        } else {
            // error, timeout, or unknown
            await speakText("I didn't catch that, skipping.");
        }

        if (!isMountedRef.current) return;

        // Mark messages as read in backend
        try {
            const validIds = currentBatch.messageIds.filter(id => id); 
            if (validIds.length > 0) {
                await axios.post('/api/messages/mark-read', { messageIds: validIds });
                console.log(`🎤 Marked ${validIds.length} messages as read`);
            }
        } catch (err) {
            console.error('🎤 Error marking read:', err);
        }

        // Remove the processed batch
        messageQueueRef.current.shift();

        // Process next batch after a short delay
        setTimeout(() => {
            if (isMountedRef.current) processQueue(true); // Pass true to allow recursive call
        }, 1500);
    };

    // DEBUG FUNCTION: Manually trigger the queue for testing
    const testVoiceFeature = () => {
        console.log("🎤 Manual test triggered");
        messageQueueRef.current.push({ senderName: "TestUser", messages: ["This is a test message to verify the voice feature works."], messageIds: [] });
        if (!isProcessingRef.current) {
            processQueue();
        }
    };

    const readNewsAloud = async () => {
        if (newsFeed.length === 0) return;
        await speakText("Reading global headlines and summaries now.");
        for (let i = 0; i < newsFeed.length; i++) {
            const item = newsFeed[i];
            await speakText(`Headline ${i + 1}: ${item.title}. Details: ${item.content}`);
            await new Promise(r => setTimeout(r, 600));
        }
        await speakText("Completed reading global headlines.");
    };
    // ------------------------------------

    const togglePopup = () => {
        if (!isOpen) {
            setIsOpen(true);
            setIsGreeting(true);
            const utterance = new SpeechSynthesisUtterance('Hi, I am your AI assistant');
            window.speechSynthesis.speak(utterance);
        } else {
            setIsOpen(false);
            window.speechSynthesis.cancel();
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim()) return;

        if (isGreeting) {
            setIsGreeting(false);
        }

        const userMsg = { role: 'user', content: message };
        setMessages(prev => [...prev, userMsg]);
        setMessage('');
        setIsLoading(true);

        try {
            const response = await axios.post('/api/messages/ai-chat', { content: message });
            const botMsg = { role: 'bot', content: response.data.reply };
            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            console.error('AI chat error:', error);
            const errorText = error.response?.data?.message || "Sorry, I'm having trouble connecting right now.";
            const errorMsg = { role: 'bot', content: errorText };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    // ─── Always-On Kane Toggle ───────────────────────────────────────
    const toggleKane = () => {
        if (kaneActive) {
            // Turn OFF
            kaneActiveRef.current = false;
            setKaneActive(false);
            if (wakeRecognitionRef.current) {
                wakeRecognitionRef.current.abort();
                wakeRecognitionRef.current = null;
            }
            if (commandRecognitionRef.current) {
                commandRecognitionRef.current.abort();
                commandRecognitionRef.current = null;
            }
            setIsListeningForWakeWord(false);
            setIsListeningForVoice(false);
            window.speechSynthesis.cancel();
            toast('Kane deactivated.', { icon: '😴' });
        } else {
            // Turn ON — immediately activate command flow (skip wake word)
            kaneActiveRef.current = true;
            setKaneActive(true);
            toast('Kane activated! Say your command.', { icon: '🤖', duration: 3000 });
            handleCommandFlow();
        }
    };
    // ─────────────────────────────────────────────────────────────────

    return (
        <div className="ai-assistant-container">
            {/* Global Voice Listener Indicator */}
            {isListeningForVoice && (
                <div 
                    className="global-voice-indicator" 
                    onClick={() => {
                        // If they click the indicator, we forcefully stop Speech Recognition to submit it immediately
                        if (window.speechSynthesis) window.speechSynthesis.cancel();
                        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                        // Not a direct way to abort from here without ref, but they can just click it as a hint.
                        toast('Processing your voice...', { id: 'ai-listening', icon: '⏳' });
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to force submit if it's stuck listening"
                >
                    <FiMic size={16} className="pulse-animation" />
                    <span>Listening... (Click to submit)</span>
                </div>
            )}

            {/* Wake Word Indicator */}
            {!isListeningForVoice && isListeningForWakeWord && !isProcessingCommand && (
                <div className="global-voice-indicator" style={{ background: 'rgba(76, 175, 80, 0.9)' }}>
                    <FiMic size={16} className="pulse-animation" />
                    <span>Listening for "Kane"...</span>
                </div>
            )}

            {/* Processing Indicator */}
            {isProcessingCommand && (
                <div className="global-voice-indicator" style={{ background: 'rgba(33, 150, 243, 0.9)' }}>
                    <div className="typing-indicator pulse-animation" style={{ display: 'inline-flex', padding: 0, background: 'transparent' }}>
                        <span></span><span></span><span></span>
                    </div>
                    <span style={{ marginLeft: '8px' }}>Processing...</span>
                </div>
            )}

            {isOpen && (
                <div className="ai-popup">
                    <div className="ai-header">
                        <div className="ai-avatar">
                            <FiCpu size={18} />
                        </div>
                        <h3>NexBot Assistant</h3>
                        <button 
                            onClick={testVoiceFeature}
                            style={{ marginLeft: 'auto', background: 'none', border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            title="Test Voice Feature"
                        >
                            Test Voice
                        </button>
                    </div>

                    <div className="ai-content">
                        {isGreeting ? (
                            <div className="ai-greeting-view">
                                <p className="ai-greeting-text">Hi, I am your AI assistant</p>
                                <div className="voice-visualizer">
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                    <div className="visualizer-bar"></div>
                                </div>
                                <p style={{ fontSize: '12px', color: '#888' }}>Ask me anything to get started</p>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, index) => (
                                    <div key={index} className={`ai-message ${msg.role}`}>
                                        {msg.content}
                                    </div>
                                ))}
                                {isLoading && <div className="ai-message bot">Thinking...</div>}
                                <div ref={chatEndRef} />
                            </>
                        )}
                    </div>

                    <div className="ai-input-area">
                        <input
                            type="text"
                            className="ai-input"
                            placeholder="Type your message..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                        />
                        <button 
                            className="ai-send-btn" 
                            onClick={handleSendMessage}
                            disabled={isLoading || !message.trim()}
                        >
                            <FiSend size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Kane Always-On FAB */}
            <button
                className={`kane-fab ${kaneActive ? 'kane-fab-active' : ''} ${isProcessingCommand ? 'kane-fab-processing' : ''}`}
                onClick={toggleKane}
                title={kaneActive ? 'Kane is listening — click to turn off' : 'Click to activate Kane'}
            >
                <span className="kane-fab-icon">{isProcessingCommand ? '⏳' : '🤖'}</span>
                <span className="kane-fab-label">{isProcessingCommand ? 'Working...' : kaneActive ? 'Kane ON' : 'Kane'}</span>
            </button>

            <button className={`ai-fab ${isOpen ? 'open' : ''}`} onClick={togglePopup}>
                {isOpen ? <FiX size={28} /> : <FiMessageSquare size={28} />}
            </button>

            {/* Global Hot News Option Modal Popup */}
            {isNewsPopupOpen && (
                <div className="global-news-modal-overlay">
                    <div className="global-news-modal-card">
                        <div className="global-news-modal-header">
                            <div className="global-news-glowing-indicator">🔥 LIVE NEWS</div>
                            <h2>Kane Global Hot News</h2>
                            <button className="global-news-close-btn" onClick={() => {
                                setIsNewsPopupOpen(false);
                                window.speechSynthesis.cancel();
                            }}>
                                <FiX size={20} />
                            </button>
                        </div>
                        
                        <div className="global-news-modal-body">
                            {newsFeed.length === 0 ? (
                                <div className="global-news-loading">
                                    <div className="spinner">🔮</div>
                                    <p>Tuning into world channels...</p>
                                </div>
                            ) : (
                                newsFeed.map((item, idx) => (
                                    <div className="global-news-item" key={idx}>
                                        <div className="global-news-item-badge">{item.tag || 'World News'}</div>
                                        <h4 className="global-news-item-title">{idx + 1}. {item.title}</h4>
                                        <p className="global-news-item-content">{item.content}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="global-news-modal-footer">
                            <button className="global-news-btn-primary" onClick={readNewsAloud}>
                                🔊 Read Aloud
                            </button>
                            <button className="global-news-btn-secondary" onClick={() => {
                                setIsNewsPopupOpen(false);
                                window.speechSynthesis.cancel();
                            }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIAssistant;
