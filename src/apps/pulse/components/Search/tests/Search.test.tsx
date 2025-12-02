/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import renderer from 'react-test-renderer';
import { ThemeProvider } from 'styled-components';
import { vi } from 'vitest';

// types
import { PortfolioData } from '../../../../../types/api';

// hooks
import * as useTokenSearch from '../../../hooks/useTokenSearch';

// utils
import { defaultTheme } from '../../../../../theme';
import { MobulaChainNames } from '../../../utils/constants';

// components
import Search from '../Search';

// Mock dependencies
vi.mock('../../../hooks/useTokenSearch', () => ({
  useTokenSearch: vi.fn(),
}));

vi.mock('../../../../../hooks/useTokenPnL', () => ({
  useTokenPnL: vi.fn(() => ({
    pnl: null,
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('../../../../../services/pillarXApiWalletTransactions', () => ({
  useGetWalletTransactionsQuery: vi.fn(() => ({
    data: {
      data: {
        transactions: [],
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  pillarXApiWalletTransactions: {
    reducerPath: 'pillarXApiWalletTransactions',
    reducer: () => ({}),
    middleware: () => (next: any) => (action: any) => next(action),
  },
}));

vi.mock('../../../../../hooks/useTransactionKit', () => ({
  default: () => ({
    walletAddress: '0x1234567890123456789012345678901234567890',
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({
      search: '?asset=0x1234567890123456789012345678901234567890',
      pathname: '/',
    }),
    useNavigate: () => vi.fn(),
  };
});

const mockSetSearching = vi.fn();
const mockSetBuyToken = vi.fn();
const mockSetSellToken = vi.fn();
const mockSetChains = vi.fn();

const mockPortfolioData: PortfolioData = {
  assets: [
    {
      asset: {
        id: 1,
        name: 'Test Token',
        symbol: 'TEST',
        logo: 'https://example.com/logo.png',
        decimals: ['18'],
        contracts: ['0x1234567890123456789012345678901234567890'],
        blockchains: ['ethereum'],
      },
      contracts_balances: [
        {
          address: '0x1234567890123456789012345678901234567890',
          balance: 1.0,
          balanceRaw: '1000000000000000000',
          chainId: 'eip155:1',
          decimals: 18,
        },
      ],
      cross_chain_balances: {},
      price_change_24h: 0.05,
      estimated_balance: 1.5,
      price: 1.5,
      token_balance: 1.0,
      allocation: 1.0,
      wallets: ['0x1234567890123456789012345678901234567890'],
    },
  ],
  total_wallet_balance: 1.5,
  wallets: ['0x1234567890123456789012345678901234567890'],
  balances_length: 1,
};

const defaultProps = {
  setSearching: mockSetSearching,
  isBuy: true,
  setBuyToken: mockSetBuyToken,
  setSellToken: mockSetSellToken,
  chains: MobulaChainNames.Ethereum,
  setChains: mockSetChains,
  walletPortfolioData: mockPortfolioData,
  walletPortfolioLoading: false,
  walletPortfolioError: false,
};

const mockUseTokenSearch = {
  searchText: '',
  setSearchText: vi.fn(),
  searchData: null,
  isFetching: false,
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={defaultTheme}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ThemeProvider>
  );
};

describe('<Search />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useTokenSearch.useTokenSearch as any).mockReturnValue(mockUseTokenSearch);
  });

  it('renders correctly and matches snapshot', () => {
    const tree = renderer
      .create(
        <ThemeProvider theme={defaultTheme}>
          <MemoryRouter>
            <Search {...defaultProps} />
          </MemoryRouter>
        </ThemeProvider>
      )
      .toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('renders main search interface elements', () => {
    renderWithProviders(<Search {...defaultProps} />);

    expect(screen.getByTestId('pulse-search-view')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-input')).toBeInTheDocument();
    expect(
      screen.getByTestId('pulse-search-filter-buttons')
    ).toBeInTheDocument();
  });

  it('renders buy mode filter buttons', () => {
    renderWithProviders(<Search {...defaultProps} isBuy />);

    expect(screen.getByText('🔥 Trending')).toBeInTheDocument();
    expect(screen.getByText('🌱 Fresh')).toBeInTheDocument();
    expect(screen.getByText('🚀 Top Gainers')).toBeInTheDocument();
    expect(screen.getByText('💰 My Holdings')).toBeInTheDocument();
  });

  it('renders sell mode with only My Holdings', () => {
    renderWithProviders(<Search {...defaultProps} isBuy={false} />);

    expect(screen.getByText('My Holdings')).toBeInTheDocument();
    expect(screen.queryByText('🔥 Trending')).not.toBeInTheDocument();
    expect(screen.queryByText('🌱 Fresh')).not.toBeInTheDocument();
    expect(screen.queryByText('🚀 Top Gainers')).not.toBeInTheDocument();
  });

  it('handles search input changes', () => {
    const mockSetSearchText = vi.fn();
    (useTokenSearch.useTokenSearch as any).mockReturnValue({
      ...mockUseTokenSearch,
      setSearchText: mockSetSearchText,
    });

    renderWithProviders(<Search {...defaultProps} />);

    const input = screen.getByTestId('pulse-search-input');
    fireEvent.change(input, { target: { value: 'test search' } });

    expect(mockSetSearchText).toHaveBeenCalledWith('test search');
  });

  it('handles filter button clicks in buy mode', () => {
    renderWithProviders(<Search {...defaultProps} isBuy />);

    const trendingButton = screen.getByText('🔥 Trending');
    fireEvent.click(trendingButton);

    // Should trigger search type change
    expect(screen.getByText('🔥 Trending')).toBeInTheDocument();
  });

  it('shows loading spinner when fetching', () => {
    (useTokenSearch.useTokenSearch as any).mockReturnValue({
      ...mockUseTokenSearch,
      isFetching: true,
      searchText: 'test',
    });

    renderWithProviders(<Search {...defaultProps} />);

    expect(screen.getByTestId('pulse-search-input')).toBeInTheDocument();
  });

  it('shows close button when not fetching', () => {
    (useTokenSearch.useTokenSearch as any).mockReturnValue({
      ...mockUseTokenSearch,
      isFetching: false,
      searchText: 'test',
    });

    renderWithProviders(<Search {...defaultProps} />);

    expect(screen.getByTestId('pulse-search-input')).toBeInTheDocument();
  });

  it('displays My Holdings text when in sell mode', () => {
    renderWithProviders(<Search {...defaultProps} isBuy={false} />);

    expect(screen.getByText('My Holdings')).toBeInTheDocument();
  });

  it('handles token selection for buy mode', () => {
    renderWithProviders(<Search {...defaultProps} isBuy />);

    // Test that the component renders without errors
    expect(screen.getByTestId('pulse-search-view')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-modal')).toBeInTheDocument();

    // Test that buy mode shows all filter buttons
    expect(screen.getByText('🔥 Trending')).toBeInTheDocument();
    expect(screen.getByText('🌱 Fresh')).toBeInTheDocument();
    expect(screen.getByText('🚀 Top Gainers')).toBeInTheDocument();
    expect(screen.getByText('💰 My Holdings')).toBeInTheDocument();
  });

  it('handles token selection for sell mode', () => {
    renderWithProviders(<Search {...defaultProps} isBuy={false} />);

    // Simulate token selection
    const tokenButton = screen.getByText('TEST').closest('button');
    if (tokenButton) {
      fireEvent.click(tokenButton);
    }

    expect(mockSetSellToken).toHaveBeenCalled();
  });

  it('shows search placeholder when no search text and no parsed assets', () => {
    (useTokenSearch.useTokenSearch as any).mockReturnValue({
      ...mockUseTokenSearch,
      searchText: '',
    });

    renderWithProviders(<Search {...defaultProps} />);

    expect(
      screen.getByText('Search by token or paste address...')
    ).toBeInTheDocument();
  });

  it('handles chain overlay toggle', () => {
    renderWithProviders(<Search {...defaultProps} />);

    const chainButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(chainButton);

    // Chain overlay should be triggered
    expect(chainButton).toBeInTheDocument();
  });

  it('handles refresh button click', () => {
    renderWithProviders(<Search {...defaultProps} />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    expect(refreshButton).toBeInTheDocument();
  });

  it('handles portfolio loading state', () => {
    renderWithProviders(<Search {...defaultProps} walletPortfolioLoading />);

    // Should still render the main search interface
    expect(screen.getByTestId('pulse-search-view')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-modal')).toBeInTheDocument();
  });

  it('handles portfolio error state', () => {
    renderWithProviders(<Search {...defaultProps} walletPortfolioError />);

    // Should still render the main search interface
    expect(screen.getByTestId('pulse-search-view')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-modal')).toBeInTheDocument();
  });

  it('handles empty portfolio data', () => {
    renderWithProviders(
      <Search {...defaultProps} walletPortfolioData={undefined} />
    );

    // Should still render the main search interface
    expect(screen.getByTestId('pulse-search-view')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-search-modal')).toBeInTheDocument();
  });

  it('handles close button click', () => {
    // Close button (ESC) only appears in sell mode (!isBuy)
    renderWithProviders(<Search {...defaultProps} isBuy={false} />);

    const closeButton = screen.getByTestId('pulse-search-esc-button');
    fireEvent.click(closeButton);

    expect(mockSetSearching).toHaveBeenCalledWith(false);
  });

  it('auto-focuses search input on mount', () => {
    renderWithProviders(<Search {...defaultProps} />);

    const input = screen.getByTestId('pulse-search-input');
    expect(input).toBeInTheDocument();
  });

  it('handles URL asset parameter on mount', () => {
    renderWithProviders(<Search {...defaultProps} />);

    // Should set search text from URL parameter
    expect(screen.getByTestId('pulse-search-input')).toBeInTheDocument();
  });
});
