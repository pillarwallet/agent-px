import { useContext } from 'react';

import { WalletApprovalContext } from '../providers/WalletApprovalProvider';

const useWalletApproval = () => {
  const context = useContext(WalletApprovalContext);
  if (!context) throw new Error('No parent <WalletApprovalProvider />');
  return context;
};

export default useWalletApproval;
