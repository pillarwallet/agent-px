/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-props-no-spreading */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import PreviewTopUp from '../PreviewTopUp';

// Mock all dependencies
vi.mock('../../../hooks/useIntentSdk', () => ({
  default: vi.fn(() => ({
    areModulesInstalled: false,
    installModules: vi.fn(),
    getEnablePulseTradingTransactions: vi.fn(),
  })),
}));

vi.mock('../../../../../hooks/useEIP7702Upgrade', () => ({
  useEIP7702Upgrade: vi.fn(() => ({
    isEligible: false,
    handleUpgradeClick: vi.fn(),
  })),
}));

vi.mock('../../../hooks/useTopUp', () => ({
  default: vi.fn(() => ({
    executeTopUp: vi.fn(),
    error: null,
    clearError: vi.fn(),
  })),
}));

vi.mock('../../../hooks/useGasEstimationTopUp', () => ({
  default: vi.fn(() => ({
    isEstimatingGas: false,
    gasEstimationError: null,
    gasCostNative: '0.001',
    nativeTokenSymbol: 'ETH',
  })),
}));

vi.mock('../Transaction/TransactionStatus', () => ({
  default: ({ closeTransactionStatus }: any) => (
    <div data-testid="transaction-status">
      <button type="button" onClick={closeTransactionStatus}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('../../../../services/userOpStatus', () => ({
  getUserOperationStatus: vi.fn(),
}));

const mockSelectedToken = {
  name: 'USD Coin',
  symbol: 'USDC',
  logo: 'usdc.png',
  address: '0x1234567890123456789012345678901234567890',
  chainId: 1,
  usdValue: '100',
  dailyPriceChange: 0,
  decimals: 6,
};

const mockSellOffer = {
  tokenAmountToReceive: 100,
  minimumReceive: 99,
  slippageTolerance: 0.01,
  priceImpact: 0.5,
  offer: {} as any,
};

const createMockProps = (overrides = {}) => ({
  onBack: vi.fn(),
  selectedToken: mockSelectedToken,
  amount: '100',
  allocateAmount: 100,
  sellOffer: mockSellOffer,
  userPortfolio: [],
  setOnboardingScreen: vi.fn(),
  markOnboardingComplete: vi.fn(),
  ...overrides,
});

describe('<PreviewTopUp /> - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('component rendering', () => {
    it('renders PreviewTopUp with title', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('renders back button', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      const backButton = screen.getByLabelText('Go back');
      expect(backButton).toBeInTheDocument();
    });

    it('renders ESC button', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      const escButton = screen.getByLabelText('Close preview');
      expect(escButton).toBeInTheDocument();
      expect(screen.getByText('ESC')).toBeInTheDocument();
    });

    it('renders confirm button', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      const confirmButton = screen.getByTestId(
        'pulse-preview-topup-confirm-button'
      );
      expect(confirmButton).toBeInTheDocument();
      expect(confirmButton).toHaveTextContent('Confirm Transaction');
    });

    it('renders gas fee display', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      expect(screen.getByText('Gas fee:')).toBeInTheDocument();
      expect(screen.getByText(/≈ 0.001 ETH/)).toBeInTheDocument();
    });
  });

  describe('step display', () => {
    it('renders deposit to gas tank step for USDC token', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      expect(screen.getByText('Deposit to Gas Tank')).toBeInTheDocument();
    });

    it('renders swap to USDC step for non-USDC token', () => {
      const nonUsdcToken = {
        ...mockSelectedToken,
        address: '0x0987654321098765432109876543210987654321',
      };
      render(
        <PreviewTopUp {...createMockProps({ selectedToken: nonUsdcToken })} />
      );
      expect(screen.getByText('Swap to USDC')).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('calls onBack when back button is clicked', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<PreviewTopUp {...createMockProps({ onBack })} />);

      const backButton = screen.getByLabelText('Go back');
      await user.click(backButton);

      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('calls onBack when ESC button is clicked', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<PreviewTopUp {...createMockProps({ onBack })} />);

      const escButton = screen.getByLabelText('Close preview');
      await user.click(escButton);

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading states', () => {
    it('renders gas fee display', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      expect(screen.getByText('Gas fee:')).toBeInTheDocument();
    });

    it('renders confirm button in enabled state by default', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      const confirmButton = screen.getByTestId(
        'pulse-preview-topup-confirm-button'
      );
      expect(confirmButton).not.toBeDisabled();
    });
  });

  describe('error handling', () => {
    it('renders component without errors', () => {
      render(<PreviewTopUp {...createMockProps()} />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('back button is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<PreviewTopUp {...createMockProps({ onBack })} />);

      const backButton = screen.getByLabelText('Go back');
      backButton.focus();
      await user.keyboard('{Enter}');

      expect(onBack).toHaveBeenCalled();
    });

    it('ESC button is keyboard accessible', async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();

      render(<PreviewTopUp {...createMockProps({ onBack })} />);

      const escButton = screen.getByLabelText('Close preview');
      escButton.focus();
      await user.keyboard('{Enter}');

      expect(onBack).toHaveBeenCalled();
    });

    it('confirm button has proper type attribute', () => {
      render(<PreviewTopUp {...createMockProps()} />);

      const confirmButton = screen.getByTestId(
        'pulse-preview-topup-confirm-button'
      );
      expect(confirmButton).toHaveAttribute('type', 'button');
    });
  });

  describe('null selected token handling', () => {
    it('renders without errors when selectedToken is null', () => {
      render(<PreviewTopUp {...createMockProps({ selectedToken: null })} />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });
});
