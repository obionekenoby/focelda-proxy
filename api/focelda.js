// File: api/focelda.js
// Versione con debug e gestione errori migliorata

export default async function handler(req, res) {
  // Abilita CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Gestisci preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const FOCELDA_BASE = 'http://195.231.18.146:85/Service.svc';
  
  // Se chiamato senza parametri, mostra info debug
  if (!req.query.endpoint && !req.body?.endpoint) {
    return res.status(200).json({
      status: 'Proxy Focelda attivo',
      version: '1.1',
      usage: {
        get: 'https://focelda-proxy.vercel.app/api/focelda?endpoint=/get_articolobyid/C13S015336',
        post: 'POST con body: { "endpoint": "/get_articolobyid/C13S015336" }'
      },
      endpoints: [
        '/get_articolobyid/{id}',
        '/get_articoli/{timestamp}',
        '/get_caratteristichebyid/{id}',
        '/get_cliente/{cliente}/{articolo}',
        '/get_articolobyofferta/{promo}'
      ],
      test_url: FOCELDA_BASE,
      timestamp: new Date().toISOString()
    });
  }

  // Ottieni l'endpoint dalla query o dal body
  let endpoint = '';
  
  if (req.method === 'GET') {
    endpoint = req.query.endpoint || '/get_articolobyid/C13S015336';
  } else if (req.method === 'POST') {
    const body = req.body;
    endpoint = body?.endpoint || '/get_articolobyid/C13S015336';
  }

  // Costruisci URL completo
  const url = FOCELDA_BASE + endpoint;

  // Log per debug
  console.log('Tentativo connessione a:', url);

  try {
    // Timeout controller
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 8000); // 8 secondi timeout

    // Fai la richiesta al server Focelda
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/xml, application/xml, text/plain, */*',
        'User-Agent': 'Vercel-Proxy/1.1',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    }).catch(fetchError => {
      // Gestisci errori di rete specifici
      console.error('Fetch error:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Timeout: il server non ha risposto entro 8 secondi');
      }
      
      if (fetchError.code === 'ECONNREFUSED') {
        throw new Error('Connessione rifiutata: il server potrebbe essere offline');
      }
      
      if (fetchError.code === 'ENOTFOUND') {
        throw new Error('Host non trovato: verificare IP e porta');
      }
      
      throw new Error(`Errore di rete: ${fetchError.message}`);
    });

    clearTimeout(timeout);

    // Se response è undefined (errore di fetch)
    if (!response) {
      throw new Error('Nessuna risposta dal server');
    }

    // Ottieni la risposta come testo
    const contentType = response.headers.get('content-type') || 'unknown';
    let text = '';
    
    try {
      text = await response.text();
    } catch (textError) {
      console.error('Errore lettura risposta:', textError);
      text = 'Errore nella lettura della risposta';
    }

    // Determina il tipo di risposta
    let responseType = 'unknown';
    let parsedData = null;

    // Prova a identificare il tipo
    if (text.includes('<?xml')) {
      responseType = 'xml';
    } else if (text.includes('<html')) {
      responseType = 'html';
    } else if (text.startsWith('{') || text.startsWith('[')) {
      try {
        parsedData = JSON.parse(text);
        responseType = 'json';
      } catch (e) {
        responseType = 'text';
      }
    } else {
      responseType = 'text';
    }

    // Log risposta per debug
    console.log('Risposta ricevuta:', {
      status: response.status,
      contentType: contentType,
      responseType: responseType,
      textLength: text.length
    });

    // Restituisci risposta strutturata
    const result = {
      success: response.ok,
      httpCode: response.status,
      httpStatus: response.statusText,
      contentType: contentType,
      responseType: responseType,
      url: url,
      data: parsedData,
      raw: text.substring(0, 5000), // Limita a 5000 caratteri
      preview: text.substring(0, 500),
      fullLength: text.length,
      timestamp: new Date().toISOString(),
      debug: {
        endpoint: endpoint,
        base: FOCELDA_BASE,
        method: req.method
      }
    };

    // Se è un errore HTTP, aggiungi info
    if (!response.ok) {
      result.httpError = true;
      result.errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }

    return res.status(200).json(result);

  } catch (error) {
    // Log errore completo
    console.error('Errore completo:', error);
    
    // Gestione errori dettagliata
    const errorResponse = {
      success: false,
      error: error.message || 'Errore sconosciuto',
      errorType: error.name || 'UnknownError',
      url: url,
      endpoint: endpoint,
      timestamp: new Date().toISOString(),
      debug: {
        stack: error.stack,
        base: FOCELDA_BASE,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      }
    };

    // Test di connettività base
    try {
      // Prova a fare ping a un servizio noto per verificare internet
      const testResponse = await fetch('https://api.github.com', {
        method: 'HEAD'
      });
      errorResponse.internetConnection = testResponse.ok ? 'OK' : 'Problematica';
    } catch (testError) {
      errorResponse.internetConnection = 'Non disponibile';
    }

    return res.status(200).json(errorResponse); // 200 invece di 500 per vedere l'errore
  }
}
