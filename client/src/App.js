import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { useSocketStore } from './store/socketStore';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import ContactsPage from './pages/ContactsPage';
import ProfilePage from './pages/ProfilePage';
import StoriesPage from './pages/StoriesPage';
import ChatHistoryPage from './pages/ChatHistoryPage';
import DailyHubPage from './pages/DailyHubPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ChallengesPage from './pages/ChallengesPage';
import MusicHubPage from './pages/MusicHubPage';
import KaneCompanionPage from './pages/KaneCompanionPage';
import FunZonePage from './pages/FunZonePage';
import ExtrasHubPage from './pages/ExtrasHubPage';
import PartyLobbyPage from './pages/PartyLobbyPage';
import GroupsDiscoveryPage from './pages/GroupsDiscoveryPage';
import JoinGroupPage from './pages/JoinGroupPage';
import AutomationPage from './pages/AutomationPage';
import AdvancedFeaturesPage from './pages/AdvancedFeaturesPage';
import AIAssistant from './components/AIAssistant';
import AIBriefing from './components/AIBriefing';
import './App.css';

function AppLayout() {
  return (
    <div className="app-route-shell">
      <Outlet />
    </div>
  );
}

function App() {
  const { isAuthenticated, user } = useAuthStore();
  const { initializeSocket } = useSocketStore();
  const [showBriefing, setShowBriefing] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      initializeSocket(user.id);
    }
  }, [isAuthenticated, user, initializeSocket]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `kane-briefing-${user.id}-${todayKey}`;
    if (!sessionStorage.getItem(storageKey)) {
      setShowBriefing(true);
      sessionStorage.setItem(storageKey, 'shown');
    }
  }, [isAuthenticated, user]);

  return (
    <Router>
      <Toaster position="top-right" />
      {isAuthenticated && <Navbar />}
      {isAuthenticated && <AIAssistant />}
      {isAuthenticated && <AIBriefing isOpen={showBriefing} onClose={() => setShowBriefing(false)} />}
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/chats" />} />
        <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/chats" />} />
        
        {isAuthenticated ? (
          <Route element={<AppLayout />}>
            <Route path="/chats" element={<ChatPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/chat-history" element={<ChatHistoryPage />} />
            <Route path="/daily-hub" element={<DailyHubPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/challenges" element={<ChallengesPage />} />
            <Route path="/music" element={<MusicHubPage />} />
            <Route path="/kane" element={<KaneCompanionPage />} />
            <Route path="/fun-zone" element={<FunZonePage />} />
            <Route path="/extras" element={<ExtrasHubPage />} />
            <Route path="/party" element={<PartyLobbyPage />} />
            <Route path="/automations" element={<AutomationPage />} />
            <Route path="/advanced" element={<AdvancedFeaturesPage />} />
            <Route path="/groups/discover" element={<GroupsDiscoveryPage />} />
            <Route path="/join/:code" element={<JoinGroupPage />} />
            <Route path="/" element={<Navigate to="/chats" />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
