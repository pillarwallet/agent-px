const SIGNALS_DISCLAIMER_ACCEPTED_KEY =
  'pillarx:signalsDisclaimerAccepted:v1';

export const readSignalsDisclaimerAccepted = () => {
  try {
    return window.localStorage.getItem(SIGNALS_DISCLAIMER_ACCEPTED_KEY) === 'true';
  } catch (error) {
    console.error('Unable to read Signals disclaimer acceptance.', error);
    return false;
  }
};

export const writeSignalsDisclaimerAccepted = () => {
  try {
    window.localStorage.setItem(SIGNALS_DISCLAIMER_ACCEPTED_KEY, 'true');
  } catch (error) {
    console.error('Unable to save Signals disclaimer acceptance.', error);
  }
};
