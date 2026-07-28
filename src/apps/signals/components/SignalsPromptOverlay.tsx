import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { defaultTheme } from '../../../theme';

type SignalsPromptOverlayProps = {
  isSubmitting: boolean;
  onClose: () => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  prompt: string;
};

const promptIdeas = [
  'Find the best Base buy opportunities right now with real volume, strong liquidity, low risk, and positive momentum.',
  'Scan Base for strong momentum tokens with real 1h volume, decent liquidity, and no obvious suspicious warnings.',
  'Give me a broad Base token shortlist with fresh, trending, and momentum candidates. Do not over-filter.',
  'Show established trending Base tokens with good 24h activity, healthy liquidity, and lower risk.',
  'Find Base tokens worth reviewing now. Include both safer candidates and moderate-risk upside plays.',
  'Show fresh Base tokens that are not dead pools. Prioritize real volume, liquidity, and low risk.',
  'Find high-upside Base tokens moving fast, but avoid obvious rugs, honeypots, and fake volume.',
  'Give me Base tokens with the best mix of liquidity, volume acceleration, buyer interest, and low risk.',
];

const TYPING_SPEED_MS = 42;
const DELETING_SPEED_MS = 20;
const PROMPT_PAUSE_MS = 1300;

const SignalsPromptOverlay = ({
  isSubmitting,
  onClose,
  onPromptChange,
  onSubmit,
  prompt,
}: SignalsPromptOverlayProps) => {
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('pillarx-no-page-scroll');
    document.body.classList.add('pillarx-no-page-scroll');

    return () => {
      document.documentElement.classList.remove('pillarx-no-page-scroll');
      document.body.classList.remove('pillarx-no-page-scroll');
    };
  }, []);

  useEffect(() => {
    const activeIdea = promptIdeas[ideaIndex];
    const isComplete = typedLength === activeIdea.length;
    const isEmpty = typedLength === 0;
    const delay = isComplete
      ? PROMPT_PAUSE_MS
      : isDeleting
        ? DELETING_SPEED_MS
        : TYPING_SPEED_MS;

    const timer = window.setTimeout(() => {
      if (!isDeleting && isComplete) {
        setIsDeleting(true);
        return;
      }

      if (isDeleting && isEmpty) {
        setIsDeleting(false);
        setIdeaIndex((currentIndex) => (currentIndex + 1) % promptIdeas.length);
        return;
      }

      setTypedLength((currentLength) =>
        isDeleting ? currentLength - 1 : currentLength + 1
      );
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ideaIndex, isDeleting, typedLength]);

  const typedPrompt = promptIdeas[ideaIndex].slice(0, typedLength);

  return (
    <div
      style={{
        background: '#050509',
        bottom: 0,
        boxSizing: 'border-box',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: defaultTheme.font.primary.family,
        gap: 16,
        height: '100dvh',
        left: 0,
        overflow: 'hidden',
        padding: '18px 18px calc(18px + env(safe-area-inset-bottom))',
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 2147483647,
      }}
    >
      <header
        style={{
          alignItems: 'center',
          display: 'flex',
          flexShrink: 0,
          gap: 12,
          justifyContent: 'space-between',
        }}
      >
        <p
          style={{
            color: '#b8b2c5',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: 0,
            lineHeight: 1,
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          Ask Signals
        </p>
        <button
          aria-label="Close prompt"
          disabled={isSubmitting}
          onClick={onClose}
          style={{
            alignItems: 'center',
            appearance: 'none',
            background: '#14131a',
            border: '1px solid #34303f',
            borderRadius: 10,
            color: '#cfc9df',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            flexShrink: 0,
            height: 42,
            justifyContent: 'center',
            opacity: isSubmitting ? 0.65 : 1,
            padding: 0,
            width: 42,
          }}
          type="button"
        >
          <X aria-hidden size={22} />
        </button>
      </header>

      <textarea
        disabled={isSubmitting}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={typedPrompt}
        style={{
          background: '#09080d',
          border: '1px solid #34303f',
          borderRadius: 12,
          boxSizing: 'border-box',
          color: '#ffffff',
          flex: 1,
          fontFamily: 'inherit',
          fontSize: 17,
          fontWeight: 400,
          lineHeight: 1.42,
          minHeight: 0,
          outline: 'none',
          overflow: 'hidden',
          padding: '18px',
          resize: 'none',
          width: '100%',
        }}
        value={prompt}
      />

      <button
        disabled={isSubmitting || !prompt.trim()}
        onClick={onSubmit}
        style={{
          alignItems: 'center',
          appearance: 'none',
          background:
            isSubmitting || !prompt.trim() ? '#33284e' : '#8b5cf6',
          border: 0,
          borderRadius: 10,
          color: '#ffffff',
          cursor:
            isSubmitting || !prompt.trim() ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexShrink: 0,
          fontSize: 15,
          fontWeight: 500,
          gap: 9,
          height: 48,
          justifyContent: 'center',
          opacity: isSubmitting || !prompt.trim() ? 0.68 : 1,
          width: '100%',
        }}
        type="button"
      >
        {isSubmitting ? (
          <span
            className="animate-spin"
            style={{
              border: '2px solid rgba(255, 255, 255, 0.36)',
              borderRadius: 999,
              borderTopColor: '#ffffff',
              height: 16,
              width: 16,
            }}
          />
        ) : (
          <SendHorizontal aria-hidden size={18} />
        )}
        {isSubmitting ? 'Researching...' : 'Submit prompt'}
      </button>
    </div>
  );
};

export default SignalsPromptOverlay;
