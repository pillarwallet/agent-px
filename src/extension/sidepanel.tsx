import { startPillarXBackgroundKeepAlive } from './keepAlive';

window.pillarXExtensionView = 'sidePanel';

startPillarXBackgroundKeepAlive('sidePanel');

import('../main').catch((error) => {
  console.error('Failed to load PillarX side panel entrypoint', error);
});
