// api/webhook.js
// Vercel Serverless Function — recebe webhook do AbacatePay
// Quando o Pix é pago, ativa o Premium automaticamente no Firebase

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Inicializa Firebase Admin (server-side, com privilégios totais)
function getFirebase() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId:    process.env.FIREBASE_PROJECT_ID,
        clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return getDatabase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar token secreto do webhook (segurança)
  const token = req.headers['x-webhook-secret'] || req.query.secret;
  if (token !== process.env.WEBHOOK_SECRET) {
    console.warn('Webhook com token inválido');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body;
  console.log('Webhook recebido:', JSON.stringify(event, null, 2));

  // Processar apenas pagamentos confirmados
  const isPaid = (
    event?.event === 'BILLING.PAID' ||
    event?.data?.status === 'PAID' ||
    event?.data?.status === 'COMPLETED'
  );

  if (!isPaid) {
    console.log('Evento ignorado — status:', event?.data?.status);
    return res.status(200).json({ ok: true, ignored: true });
  }

  // Extrair uid do Firebase da metadata
  const uid = event?.data?.metadata?.firebaseUid;
  if (!uid) {
    console.error('uid não encontrado no webhook:', event);
    return res.status(400).json({ error: 'firebaseUid não encontrado na metadata' });
  }

  try {
    const db = getFirebase();

    // Calcular expiração: 30 dias a partir de agora
    const now            = Date.now();
    const planExpiresAt  = now + (30 * 24 * 60 * 60 * 1000); // +30 dias em ms
    const currentYM      = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // Atualizar plano no Firebase
    await db.ref(`users/${uid}/plan`).update({
      plan:                   'premium',
      planExpiresAt:          planExpiresAt,
      planActivatedAt:        now,
      lastChargeId:           event?.data?.id || null,
      notesCreatedThisMonth:  0,
      lastReset:              currentYM,
    });

    console.log(`✅ Premium ativado para uid: ${uid} — expira em: ${new Date(planExpiresAt).toISOString()}`);
    return res.status(200).json({ ok: true, uid, planExpiresAt });

  } catch (err) {
    console.error('Erro ao atualizar Firebase:', err);
    return res.status(500).json({ error: 'Erro ao ativar Premium', message: err.message });
  }
}
