import { startPillarXBackgroundKeepAlive } from './keepAlive';

window.pillarXExtensionView = 'popup';
document.documentElement.classList.add('pillarx-extension-shell');

startPillarXBackgroundKeepAlive('popup');

import('../main').catch((error) => {
  console.error('Failed to load PillarX popup entrypoint', error);
});
