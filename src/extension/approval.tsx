import React from 'react';
import ReactDOM from 'react-dom/client';

import ProviderApprovalOverlay from './ProviderApprovalOverlay';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ProviderApprovalOverlay closeWhenSettled standalone />
  </React.StrictMode>
);
