import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  BrainCircuit,
  Copy,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
  ArrowRight,
  MessageSquareText,
  AlertCircle,
  StopCircle,
  RotateCcw,
  Plus,
  Check,
  Zap,
  ShieldCheck,
  Layers,
  MapPin,
  Compass,
  FileText,
  User,
  Sliders,
  ChevronRight,
  Info
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useJob } from '../hooks/useJob';
import { api } from '../services/api';
import robotImg from '../assets/geoai-robot.png';
import './AssistantPage.css';

const QUICK_PROMPTS = [
  'Explain this analysis',
  'Summarize this job',
  'Explain this building',
  'Explain this parcel',
  'Why was this case flagged?',
  'Explain the model result',
  'Explain the CRS',
  'Explain the report',
  'Explain this error',
  'How does GeoCADASTRA work?'
];

function buildContextSummary(location, jobId, user) {
  const pathname = location?.pathname || '/';
  const routeInfo =
    pathname === '/results' || pathname.startsWith('/results/')
      ? 'Results Workspace'
      : pathname === '/review'
      ? 'Review Center'
      : pathname === '/map'
      ? 'Map Explorer'
      : pathname === '/analysis'
      ? 'Analysis Studio'
      : pathname === '/reports'
      ? 'Reports Center'
      : pathname === '/datasets'
      ? 'Dataset Explorer'
      : pathname === '/models'
      ? 'Model Intelligence'
      : 'Current Workspace';

  return {
    route: pathname,
    routeInfo,
    jobId: jobId || 'NOT AVAILABLE',
    user: user?.full_name || user?.email || 'NOT AVAILABLE',
    model: 'NOT AVAILABLE',
    parcel: 'NOT AVAILABLE',
    building: 'NOT AVAILABLE',
    crs: 'NOT AVAILABLE'
  };
}

