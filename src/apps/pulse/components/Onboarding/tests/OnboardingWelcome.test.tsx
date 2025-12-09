/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-props-no-spreading */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import OnboardingWelcome from '../OnboardingWelcome';

describe('<OnboardingWelcome />', () => {
  const mockProps = {
    onComplete: vi.fn(),
    maxStableCoinBalance: {
      chainId: 1,
      balance: 150.5,
    },
    gasTankBalance: 0,
    isGasTankLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders correctly and displays welcome header', () => {
      render(<OnboardingWelcome {...mockProps} />);

      expect(
        screen.getByTestId('pulse-onboarding-welcome')
      ).toBeInTheDocument();
      expect(screen.getByText('👋 Welcome to')).toBeInTheDocument();
      expect(screen.getByText('PULSE APP')).toBeInTheDocument();
    });

    it('displays wallet and gas tank balances', () => {
      render(<OnboardingWelcome {...mockProps} />);

      // Check for "Ethereum" label (chain name from ChainNames mapping)
      expect(screen.getByText(/Ethereum:/)).toBeInTheDocument();
      // Check for USDC balance formatting
      expect(screen.getByText(/150\.50/)).toBeInTheDocument();
      // Check for USDC currency label
      expect(screen.getByText('USDC')).toBeInTheDocument();

      // Check for "Universal Gas Tank" label and gas tank balance
      expect(screen.getByText(/Universal Gas Tank/)).toBeInTheDocument();
    });

    it('displays description text', () => {
      render(<OnboardingWelcome {...mockProps} />);

      expect(
        screen.getByText(
          /To start trading, you need \$2 USDC on a network and \$2 in your gas tank\./
        )
      ).toBeInTheDocument();
    });

    it('displays Top up button', () => {
      render(<OnboardingWelcome {...mockProps} />);

      expect(
        screen.getByTestId('pulse-onboarding-top-up-button')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Top up/ })
      ).toBeInTheDocument();
    });
  });

  describe('balance display', () => {
    it('formats USDC balance with 2 decimal places', () => {
      render(
        <OnboardingWelcome
          {...mockProps}
          maxStableCoinBalance={{ chainId: 1, balance: 1234.567 }}
        />
      );

      expect(screen.getByText(/1,234\.57/)).toBeInTheDocument();
    });

    it('formats gas tank balance correctly', () => {
      render(<OnboardingWelcome {...mockProps} gasTankBalance={99.99} />);

      expect(screen.getByText(/99\.99/)).toBeInTheDocument();
    });

    it('handles zero balances', () => {
      render(
        <OnboardingWelcome
          {...mockProps}
          maxStableCoinBalance={{ chainId: 1, balance: 0 }}
          gasTankBalance={0}
        />
      );

      const zeroTexts = screen.getAllByText(/0\.00/);
      expect(zeroTexts.length).toBeGreaterThan(0);
    });

    it('displays large balances with proper formatting', () => {
      render(
        <OnboardingWelcome
          {...mockProps}
          maxStableCoinBalance={{ chainId: 1, balance: 1000000.99 }}
          gasTankBalance={50000.5}
        />
      );

      // Check for large USDC balance with comma formatting
      const text = screen.getByText(/1,000,000/);
      expect(text).toBeInTheDocument();
      // Verify gas tank balance
      const gasText = screen.getByText(/50,000\.50/);
      expect(gasText).toBeInTheDocument();
    });
  });

  describe('button interactions', () => {
    it('calls onComplete when Top up button is clicked', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();

      render(<OnboardingWelcome {...mockProps} onComplete={onComplete} />);

      const button = screen.getByTestId('pulse-onboarding-top-up-button');
      await user.click(button);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('disables Top up button when gas tank is loading', () => {
      render(<OnboardingWelcome {...mockProps} isGasTankLoading />);

      const button = screen.getByTestId('pulse-onboarding-top-up-button');
      expect(button).toBeDisabled();
    });

    it('enables Top up button when gas tank is not loading', () => {
      render(<OnboardingWelcome {...mockProps} isGasTankLoading={false} />);

      const button = screen.getByTestId('pulse-onboarding-top-up-button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when isGasTankLoading is true', () => {
      render(<OnboardingWelcome {...mockProps} isGasTankLoading />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('shows Top up text when isGasTankLoading is false', () => {
      render(<OnboardingWelcome {...mockProps} isGasTankLoading={false} />);

      expect(screen.getByText('Top up')).toBeInTheDocument();
    });

    it('changes button background color based on loading state', () => {
      const { rerender } = render(
        <OnboardingWelcome {...mockProps} isGasTankLoading={false} />
      );

      let button = screen.getByTestId('pulse-onboarding-top-up-button');
      expect(button).toHaveClass('bg-[#8A77FF]');

      rerender(<OnboardingWelcome {...mockProps} isGasTankLoading />);

      button = screen.getByTestId('pulse-onboarding-top-up-button');
      expect(button).toHaveClass('bg-[#29292F]');
    });
  });

  describe('accessibility', () => {
    it('has proper semantic structure', () => {
      render(<OnboardingWelcome {...mockProps} />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('PULSE APP');
    });

    it('button is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onComplete = vi.fn();

      render(<OnboardingWelcome {...mockProps} onComplete={onComplete} />);

      const button = screen.getByTestId('pulse-onboarding-top-up-button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(onComplete).toHaveBeenCalled();
    });
  });
});
