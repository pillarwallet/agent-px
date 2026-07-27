import { Add } from 'iconsax-react';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { isAddress } from 'viem';

import { CompatibleChains } from '../../../../utils/blockchain';
import {
  CustomChainToken,
  fetchChainIdFromRpc,
  fetchErc20TokenMetadata,
  readCustomChains,
  upsertCustomChain,
} from '../../../../utils/customChains';

type CustomChainFormProps = {
  onCancel: () => void;
  onChainAdded: () => void;
};

const CustomChainForm = ({ onCancel, onChainAdded }: CustomChainFormProps) => {
  const [rpcUrl, setRpcUrl] = useState('');
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [chainIdError, setChainIdError] = useState('');
  const [isFetchingChainId, setIsFetchingChainId] = useState(false);
  const [chainName, setChainName] = useState('');
  const [nativeTokenDecimals, setNativeTokenDecimals] = useState('18');
  const [nativeTokenSymbol, setNativeTokenSymbol] = useState('');
  const [bundlerUrl, setBundlerUrl] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokens, setTokens] = useState<CustomChainToken[]>([]);
  const [tokenError, setTokenError] = useState('');
  const [formError, setFormError] = useState('');
  const [isFetchingToken, setIsFetchingToken] = useState(false);

  const alreadySupportedChain = useMemo(
    () =>
      chainId
        ? CompatibleChains.find((chain) => chain.chainId === chainId)
        : undefined,
    [chainId]
  );
  const alreadyAddedCustomChain = useMemo(
    () =>
      chainId
        ? readCustomChains().find((chain) => chain.chainId === chainId)
        : undefined,
    [chainId]
  );
  const parsedNativeTokenDecimals = Number(nativeTokenDecimals);
  const isNativeTokenDecimalsValid =
    Number.isInteger(parsedNativeTokenDecimals) &&
    parsedNativeTokenDecimals >= 0 &&
    parsedNativeTokenDecimals <= 36;
  const normalizedNativeTokenSymbol = nativeTokenSymbol.trim().toUpperCase();
  const isNativeTokenSymbolValid =
    normalizedNativeTokenSymbol.length > 0 &&
    normalizedNativeTokenSymbol.length <= 16;
  const canAddChain =
    !!rpcUrl.trim() &&
    !!chainId &&
    !alreadySupportedChain &&
    !!chainName.trim() &&
    isNativeTokenDecimalsValid &&
    isNativeTokenSymbolValid &&
    !isFetchingChainId;

  useEffect(() => {
    const trimmedRpcUrl = rpcUrl.trim();

    setChainId(undefined);
    setChainIdError('');

    if (!trimmedRpcUrl) {
      setIsFetchingChainId(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsFetchingChainId(true);

      fetchChainIdFromRpc(trimmedRpcUrl)
        .then((detectedChainId) => {
          if (cancelled) return;
          setChainId(detectedChainId);
          setChainIdError('');
        })
        .catch((error) => {
          if (cancelled) return;
          setChainId(undefined);
          setChainIdError(
            error instanceof Error
              ? error.message
              : 'Unable to fetch chain id from this RPC URL.'
          );
        })
        .finally(() => {
          if (!cancelled) {
            setIsFetchingChainId(false);
          }
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rpcUrl]);

  useEffect(() => {
    if (!alreadyAddedCustomChain) return;

    setChainName(alreadyAddedCustomChain.chainName);
    setNativeTokenDecimals(String(alreadyAddedCustomChain.nativeTokenDecimals));
    setNativeTokenSymbol(alreadyAddedCustomChain.nativeTokenSymbol);
    setBundlerUrl(alreadyAddedCustomChain.bundlerUrl || '');
    setTokens(alreadyAddedCustomChain.tokens);
  }, [alreadyAddedCustomChain]);

  const handleAddToken = async () => {
    const trimmedTokenAddress = tokenAddress.trim();

    setTokenError('');

    if (!rpcUrl.trim() || !chainId) {
      setTokenError('Enter a working RPC URL before adding token addresses.');
      return;
    }

    if (!isAddress(trimmedTokenAddress)) {
      setTokenError('This is not a valid contract address.');
      return;
    }

    const isDuplicateToken = tokens.some(
      (token) =>
        token.address.toLowerCase() === trimmedTokenAddress.toLowerCase()
    );

    if (isDuplicateToken) {
      setTokenError('This token has already been added.');
      return;
    }

    setIsFetchingToken(true);

    try {
      const tokenMetadata = await fetchErc20TokenMetadata({
        rpcUrl,
        tokenAddress: trimmedTokenAddress,
      });

      setTokens((currentTokens) => [...currentTokens, tokenMetadata]);
      setTokenAddress('');
    } catch {
      setTokenError('This does not look like a valid ERC-20 contract address.');
    } finally {
      setIsFetchingToken(false);
    }
  };

  const handleRemoveToken = (address: string) => {
    setTokens((currentTokens) =>
      currentTokens.filter(
        (token) => token.address.toLowerCase() !== address.toLowerCase()
      )
    );
  };

  const handleAddChain = () => {
    setFormError('');

    if (!canAddChain || !chainId) {
      setFormError('Resolve the chain details before adding this chain.');
      return;
    }

    const now = Date.now();

    upsertCustomChain({
      chainId,
      chainName: chainName.trim(),
      rpcUrl: rpcUrl.trim(),
      nativeTokenDecimals: parsedNativeTokenDecimals,
      nativeTokenSymbol: normalizedNativeTokenSymbol,
      bundlerUrl: bundlerUrl.trim() || undefined,
      gaslessEnabled: Boolean(bundlerUrl.trim()),
      tokens,
      createdAt: alreadyAddedCustomChain?.createdAt || now,
      updatedAt: now,
    });

    onChainAdded();
  };

  return (
    <FormShell>
      <SectionHeader>
        <div>
          <FormTitle>Add custom chain</FormTitle>
          <FormSubtitle>
            Custom chains are stored locally and balances are fetched from the
            RPC URL.
          </FormSubtitle>
        </div>
        <SecondaryButton type="button" onClick={onCancel}>
          Cancel
        </SecondaryButton>
      </SectionHeader>

      <FieldGroup>
        <Label htmlFor="custom-chain-rpc-url">RPC URL</Label>
        <Input
          id="custom-chain-rpc-url"
          value={rpcUrl}
          onChange={(event) => setRpcUrl(event.target.value)}
          placeholder="https://..."
        />
        {isFetchingChainId ? (
          <HelperText>Fetching chain id...</HelperText>
        ) : chainId ? (
          <HelperText>
            Chain ID {chainId}
            {alreadySupportedChain
              ? ` · ${alreadySupportedChain.chainName} is already supported.`
              : ''}
            {alreadyAddedCustomChain ? ' · Saving will update it.' : ''}
          </HelperText>
        ) : chainIdError ? (
          <ErrorText>{chainIdError}</ErrorText>
        ) : null}
      </FieldGroup>

      <FieldGroup>
        <Label htmlFor="custom-chain-name">Chain name</Label>
        <Input
          id="custom-chain-name"
          value={chainName}
          onChange={(event) => setChainName(event.target.value)}
          placeholder="My Chain"
        />
        <HelperText>This name will be used across the wallet UI.</HelperText>
      </FieldGroup>

      <FieldGroup>
        <Label htmlFor="custom-chain-native-decimals">
          Native token decimals
        </Label>
        <Input
          id="custom-chain-native-decimals"
          value={nativeTokenDecimals}
          onChange={(event) => setNativeTokenDecimals(event.target.value)}
          inputMode="numeric"
          placeholder="18"
        />
        {!isNativeTokenDecimalsValid && (
          <ErrorText>Enter a whole number between 0 and 36.</ErrorText>
        )}
      </FieldGroup>

      <FieldGroup>
        <Label htmlFor="custom-chain-native-symbol">Native token symbol</Label>
        <Input
          id="custom-chain-native-symbol"
          value={nativeTokenSymbol}
          onChange={(event) => setNativeTokenSymbol(event.target.value)}
          placeholder="ZTH"
        />
        {isNativeTokenSymbolValid ? (
          <HelperText>
            This symbol will be used for the native balance display.
          </HelperText>
        ) : (
          <ErrorText>
            Enter a token symbol between 1 and 16 characters.
          </ErrorText>
        )}
      </FieldGroup>

      <FieldGroup>
        <Label htmlFor="custom-chain-bundler-url">Bundler URL</Label>
        <Input
          id="custom-chain-bundler-url"
          value={bundlerUrl}
          onChange={(event) => setBundlerUrl(event.target.value)}
          placeholder="Optional"
        />
        <HelperText>
          {bundlerUrl.trim()
            ? 'Gasless can be enabled for this chain.'
            : 'Gasless will be disabled for this chain.'}
        </HelperText>
      </FieldGroup>

      <FieldGroup>
        <Label htmlFor="custom-chain-token-address">Token addresses</Label>
        <InlineControls>
          <Input
            id="custom-chain-token-address"
            value={tokenAddress}
            onChange={(event) => setTokenAddress(event.target.value)}
            placeholder="0x..."
          />
          <IconButton
            type="button"
            onClick={handleAddToken}
            disabled={isFetchingToken}
            aria-label="Add token address"
          >
            <Add size={18} variant="Outline" />
          </IconButton>
        </InlineControls>
        {isFetchingToken ? (
          <HelperText>Fetching token metadata...</HelperText>
        ) : tokenError ? (
          <ErrorText>{tokenError}</ErrorText>
        ) : null}

        {tokens.length > 0 && (
          <TokenList>
            {tokens.map((token) => (
              <TokenRow key={token.address}>
                <TokenInfo>
                  <TokenName>{token.symbol}</TokenName>
                  <TokenMeta>
                    {token.name} · {token.decimals} decimals
                  </TokenMeta>
                  <TokenMeta>
                    {token.address.slice(0, 8)}...{token.address.slice(-6)}
                  </TokenMeta>
                </TokenInfo>
                <SecondaryButton
                  type="button"
                  onClick={() => handleRemoveToken(token.address)}
                >
                  Remove
                </SecondaryButton>
              </TokenRow>
            ))}
          </TokenList>
        )}
      </FieldGroup>

      {formError && <ErrorText>{formError}</ErrorText>}

      <PrimaryButton
        type="button"
        disabled={!canAddChain}
        onClick={handleAddChain}
      >
        {alreadyAddedCustomChain ? 'Update chain' : 'Add chain'}
      </PrimaryButton>
    </FormShell>
  );
};

const FormShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const FormTitle = styled.h2`
  margin: 0;
  color: #ffffff;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.1;
`;

const FormSubtitle = styled.p`
  margin: 8px 0 0;
  color: #a9a0b7;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
`;

const Input = styled.input`
  width: 100%;
  min-width: 0;
  min-height: 44px;
  border: 2px solid #292533;
  border-radius: 12px;
  background: #0d0b12;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  outline: none;
  padding: 0 12px;

  &::placeholder {
    color: #726982;
  }

  &:focus {
    border-color: #6d55d8;
  }
`;

const InlineControls = styled.div`
  display: flex;
  gap: 8px;
`;

const IconButton = styled.button`
  display: flex;
  width: 44px;
  min-width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 2px solid #5d41a8;
  border-radius: 12px;
  background: #2b2143;
  color: #ffffff;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const HelperText = styled.p`
  margin: 0;
  color: #a9a0b7;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
`;

const ErrorText = styled.p`
  margin: 0;
  color: #ff6b8a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
`;

const TokenList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TokenRow = styled.div`
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 2px solid #292533;
  border-radius: 12px;
  background: #0d0b12;
  padding: 10px;
`;

const TokenInfo = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
`;

const TokenName = styled.span`
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.15;
`;

const TokenMeta = styled.span`
  color: #a9a0b7;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
`;

const SecondaryButton = styled.button`
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  border: 2px solid #292533;
  border-radius: 10px;
  background: #17131f;
  color: #d8cdf8;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  padding: 0 12px;
`;

const PrimaryButton = styled.button`
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  border: 2px solid #5d41a8;
  border-radius: 14px;
  background: #6d55d8;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

export default CustomChainForm;
