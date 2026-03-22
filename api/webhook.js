// api/webhook.js
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

function getFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return getDatabase();
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-webhook-secret'] || req.query.secret;
  if (token !== process.env.WEBHOOK_SECRET) {
    console.warn('Token inválido');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body;
  console.log('Webhook:', JSON.stringify(event));

  const isPaid = (
    event?.event === 'billing.paid' ||
    event?.data?.status === 'PAID' ||
    event?.data?.status === 'COMPLETED'
  );

  if (!isPaid) return res.status(200).json({ ok: true, ignored: true });

  const uid = event?.data?.metadata?.firebaseUid;
  if (!uid) return res.status(400).json({ error: 'firebaseUid não encontrado' });

  try {
    const db = getFirebase();
    const now = Date.now();
    const planExpiresAt = now + (30 * 24 * 60 * 60 * 1000);
    const currentYM = new Date().toISOString().slice(0, 7);

    await db.ref(`users/${uid}/plan`).update({
      plan: 'premium',
      planExpiresAt,
      planActivatedAt: now,
      lastChargeId: event?.data?.id || null,
      notesCreatedThisMonth: 0,
      lastReset: currentYM,
    });

    console.log(`Premium ativado: ${uid}`);
    return res.status(200).json({ ok: true, uid, planExpiresAt });

  } catch (err) {
    console.error('Firebase error:', err);
    return res.status(500).json({ error: 'Erro Firebase', message: err.message });
  }
};

module.exports = handler;
