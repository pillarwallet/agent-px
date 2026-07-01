/* eslint-disable jsx-a11y/label-has-associated-control */
import { useEffect } from 'react';

const EMAIL_OCTOPUS_FORM_ID = '6b7992da-c46a-11f0-9bf4-5919083e820b';

const EmailOctopus = () => {
  // Email Octopus Subscriber Form
  useEffect(() => {
    const container = document.getElementById('octopusForm');
    if (!container) return undefined;

    const existingScript = container.querySelector(
      `script[data-form="${EMAIL_OCTOPUS_FORM_ID}"]`
    );
    if (existingScript) return undefined;

    const script = document.createElement('script');
    script.src = `https://eomail5.com/form/${EMAIL_OCTOPUS_FORM_ID}.js`;
    script.async = true;
    script.setAttribute('data-form', EMAIL_OCTOPUS_FORM_ID);

    container.appendChild(script);
    return undefined;
  }, []);

  return <div id="octopusForm" />;
};

export { EmailOctopus };