export default function AssistantPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { jobId } = useJob();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState({
    status: 'checking',
    code: 'GEMINI_STATUS_CHECKING',
    model: 'NOT AVAILABLE'
  });
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [copiedContextKey, setCopiedContextKey] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const context = useMemo(() => buildContextSummary(location, jobId, user), [location, jobId, user]);

  const createFreshConversation = async (silent = false) => {
    try {
      const payload = await api.createAssistantConversation();
      const nextConversationId = payload?.conversation_id || null;
      setConversationId(nextConversationId);
      if (!silent) {
        setMessages([
          {
            id: `welcome-${Date.now()}`,
            role: 'assistant',
            text: "Hi! I am the GeoCADASTRA Assistant. I can analyze cadastral building footprints, spatial boundary discrepancies, ML predictions, and GIS reports. What would you like to investigate?",
            time: new Date().toISOString(),
            source: 'GeoAI Context'
          }
        ]);
      }
      return nextConversationId;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await api.getAssistantStatus();
        setAssistantStatus({
          status: status?.status || 'not_configured',
          code: status?.code || 'GEMINI_NOT_CONFIGURED',
          model: status?.model || 'NOT AVAILABLE'
        });
      } catch {
        setAssistantStatus({
          status: 'unavailable',
          code: 'GEMINI_API_ERROR',
          model: 'NOT AVAILABLE'
        });
      }
    };

    loadStatus();
    createFreshConversation(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const handleClearChat = async () => {
    setMessages([]);
    setBusy(false);
    setInput('');
    await createFreshConversation(false);
  };

  const sendPrompt = async (draft = input) => {
    const text = String(draft || '').trim();
    if (!text || busy) return;

    const userMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
      time: new Date().toISOString()
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setBusy(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: assistantId,
        role: 'assistant',
        text: 'Assistant is analyzing...',
        time: new Date().toISOString(),
        source: 'GeoAI'
      }
    ]);

    try {
      const response = await api.sendAssistantMessage({
        message: text,
        conversation_id: conversationId,
        context: {
          job_id: context.jobId,
          route: context.route,
          routeInfo: context.routeInfo,
          model: context.model,
          parcel: context.parcel,
          building: context.building,
          crs: context.crs,
          user: context.user
        }
      });

      const finalText = String(response?.response || '').trim();
      if (!finalText) {
        throw new Error('Gemini returned no response content.');
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, text: finalText, source: 'GeoAI Engine' }
            : message
        )
      );
    } catch (error) {
      const errorText = error?.message || 'Gemini is temporarily unavailable. Please try again.';
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, text: errorText, source: 'System Status' }
            : message
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId((current) => (current === id ? null : current)), 1400);
    } catch {
      // Ignore clipboard fallback
    }
  };

  const handleCopyContext = async (key, val) => {
    try {
      await navigator.clipboard.writeText(String(val));
      setCopiedContextKey(key);
      setTimeout(() => setCopiedContextKey((current) => (current === key ? null : current)), 1400);
    } catch {
      // Ignore
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  const focusComposer = () => {
    textareaRef.current?.focus();
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const statusBadge =
    assistantStatus.status === 'connected'
      ? { label: 'GEMINI • AVAILABLE', className: 'geoai-status-pill connected' }
      : assistantStatus.status === 'not_configured'
      ? { label: 'GEMINI • NOT CONFIGURED', className: 'geoai-status-pill not_configured' }
      : { label: 'GEMINI • UNAVAILABLE', className: 'geoai-status-pill unavailable' };

  return (
    <div className="geoai-workspace-container">
      {/* 1. Page Header */}
      <PageHeader
        eyebrow="GEOCADASTRA INTELLIGENCE"
        title="GeoAI Assistant"
        subtitle="Ask questions about your analyses, GIS results, spatial review cases, models, reports and project workflow."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={statusBadge.className}>
              <span className="geoai-status-dot" /> {statusBadge.label}
            </span>
          </div>
        }
      />

      {/* 2. Unified 3-Column Operations Console Grid */}
      <div className="geoai-grid-layout">
        {/* LEFT COLUMN: Conversation History & Suggested Prompts */}
        <aside className="geoai-panel">
          <div className="geoai-panel-header">
            <div className="geoai-panel-title-group">
              <div className="geoai-panel-icon" style={{ background: '#E8F7F5', color: '#00AFA3' }}>
                <Bot size={15} />
              </div>
              <div>
                <h3 className="geoai-panel-title">Operations Console</h3>
                <p className="geoai-panel-subtitle">History & Prompts</p>
              </div>
            </div>
          </div>

          <div className="geoai-panel-body">
            {/* Primary New Chat Button */}
            <button
              type="button"
              className="geoai-cmd-btn primary-new"
              onClick={handleClearChat}
              title="Start a fresh chat conversation"
            >
              <Plus size={14} /> New Chat Session
            </button>

            {/* Active Session Card */}
            <div className="geoai-session-tile">
              <div className="geoai-session-header">
                <span>Active Session</span>
                <span style={{ color: '#00AFA3' }}>● Live</span>
              </div>
              <div className="geoai-session-id" title={conversationId || 'New Session'}>
                {conversationId ? `ID: ${conversationId.slice(0, 16)}...` : 'Ready to start'}
              </div>
            </div>

            {/* Suggested Prompt Shortcuts */}
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6B7C8C',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: 8
                }}
              >
                Suggested Queries
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  className="geoai-cmd-btn"
                  onClick={() => sendPrompt('Explain my last analysis')}
                  disabled={busy}
                >
                  <Sparkles size={13} style={{ color: '#00AFA3' }} /> Explain my last analysis
                </button>
                <button
                  type="button"
                  className="geoai-cmd-btn"
                  onClick={() => sendPrompt('Explain review queue')}
                  disabled={busy}
                >
                  <BrainCircuit size={13} style={{ color: '#4D72FF' }} /> Explain review queue
                </button>
                <button
                  type="button"
                  className="geoai-cmd-btn"
                  onClick={() => sendPrompt('Explain model benchmark')}
                  disabled={busy}
                >
                  <Wand2 size={13} style={{ color: '#7C5CFC' }} /> Explain model benchmark
                </button>
                <button
                  type="button"
                  className="geoai-cmd-btn"
                  onClick={() => sendPrompt('Summarize this job')}
                  disabled={busy}
                >
                  <FileText size={13} style={{ color: '#00AFA3' }} /> Summarize this job
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: Focal Chat Experience */}
        <main className="geoai-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Chat Panel Header */}
          <div className="geoai-panel-header">
            <div className="geoai-panel-title-group">
              <div className="geoai-panel-icon" style={{ background: '#E8F7F5', color: '#00AFA3' }}>
                <MessageSquareText size={15} />
              </div>
              <div>
                <h3 className="geoai-panel-title">GeoAI Assistant Chat</h3>
                <p className="geoai-panel-subtitle">
                  {assistantStatus.status === 'connected' ? 'Interactive Spatial Analysis' : 'Cadastral Intelligence'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="geoai-msg-action-btn"
                onClick={handleClearChat}
                title="Clear conversation"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="geoai-chat-stream">
            {messages.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="WELCOME TO GEOAI ASSISTANT"
                description="I can analyze aerial imagery results, cadastral parcel boundaries, spatial review cases, and ML inference metrics."
                actionLabel="EXPLAIN LAST ANALYSIS"
                onAction={() => sendPrompt('Explain my last analysis')}
              />
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  const isThinking = message.text === 'Assistant is analyzing...' || message.text === 'Assistant is thinking...';
                  return (
                    <motion.div
                      key={message.id}
                      className={`geoai-message-row ${isUser ? 'user' : 'assistant'}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className={`geoai-avatar ${isUser ? 'user-av' : 'assistant-av'}`}>
                        {isUser ? <User size={15} /> : <Bot size={16} />}
                      </div>

                      <div className="geoai-message-card">
                        {isThinking ? (
                          <div className="geoai-thinking-row">
                            <span>Analyzing geospatial context</span>
                            <span className="geoai-thinking-dots">
                              <span className="geoai-thinking-dot" />
                              <span className="geoai-thinking-dot" />
                              <span className="geoai-thinking-dot" />
                            </span>
                          </div>
                        ) : (
                          <div className="geoai-message-text">{message.text}</div>
                        )}

                        <div className="geoai-message-footer">
                          <span>
                            {message.source || 'GeoAI'} ·{' '}
                            {new Date(message.time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>

                          {!isUser && !isThinking && (
                            <div className="geoai-msg-actions">
                              <button
                                type="button"
                                className="geoai-msg-action-btn"
                                onClick={() => handleCopy(message.text, message.id)}
                                title="Copy message response"
                              >
                                {copiedMessageId === message.id ? (
                                  <Check size={12} style={{ color: '#19A86B' }} />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="geoai-msg-action-btn"
                                onClick={() => sendPrompt(message.text)}
                                title="Retry query"
                              >
                                <RotateCcw size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick Action Chips Bar */}
          <div className="geoai-chips-bar" aria-label="Quick prompt suggestions">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="geoai-chip"
                onClick={() => sendPrompt(prompt)}
                disabled={busy}
              >
                <Zap size={11} style={{ color: '#00AFA3' }} /> {prompt}
              </button>
            ))}
          </div>

          {/* Chat Composer */}
          <div className="geoai-composer-area">
            <div className="geoai-textarea-box">
              <textarea
                ref={textareaRef}
                className="geoai-textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask GeoCADASTRA anything about GIS layers, parcel boundaries, spatial review..."
                aria-label="Ask GeoCADASTRA assistant input"
              />
            </div>

            <div className="geoai-composer-actions">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  onClick={handleClearChat}
                  title="Clear chat input and session"
                >
                  <RefreshCw size={12} /> Clear
                </button>
                {busy && (
                  <button
                    type="button"
                    className="ds-btn ds-btn-secondary ds-btn-sm"
                    onClick={() => setBusy(false)}
                    title="Stop generation"
                    style={{ color: '#E74C3C' }}
                  >
                    <StopCircle size={12} /> Stop
                  </button>
                )}
              </div>

              <button
                type="button"
                className="ds-btn ds-btn-primary ds-btn-sm"
                onClick={() => sendPrompt()}
                disabled={busy || !input.trim()}
                title="Send message (Enter)"
              >
                <Send size={13} /> {busy ? 'Thinking...' : 'Send Query'}
              </button>
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: Project Context */}
        <aside className="geoai-panel">
          <div className="geoai-panel-header">
            <div className="geoai-panel-title-group">
              <div className="geoai-panel-icon" style={{ background: '#EEF2FF', color: '#4D72FF' }}>
                <BrainCircuit size={15} />
              </div>
              <div>
                <h3 className="geoai-panel-title">Project Context</h3>
                <p className="geoai-panel-subtitle">Runtime State</p>
              </div>
            </div>
          </div>

          <div className="geoai-panel-body">
            {[
              { label: 'Active Job ID', val: context.jobId, icon: FileText, key: 'job' },
              { label: 'AI Model', val: context.model, icon: BrainCircuit, key: 'model' },
              { label: 'Parcel ID', val: context.parcel, icon: MapPin, key: 'parcel' },
              { label: 'Building ID', val: context.building, icon: Layers, key: 'building' },
              { label: 'Coordinate System (CRS)', val: context.crs, icon: Compass, key: 'crs' },
              { label: 'Workspace Route', val: `${context.routeInfo} (${context.route})`, icon: Sliders, key: 'route' },
              { label: 'User Identity', val: context.user, icon: User, key: 'user' }
            ].map(({ label, val, icon: Icon, key }) => (
              <div key={label} className="geoai-context-card">
                <div className="geoai-context-card-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon size={12} style={{ color: '#6B7C8C' }} />
                    <span className="geoai-context-card-label">{label}</span>
                  </div>
                  {val && val !== 'NOT AVAILABLE' && (
                    <button
                      type="button"
                      className="geoai-msg-action-btn"
                      onClick={() => handleCopyContext(key, val)}
                      title={`Copy ${label}`}
                    >
                      {copiedContextKey === key ? (
                        <Check size={11} style={{ color: '#19A86B' }} />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  )}
                </div>
                <div
                  className="geoai-context-card-val"
                  style={{
                    color: val === 'NOT AVAILABLE' ? '#94A3B8' : '#162531',
                    fontFamily: key === 'job' || key === 'crs' ? 'monospace' : 'inherit'
                  }}
                >
                  {val}
                </div>
              </div>
            ))}

            {assistantStatus.status === 'not_configured' && (
              <div
                style={{
                  border: '1px solid #FDE68A',
                  background: '#FFFBEB',
                  color: '#92400E',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  marginTop: 6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 2 }}>
                  <AlertCircle size={13} /> Gemini Assistant Not Configured
                </div>
                Configure your Gemini API key in the backend environment to enable live AI responses.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 3. Floating GeoAI Assistant Robot Widget */}
      <div className="geoai-floating-assistant" aria-label="GeoAI Assistant Quick Trigger">
        <div className="geoai-floating-bubble">
          <span>{busy ? 'GeoAI is analyzing...' : 'GeoAI Assistant • Ready'}</span>
        </div>

        <button
          type="button"
          className="geoai-floating-avatar-btn"
          onClick={focusComposer}
          title="Focus GeoAI Assistant"
        >
          <img
            src={robotImg}
            alt="GeoAI Robot Assistant"
            className="geoai-floating-img"
          />
          <span
            className={`geoai-floating-badge-dot ${
              busy ? 'busy' : assistantStatus.status === 'connected' ? 'active' : 'warn'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
