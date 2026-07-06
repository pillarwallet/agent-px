import { startPillarXBackgroundKeepAlive } from './keepAlive';

window.pillarXExtensionView = 'popup';

startPillarXBackgroundKeepAlive('popup');

import('../main').catch((error) => {
  console.error('Failed to load PillarX popup entrypoint', error);
});
