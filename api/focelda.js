// File: api/focelda.js
// Versione con autenticazione Focelda configurata

export default async function handler(req, res) {
  // Abilita CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ===========================
  // CREDENZIALI FOCELDA
  // ===========================
  
  // Basic Authentication - ATTIVA
  const USE_BASIC_AUTH = true;
  const USERNAME = process.env.FOCELDA_USER || 'kenoby@tiscali.it';
  const PASSWORD = process.env.FOCELDA_PASS || 'Foc@9312';
  
  // Altre opzioni - DISATTIVATE (possiamo attivarle se necessario)
  const USE_API_KEY = false;
  const API_KEY = process.env.FOCELDA_API_KEY || '';
  
  const USE_BEARER = false;
  const BEARER_TOKEN = process.env.FOCELDA_TOKEN || '';

  // ===========================

  const FOCELDA_BASE = 'http://195.231.18.146:85/Service.svc';
  
  // Se chiamato senza parametri, mostra info (oscurando le password)
  if (!req.query.endpoint && !req.body?.endpoint) {
    return res.status(200).json({
      status: 'Proxy Focelda Attivo',
      version: '2.1',
      auth: {
        mode: 'Basic Authentication',
        username: USERNAME.substring(0, 3) + '***@' + USERNAME.split('@')[1], // Oscura parzialmente
        configured: true
      },
      endpoints: [
        '/get_articolobyid/{id}',
        '/get_articoli/{timestamp}',
        '/get_caratteristichebyid/{id}',
        '/get_cliente/{cliente}/{articolo}',
        '/get_articolobyofferta/{promo}'
      ],
      test_urls: {
        articolo: 'https://focelda-proxy.vercel.app/api/focelda?endpoint=/get_articolobyid/C13S015336',
        articoli_30giorni: 'https://focelda-proxy.vercel.app/api/focelda?endpoint=/get_articoli/2025-08-01-00.00.00.000000'
      },
      timestamp: new Date().toISOString()
    });
  }

  // Ottieni endpoint
  let endpoint = '';
  if (req.method === 'GET') {
    endpoint = req.query.endpoint || '/get_articolobyid/C13S015336';
  } else if (req.method === 'POST') {
    const body = req.body;
    endpoint = body?.endpoint || '/get_articolobyid/C13S015336';
  }

  const url = FOCELDA_BASE + endpoint;

  // Headers con Basic Auth
  const authString = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  const headers = {
    'Accept': 'application/json, text/xml, application/xml, text/plain, */*',
    'User-Agent': 'Focelda-Proxy/2.1',
    'Authorization': `Basic ${authString}`,
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json'
  };

  console.log('Chiamata a:', url);
  console.log('Con autenticazione Basic per:', USERNAME);

  try {
    // Timeout aumentato a 20 secondi
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    // Esegui richiesta
    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
      signal: controller.signal
    }).catch(fetchError => {
      console.error('Errore fetch:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Timeout: il server non ha risposto entro 20 secondi');
      }
      
      throw new Error(`Errore di rete: ${fetchError.message}`);
    });

    clearTimeout(timeout);

    if (!response) {
      throw new Error('Nessuna risposta dal server');
    }

    // Gestione specifica errori autenticazione
    if (response.status === 401) {
      return res.status(200).json({
        success: false,
        error: 'Autenticazione fallita - Credenziali non valide',
        httpCode: 401,
        message: 'Username o password errati. Verifica le credenziali.',
        credentials_used: {
          username: USERNAME,
          auth_type: 'Basic'
        },
        url: url
      });
    }

    if (response.status === 403) {
      return res.status(200).json({
        success: false,
        error: 'Accesso negato',
        httpCode: 403,
        message: 'Le credenziali sono valide ma non hai permessi per questo endpoint',
        url: url
      });
    }

    // Leggi risposta
    const contentType = response.headers.get('content-type') || 'unknown';
    let text = '';
    
    try {
      text = await response.text();
    } catch (textError) {
      console.error('Errore lettura:', textError);
      text = 'Errore nella lettura della risposta';
    }

    // Log della risposta
    console.log(`Risposta: HTTP ${response.status}, ${text.length} bytes, tipo: ${contentType}`);

    // Determina tipo risposta
    let responseType = 'unknown';
    let parsedData = null;

    // Se è XML (comune per servizi SOAP/WCF)
    if (text.includes('<?xml') || text.includes('<soap:') || text.includes('<s:')) {
      responseType = 'xml/soap';
      
      // Prova a estrarre dati rilevanti da SOAP
      if (text.includes('GetArticoloByIdResponse')) {
        // Estrai il contenuto della risposta SOAP
        const bodyMatch = text.match(/<.*?:Body>([\s\S]*?)<\/.*?:Body>/);
        if (bodyMatch) {
          parsedData = { soapBody: bodyMatch[1] };
        }
      }
      
      // Controlla se c'è un errore SOAP
      if (text.includes('soap:Fault') || text.includes('faultstring')) {
        const faultMatch = text.match(/<faultstring>(.*?)<\/faultstring>/);
        if (faultMatch) {
          parsedData = { soapFault: faultMatch[1] };
        }
      }
    } 
    // Se è JSON
    else if (text.startsWith('{') || text.startsWith('[')) {
      try {
        parsedData = JSON.parse(text);
        responseType = 'json';
      } catch (e) {
        responseType = 'text';
      }
    }
    // Se è HTML (probabilmente pagina di errore)
    else if (text.includes('<html')) {
      responseType = 'html';
      // Estrai titolo se c'è
      const titleMatch = text.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) {
        parsedData = { htmlTitle: titleMatch[1] };
      }
    } 
    // Altrimenti testo semplice
    else {
      responseType = 'text';
    }

    // Costruisci risposta
    const result = {
      success: response.ok,
      httpCode: response.status,
      httpStatus: response.statusText,
      contentType: contentType,
      responseType: responseType,
      url: url,
      endpoint: endpoint,
      data: parsedData,
      raw: text.substring(0, 10000), // Aumentato limite per vedere di più
      preview: text.substring(0, 1000),
      fullLength: text.length,
      timestamp: new Date().toISOString(),
      auth: {
        used: true,
        type: 'Basic',
        username: USERNAME
      }
    };

    // Se la risposta è OK ma vuota
    if (response.ok && text.length === 0) {
      result.warning = 'Risposta vuota dal server - potrebbe essere normale per questo endpoint';
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Errore completo:', error);
    
    return res.status(200).json({
      success: false,
      error: error.message || 'Errore sconosciuto',
      errorType: error.name || 'UnknownError',
      url: url,
      endpoint: endpoint,
      timestamp: new Date().toISOString(),
      auth: {
        attempted: true,
        type: 'Basic',
        username: USERNAME
      },
      suggestion: 'Se il timeout persiste, il servizio potrebbe essere offline o le credenziali potrebbero essere errate'
    });
  }
}

