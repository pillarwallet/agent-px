import { useContext } from 'react';

import { CreateAlertContext } from '../providers/CreateAlertProvider';

const useCreateAlert = () => {
  const context = useContext(CreateAlertContext);
  if (!context) throw new Error('No parent <CreateAlertProvider />');
  return context;
};

export default useCreateAlert;
