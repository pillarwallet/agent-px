/* eslint-disable react/jsx-no-constructed-context-values */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { CloseCircle, DocumentText, Send2 } from 'iconsax-react';
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';

import Button from '../components/Button';

export type WalletApprovalRequest = {
  type: 'transaction' | 'message' | 'typedData';
  title: string;
  description?: string;
  source?: string;
  network?: string;
  account?: string;
  to?: string;
  value?: string;
  assetLogoUrl?: string;
  assetSymbol?: string;
  estimatedFee?: string;
  estimateFee?: () => Promise<string | undefined>;
  data?: string;
  message?: string;
  confirmLabel?: string;
  warning?: string;
};

type PendingApproval = WalletApprovalRequest & {
  id: number;
  resolve: (approved: boolean) => void;
};

type WalletApprovalContextValue = {
  requestApproval: (request: WalletApprovalRequest) => Promise<boolean>;
};

export const WalletApprovalContext =
  createContext<WalletApprovalContextValue | null>(null);

const shorten = (value: string) =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

const WalletApprovalProvider = ({ children }: React.PropsWithChildren) => {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [estimatedFee, setEstimatedFee] = useState<string>();
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  const isEstimatingFeeRef = useRef(false);
  const active = approvals[0];

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      if (!active?.estimateFee || isEstimatingFeeRef.current) return;
      isEstimatingFeeRef.current = true;
      setIsEstimatingFee(true);
      try {
        const nextFee = await active.estimateFee();
        if (!cancelled) setEstimatedFee(nextFee);
      } catch {
        if (!cancelled) setEstimatedFee(undefined);
      } finally {
        isEstimatingFeeRef.current = false;
        if (!cancelled) setIsEstimatingFee(false);
      }
    };

    setEstimatedFee(active?.estimatedFee);
    if (active?.estimateFee) {
      refresh();
      timer = setInterval(refresh, 5_000);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [active]);

  const requestApproval = useCallback(
    (request: WalletApprovalRequest) =>
      new Promise<boolean>((resolve) => {
        setApprovals((current) => [
          ...current,
          { ...request, id: Date.now() + current.length, resolve },
        ]);
      }),
    []
  );

  const settle = (approved: boolean) => {
    if (!active) return;
    active.resolve(approved);
    setApprovals((current) => current.slice(1));
  };

  const contextValue = useMemo(() => ({ requestApproval }), [requestApproval]);
  const dataBytes = active?.data
    ? Math.max(0, (active.data.length - 2) / 2)
    : undefined;
  let approvalIcon = <DocumentText size={26} />;
  if (active?.type === 'transaction') {
    approvalIcon = active.assetLogoUrl ? (
      <AssetLogo
        src={active.assetLogoUrl}
        alt={active.assetSymbol || 'Token'}
      />
    ) : (
      <Send2 size={26} />
    );
  }

  return (
    <WalletApprovalContext.Provider value={contextValue}>
      {children}
      {active && (
        <Overlay role="dialog" aria-modal="true" aria-label={active.title}>
          <Panel>
            <CloseButton
              type="button"
              aria-label="Reject request"
              title="Reject request"
              onClick={() => settle(false)}
            >
              <CloseCircle size={24} />
            </CloseButton>
            <ActionIcon>{approvalIcon}</ActionIcon>
            <Title>{active.title}</Title>
            {active.description && (
              <Description>{active.description}</Description>
            )}
            <Details>
              {active.source && (
                <DetailRow>
                  <DetailLabel>Request from</DetailLabel>
                  <DetailValue>{active.source}</DetailValue>
                </DetailRow>
              )}
              {active.network && (
                <DetailRow>
                  <DetailLabel>Network</DetailLabel>
                  <DetailValue>{active.network}</DetailValue>
                </DetailRow>
              )}
              {active.account && (
                <DetailRow>
                  <DetailLabel>Account</DetailLabel>
                  <DetailValue title={active.account}>
                    {shorten(active.account)}
                  </DetailValue>
                </DetailRow>
              )}
              {active.to && (
                <DetailRow>
                  <DetailLabel>To</DetailLabel>
                  <DetailValue title={active.to}>
                    {shorten(active.to)}
                  </DetailValue>
                </DetailRow>
              )}
              {active.value && (
                <DetailRow>
                  <DetailLabel>Value</DetailLabel>
                  <DetailValue>{active.value}</DetailValue>
                </DetailRow>
              )}
              {(active.estimatedFee || active.estimateFee) && (
                <DetailRow>
                  <DetailLabel>Estimated fee</DetailLabel>
                  <DetailValue>
                    {isEstimatingFee && !estimatedFee
                      ? 'Estimating...'
                      : estimatedFee || 'Unavailable'}
                  </DetailValue>
                </DetailRow>
              )}
              {typeof dataBytes === 'number' && (
                <DetailRow>
                  <DetailLabel>Data</DetailLabel>
                  <DetailValue>{dataBytes} bytes</DetailValue>
                </DetailRow>
              )}
            </Details>
            {active.message && (
              <MessageBox>
                <MessageLabel>Message</MessageLabel>
                <Message>{active.message}</Message>
              </MessageBox>
            )}
            {active.warning && <Warning>{active.warning}</Warning>}
            <Actions>
              <Button $secondary $fullWidth $last onClick={() => settle(false)}>
                Reject
              </Button>
              <Button $fullWidth $last onClick={() => settle(true)}>
                {active.confirmLabel ||
                  (active.type === 'transaction' ? 'Approve' : 'Sign')}
              </Button>
            </Actions>
          </Panel>
        </Overlay>
      )}
    </WalletApprovalContext.Provider>
  );
};

const Overlay = styled.div`
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: stretch;
  padding: 0;
  background: rgba(4, 4, 7, 0.78);
  backdrop-filter: blur(10px);
`;
const Panel = styled.div`
  position: relative;
  width: 100%;
  height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 26px 20px 20px;
  border: 0;
  border-radius: 0;
  background: #141218;
  color: #fff;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
`;
const CloseButton = styled.button`
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #aaa5b1;
  cursor: pointer;
`;
const ActionIcon = styled.div`
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  margin: 8px auto 16px;
  border-radius: 8px;
  background: #241d3a;
  color: #a78bfa;
`;
const AssetLogo = styled.img`
  width: 100%;
  height: 100%;
  border-radius: 8px;
  object-fit: cover;
`;
const Title = styled.h2`
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  text-align: center;
  letter-spacing: 0;
`;
const Description = styled.p`
  margin: 7px auto 0;
  color: #aaa5b1;
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  letter-spacing: 0;
`;
const Details = styled.div`
  margin-top: 22px;
  border-top: 1px solid #2e2a33;
`;
const DetailRow = styled.div`
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid #2e2a33;
`;
const DetailLabel = styled.span`
  color: #918c98;
  font-size: 12px;
`;
const DetailValue = styled.span`
  min-width: 0;
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  font-weight: 650;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const MessageBox = styled.div`
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #302c36;
  border-radius: 7px;
  background: #1b191f;
`;
const MessageLabel = styled.p`
  margin: 0 0 7px;
  color: #918c98;
  font-size: 11px;
`;
const Message = styled.pre`
  min-height: 0;
  flex: 1;
  margin: 0;
  overflow: auto;
  color: #fff;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;
const Warning = styled.p`
  margin: 14px 0 0;
  padding: 10px 11px;
  border: 1px solid #604b25;
  border-radius: 7px;
  background: #2a2115;
  color: #ffd28a;
  font-size: 11px;
  line-height: 1.45;
`;
const Actions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: auto;
  padding-top: 20px;
`;

export default WalletApprovalProvider;
