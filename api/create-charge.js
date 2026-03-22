// api/create-charge.js
const handler = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, email, name } = req.body || {};
  if (!uid || !email) return res.status(400).json({ error: 'uid e email obrigatórios' });

  const ABACATE_KEY = process.env.ABACATE_API_KEY;
  if (!ABACATE_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const BASE = 'https://api.abacatepay.com/v1';
  const headers = {
    'Authorization': `Bearer ${ABACATE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Criar cliente
    const customerRes = await fetch(`${BASE}/customer/create`, {
      method: 'POST', headers,
      body: JSON.stringify({
        metadata: { name: name || 'Usuário MyDesk', email, cellphone: '', taxId: '' },
      }),
    });
    const customerData = await customerRes.json();
    console.log('Customer:', JSON.stringify(customerData));
    if (!customerRes.ok) return res.status(500).json({ error: 'Erro cliente', details: customerData });

    const customerId = customerData.data?.id;

    // 2. Criar cobrança
    const chargeRes = await fetch(`${BASE}/billing/create`, {
      method: 'POST', headers,
      body: JSON.stringify({
        frequency: 'ONE_TIME',
        methods: ['PIX'],
        customerId,
        products: [{
          externalId: 'mydesk-premium-monthly',
          name: 'MyDesk Premium — 1 mês',
          description: 'Notas ilimitadas por 30 dias',
          quantity: 1,
          price: 1000,
        }],
        metadata: { firebaseUid: uid },
        returnUrl: 'https://jvalvim-bit.github.io/mydesk/',
        completionUrl: 'https://jvalvim-bit.github.io/mydesk/?premium=activated',
      }),
    });
    const chargeData = await chargeRes.json();
    console.log('Charge:', JSON.stringify(chargeData));
    if (!chargeRes.ok) return res.status(500).json({ error: 'Erro cobrança', details: chargeData });

    const billId  = chargeData.data?.id;
    const billUrl = chargeData.data?.url;

    // 3. QR Code Pix
    let pixCode = null;
    try {
      const qrRes  = await fetch(`${BASE}/pixQrCode/create`, {
        method: 'POST', headers,
        body: JSON.stringify({ billingId: billId }),
      });
      const qrData = await qrRes.json();
      console.log('QR:', JSON.stringify(qrData));
      pixCode = qrData.data?.brCode || qrData.data?.pixCode || qrData.data?.qrCode || null;
    } catch(e) { console.warn('QR failed:', e.message); }

    return res.status(200).json({ ok: true, url: billUrl, pixCode, chargeId: billId });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
};

module.exports = handler;
