// api/create-charge.js
// Vercel Serverless Function — cria cobrança Pix no AbacatePay
// Chamado pelo frontend quando usuário clica em "Assinar Premium"

export default async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, email, name } = req.body;

  if (!uid || !email) {
    return res.status(400).json({ error: 'uid e email são obrigatórios' });
  }

  const ABACATE_KEY = process.env.ABACATE_API_KEY;
  if (!ABACATE_KEY) {
    return res.status(500).json({ error: 'API key não configurada' });
  }

  try {
    // 1. Criar ou buscar cliente no AbacatePay
    const customerRes = await fetch('https://api.abacatepay.com/v1/billing/customer/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ABACATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name:  name || 'Usuário MyDesk',
        email: email,
        // metadata para rastrear qual uid do Firebase
        metadata: { firebaseUid: uid },
      }),
    });

    const customer = await customerRes.json();
    if (!customerRes.ok) {
      console.error('AbacatePay customer error:', customer);
      return res.status(500).json({ error: 'Erro ao criar cliente', details: customer });
    }

    const customerId = customer.data?.id;

    // 2. Criar cobrança Pix de R$10
    const chargeRes = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ABACATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frequency:   'ONE_TIME',
        methods:     ['PIX'],
        customerId:  customerId,
        products: [{
          externalId:  'mydesk-premium-monthly',
          name:        'MyDesk Premium — 1 mês',
          description: 'Notas ilimitadas por 30 dias',
          quantity:    1,
          price:       1000, // centavos = R$10,00
        }],
        metadata: {
          firebaseUid: uid,
        },
        returnUrl:   'https://jvalvim-bit.github.io/mydesk/',
        completionUrl: 'https://jvalvim-bit.github.io/mydesk/?premium=activated',
      }),
    });

    const charge = await chargeRes.json();
    if (!chargeRes.ok) {
      console.error('AbacatePay charge error:', charge);
      return res.status(500).json({ error: 'Erro ao criar cobrança', details: charge });
    }

    // Retorna URL de pagamento e QR Code para o frontend
    return res.status(200).json({
      ok:       true,
      url:      charge.data?.url,
      pixCode:  charge.data?.pixQrCode,
      chargeId: charge.data?.id,
    });

  } catch (err) {
    console.error('create-charge error:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
