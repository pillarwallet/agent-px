import React from 'react';
import logoImage from './algo-insights-logo.png';

const AlgoInsightsLogo: React.FC = () => {
    return (
        <img
            src={logoImage}
            alt="Algo Insights Logo"
            width="60"
            height="60"
            style={{ display: 'block' }}
        />
    );
};

export default AlgoInsightsLogo;
