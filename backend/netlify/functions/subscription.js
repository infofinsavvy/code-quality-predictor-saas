import { handlers } from '../../src/supabase-server.js';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    let result;
    const path = event.path.replace('/api/v1/subscription/', '');

    switch (path) {
      case 'plans':
        if (event.httpMethod !== 'GET') {
          return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
          };
        }
        result = await handlers.plans(event);
        break;

      case 'create':
        if (event.httpMethod !== 'POST') {
          return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
          };
        }
        result = await handlers.createSubscription(event);
        break;

      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Not found' })
        };
    }

    return {
      ...result,
      headers: { ...headers, ...result.headers }
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};