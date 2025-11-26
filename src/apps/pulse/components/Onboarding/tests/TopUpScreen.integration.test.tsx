/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-props-no-spreading */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TopUpScreen from '../TopUpScreen';

// Mock all dependencies
vi.mock('../../../services/pillarXApiWalletPortfolio', () => ({
  useGetWalletPortfolioQuery: vi.fn(),
}));

vi.mock('../../../hooks/useGasTankBalance', () => ({
  useGasTankBalance: vi.fn(),
}));

vi.mock('../../../hooks/useGasEstimationTopUp', () => ({
  useGasEstimationTopUp: vi.fn(),
}));

vi.mock('../../../hooks/useRelaySell', () => ({
  default: vi.fn(() => ({
    getBestSellOffer: vi.fn(),
    isInitialized: true,
    error: null,
  })),
}));

vi.mock('../../../hooks/useIntentSdk', () => ({
  default: vi.fn(),
}));

const mockPortfolioToken = {
  id: 1,
  symbol: 'USDC',
  name: 'USD Coin',
  contract: '0x1234567890123456789012345678901234567890',
  decimals: 6,
  logo: 'usdc.png',
  balance: 1000,
  price: 1.0,
  blockchain: 'ethereum',
};

const createMockProps = (overrides = {}) => ({
  selectedToken: null,
  setSelectedToken: vi.fn(),
  portfolioTokens: [mockPortfolioToken],
  walletPortfolioData: {
    result: {
      data: {
        assets: [],
        total_wallet_balance: 1000,
        wallets: ['0x1234567890123456789012345678901234567890'],
        balances_length: 1,
      },
    },
  },
  setOnboardingScreen: vi.fn(),
  refetchWalletPortfolio: vi.fn(),
  isPortfolioLoading: false,
  onBack: vi.fn(),
  initialBalance: 1000,
  setSearching: vi.fn(),
  markOnboardingComplete: vi.fn(),
  ...overrides,
});

describe('<TopUpScreen /> - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('component rendering', () => {
    it('renders TopUpScreen title', () => {
      render(<TopUpScreen {...createMockProps()} />);
      expect(screen.getByText('Top up Gas Tank')).toBeInTheDocument();
    });

    it('renders subtitle', () => {
      render(<TopUpScreen {...createMockProps()} />);
      expect(
        screen.getByText('Select Fee Tokens and Input Amount')
      ).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<TopUpScreen {...createMockProps()} />);
      const backButton = screen.getByLabelText('Go back');
      expect(backButton).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('calls onBack when back button is clicked', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<TopUpScreen {...createMockProps({ onBack })} />);

      const backButton = screen.getByLabelText('Go back');
      await user.click(backButton);

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading states', () => {
    it('shows loading indicator when portfolio is loading', () => {
      render(
        <TopUpScreen {...createMockProps({ isPortfolioLoading: true })} />
      );

      expect(screen.getByText(/Loading balances/i)).toBeInTheDocument();
    });

    it('disables confirm button when portfolio is loading', () => {
      render(
        <TopUpScreen {...createMockProps({ isPortfolioLoading: true })} />
      );

      const confirmButton = screen.getByTestId('pulse-topup-confirm-button');
      expect(confirmButton).toBeDisabled();
    });

    it('disables confirm button when no portfolio tokens available', () => {
      render(<TopUpScreen {...createMockProps({ portfolioTokens: [] })} />);

      const confirmButton = screen.getByTestId('pulse-topup-confirm-button');
      expect(confirmButton).toBeDisabled();
    });
  });

  describe('token selection', () => {
    it('displays select token placeholder when no token selected', () => {
      render(<TopUpScreen {...createMockProps({ selectedToken: null })} />);

      expect(screen.getByText('Select token')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('back button is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<TopUpScreen {...createMockProps({ onBack })} />);

      const backButton = screen.getByLabelText('Go back');
      backButton.focus();
      await user.keyboard('{Enter}');

      expect(onBack).toHaveBeenCalled();
    });

    it('confirm button has proper type attribute', () => {
      render(<TopUpScreen {...createMockProps()} />);

      const confirmButton = screen.getByTestId('pulse-topup-confirm-button');
      expect(confirmButton).toHaveAttribute('type', 'button');
    });
  });
});
