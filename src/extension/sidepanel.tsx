import { startPillarXBackgroundKeepAlive } from './keepAlive';

window.pillarXExtensionView = 'sidePanel';
document.documentElement.classList.add('pillarx-extension-shell');

startPillarXBackgroundKeepAlive('sidePanel');

import('../main').catch((error) => {
  console.error('Failed to load PillarX side panel entrypoint', error);
});
