import { MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_AI_INSIGHTS_QUERY,
  initializeMcpSession,
  researchTokens,
} from './api/mcpClient';
import ChainSelect from './components/ChainSelect';
import AiInsightsDisclaimer from './components/AiInsightsDisclaimer';
import AiInsightsPromptOverlay from './components/AiInsightsPromptOverlay';
import TokenInsightsTable from './components/TokenInsightsTable';
import type { TokenInsight } from './types';
import {
  readAiInsightsDisclaimerAccepted,
  writeAiInsightsDisclaimerAccepted,
} from './utils/disclaimer';
import { parseTokensFromMcpResponse } from './utils/mcpParsing';
import RefreshIcon from '../pillarx-app/images/refresh-button.png';
import { defaultTheme } from '../../theme';

const REFRESH_INTERVAL_MS = 30_000;
const PROGRESS_TICK_MS = 1_000;

const AiInsightsApp = () => {
  const [tokens, setTokens] = useState<TokenInsight[]>([]);
  const [selectedChain] = useState('base');
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(
    readAiInsightsDisclaimerAccepted
  );
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isPromptSubmitting, setIsPromptSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'success'>(
    'success'
  );
  const [prompt, setPrompt] = useState('');
  const [refreshCycleStartedAt, setRefreshCycleStartedAt] = useState(() =>
    Date.now()
  );
  const [refreshProgress, setRefreshProgress] = useState(0);
  const activeQueryRef = useRef(DEFAULT_AI_INSIGHTS_QUERY);
  const isLoadingRef = useRef(false);
  const isMountedRef = useRef(true);

  const loadInsights = useCallback(async (
    options: {
      commitQuery?: boolean;
      failureMessage?: string;
      query?: string;
      signal?: AbortSignal;
      showBusyMessage?: boolean;
      successMessage?: string;
    } = {}
  ) => {
    if (isLoadingRef.current) {
      if (options.showBusyMessage) {
        setMessage('AI Insights is already researching. Try again in a moment.');
        setMessageTone('error');
      }

      return false;
    }

    isLoadingRef.current = true;
    setIsRefreshing(true);

    try {
      const requestSignal = options.signal ?? new AbortController().signal;
      const nextSessionId = await initializeMcpSession(requestSignal);

      const researchBody = await researchTokens(
        nextSessionId,
        requestSignal,
        options.query ?? activeQueryRef.current
      );
      const nextTokens = parseTokensFromMcpResponse(researchBody);

      if (!nextTokens.length) {
        throw new Error(
          'AI Insights response did not include token opportunities.'
        );
      }

      if (!isMountedRef.current || options.signal?.aborted) return false;

      setTokens(nextTokens);
      if (options.commitQuery && options.query) {
        activeQueryRef.current = options.query;
      }
      if (options.successMessage) {
        setMessage(options.successMessage);
        setMessageTone('success');
      } else {
        setMessage('');
      }
      setRefreshCycleStartedAt(Date.now());
      return true;
    } catch (error) {
      if (options.signal?.aborted) return false;

      console.error('Unable to load AI Insights MCP data.', error);
      setMessage(
        options.failureMessage ??
          'Unable to load AI Insights data. Try refreshing again shortly.'
      );
      setMessageTone('error');
      return false;
    } finally {
      isLoadingRef.current = false;

      if (!isMountedRef.current || options.signal?.aborted) return;

      setIsRefreshing(false);
    }
  }, []);

  const submitPrompt = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    setIsPromptSubmitting(true);
    await loadInsights({
      commitQuery: true,
      failureMessage:
        'That prompt did not return usable token insights. Try a more specific research request.',
      query: trimmedPrompt,
      showBusyMessage: true,
      successMessage: 'AI Insights updated from your prompt.',
    });

    setIsPromptSubmitting(false);
    setIsPromptOpen(false);
  }, [loadInsights, prompt]);

  const acceptDisclaimer = useCallback(() => {
    writeAiInsightsDisclaimerAccepted();
    setHasAcceptedDisclaimer(true);
    setRefreshCycleStartedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!hasAcceptedDisclaimer) return;

    isMountedRef.current = true;
    const controller = new AbortController();

    loadInsights({ signal: controller.signal });
    const refreshIntervalId = window.setInterval(() => {
      loadInsights({ signal: controller.signal });
    }, REFRESH_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      controller.abort();
      window.clearInterval(refreshIntervalId);
    };
  }, [hasAcceptedDisclaimer, loadInsights]);

  useEffect(() => {
    const updateProgress = () => {
      const elapsedMs = Date.now() - refreshCycleStartedAt;
      setRefreshProgress(
        Math.min(100, (elapsedMs / REFRESH_INTERVAL_MS) * 100)
      );
    };

    updateProgress();
    const progressIntervalId = window.setInterval(
      updateProgress,
      PROGRESS_TICK_MS
    );

    return () => {
      window.clearInterval(progressIntervalId);
    };
  }, [refreshCycleStartedAt]);

  const refreshProgressDegrees = Math.min(360, refreshProgress * 3.6);

  return (
    <main
      style={{
        background: '#050509',
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: defaultTheme.font.primary.family,
        gap: 14,
        height: 'auto',
        minHeight: 'calc(100dvh - 112px)',
        overflow: 'visible',
        padding: '20px 18px 132px',
        width: '100%',
      }}
    >
      {hasAcceptedDisclaimer ? (
        <>
          <header
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 12,
              justifyContent: 'space-between',
              minWidth: 0,
            }}
          >
            <ChainSelect value={selectedChain} />
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
                gap: 8,
              }}
            >
              <button
                aria-label="Open AI Insights prompt"
                onClick={() => {
                  setIsPromptOpen(true);
                }}
                style={{
                  alignItems: 'center',
                  appearance: 'none',
                  background: '#050509',
                  border: '2px solid #121116',
                  borderBottomWidth: 4,
                  borderRadius: 10,
                  color: '#cfc9df',
                  cursor: 'pointer',
                  display: 'flex',
                  height: 42,
                  justifyContent: 'center',
                  padding: 0,
                  width: 44,
                }}
                type="button"
              >
                <MessageCircle aria-hidden size={21} strokeWidth={2.4} />
              </button>
              <div
                style={{
                  background: `conic-gradient(from -90deg, #8b5cf6 ${refreshProgressDegrees}deg, #30283d ${refreshProgressDegrees}deg 360deg)`,
                  borderRadius: 12,
                  display: 'flex',
                  flexShrink: 0,
                  padding: 2,
                }}
              >
                <button
                  aria-label="Refresh AI Insights"
                  disabled={isRefreshing}
                  onClick={() => {
                    loadInsights({ showBusyMessage: true });
                  }}
                  style={{
                    alignItems: 'center',
                    appearance: 'none',
                    background: '#050509',
                    border: '2px solid #121116',
                    borderBottomWidth: 4,
                    borderRadius: 10,
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    height: 38,
                    justifyContent: 'center',
                    opacity: 1,
                    padding: 0,
                    width: 40,
                  }}
                  type="button"
                >
                  <img
                    alt="refresh-button"
                    src={RefreshIcon}
                    style={{
                      height: 34,
                      opacity: isRefreshing ? 0.82 : 1,
                      width: 36,
                    }}
                  />
                </button>
              </div>
            </div>
          </header>

          {message ? (
            <div
              style={{
                background:
                  messageTone === 'error'
                    ? 'rgba(255, 196, 87, 0.12)'
                    : 'rgba(139, 92, 246, 0.14)',
                border:
                  messageTone === 'error'
                    ? '1px solid rgba(255, 196, 87, 0.36)'
                    : '1px solid rgba(139, 92, 246, 0.36)',
                borderRadius: 10,
                color: messageTone === 'error' ? '#ffd28a' : '#d8ccff',
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.35,
                padding: '9px 10px',
              }}
            >
              {message}
            </div>
          ) : null}

          <TokenInsightsTable tokens={tokens} />

          {isPromptOpen ? (
            <AiInsightsPromptOverlay
              isSubmitting={isPromptSubmitting}
              onClose={() => setIsPromptOpen(false)}
              onPromptChange={setPrompt}
              onSubmit={submitPrompt}
              prompt={prompt}
            />
          ) : null}
        </>
      ) : (
        <AiInsightsDisclaimer onAccept={acceptDisclaimer} />
      )}
    </main>
  );
};

export default AiInsightsApp;
