const AI_INSIGHTS_DISCLAIMER_ACCEPTED_KEY =
  'pillarx:aiInsightsDisclaimerAccepted:v1';

export const readAiInsightsDisclaimerAccepted = () => {
  try {
    return (
      window.localStorage.getItem(AI_INSIGHTS_DISCLAIMER_ACCEPTED_KEY) === 'true'
    );
  } catch (error) {
    console.error('Unable to read AI Insights disclaimer acceptance.', error);
    return false;
  }
};

export const writeAiInsightsDisclaimerAccepted = () => {
  try {
    window.localStorage.setItem(AI_INSIGHTS_DISCLAIMER_ACCEPTED_KEY, 'true');
  } catch (error) {
    console.error('Unable to save AI Insights disclaimer acceptance.', error);
  }
};
