export default async function handler(req, res) {
  // Abilita CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const FOCELDA_BASE = 'http://195.231.18.146:85/Service.svc';
  
  // Ottieni endpoint
  let endpoint = '';
  if (req.method === 'GET') {
    endpoint = req.query.endpoint || '/get_articolobyid/C13S015336';
  } else if (req.method === 'POST') {
    const body = req.body;
    endpoint = body.endpoint || '/get_articolobyid/C13S015336';
  }

  const url = FOCELDA_BASE + endpoint;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/xml, */*',
        'User-Agent': 'Vercel-Proxy/1.0'
      }
    });

    const text = await response.text();
    let responseType = 'text';
    let parsedData = null;

    if (text.includes('
            
