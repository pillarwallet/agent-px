import { useEffect } from 'react';

const UtmTracker = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const hasUtm =
      params.has('utm_source') ||
      params.has('utm_medium') ||
      params.has('utm_campaign');

    // Store only if UTM parameters are available
    if (!hasUtm) return;

    const utm = {
      source: params.get('utm_source'),
      medium: params.get('utm_medium'),
      campaign: params.get('utm_campaign'),
    };

    localStorage.setItem('utm', JSON.stringify(utm));
    localStorage.setItem('utm_ts', Date.now().toString());
  }, []);

  return null;
};

export default UtmTracker;
