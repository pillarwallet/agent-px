const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const getCountryFromContext = (context) => {
  const countryFromCf = context.request?.cf?.country;
  if (typeof countryFromCf === 'string' && countryFromCf.trim()) {
    return countryFromCf.trim().toUpperCase();
  }

  const countryFromHeader = context.request.headers.get('CF-IPCountry');
  if (countryFromHeader && countryFromHeader.trim()) {
    return countryFromHeader.trim().toUpperCase();
  }

  return null;
};

export async function onRequestGet(context) {
  const country = getCountryFromContext(context);

  return new Response(
    JSON.stringify({
      country,
    }),
    {
      status: 200,
      headers: jsonHeaders,
    }
  );
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...jsonHeaders,
      'Access-Control-Max-Age': '86400',
    },
  });
}
