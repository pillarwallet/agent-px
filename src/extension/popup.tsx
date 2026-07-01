window.pillarXExtensionView = 'popup';

import('../main').catch((error) => {
  console.error('Failed to load PillarX popup entrypoint', error);
});