/*
===========================================
ISTRUZIONI PER IL DEPLOY
===========================================

1. AGGIORNAMENTO IMMEDIATO (su GitHub):
   - Sostituisci TUTTO il contenuto di api/focelda.js con questo codice
   - Commit con messaggio "Add authentication"
   - Vercel farà il deploy automatico in 30 secondi

2. PER MAGGIORE SICUREZZA (consigliato):
   Dopo il test, sposta le credenziali in variabili d'ambiente:
   
   a. Vai su https://vercel.com/dashboard
   b. Seleziona il progetto focelda-proxy
   c. Settings → Environment Variables
   d. Aggiungi:
      FOCELDA_USER = kenoby@tiscali.it
      FOCELDA_PASS = Foc@9312
   e. Nel codice, rimuovi i valori hardcoded lasciando solo:
      const USERNAME = process.env.FOCELDA_USER;
      const PASSWORD = process.env.FOCELDA_PASS;

3. TEST IMMEDIATO:
   Dopo il deploy, vai su:
   https://focelda-proxy.vercel.app/api/focelda
   
   Dovresti vedere le info del proxy con auth configurata.

4. TEST ARTICOLO:
   https://focelda-proxy.vercel.app/api/focelda?endpoint=/get_articolobyid/C13S015336

===========================================
*/
