import React from 'react';
import logoImage from './algo-insights-logo.png';

const AlgoInsightsLogo: React.FC = () => {
  return (
    <img
      src={logoImage}
      alt="Algo Insights Logo"
      className="block w-[60px] h-[60px]"
    />
  );
};

export default AlgoInsightsLogo;
