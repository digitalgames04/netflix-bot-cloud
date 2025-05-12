require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fetch = require('node-fetch');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// Configuración .env
const PORT                   = (process.env.PORT || '3000').trim();
const WEBHOOK_VERIFY_TOKEN   = process.env.WEBHOOK_VERIFY_TOKEN.trim();
const WHATSAPP_TOKEN         = process.env.WHATSAPP_TOKEN.trim();
const PHONE_NUMBER_ID        = process.env.PHONE_NUMBER_ID.trim();
const SHEET_ID_STATUS        = process.env.SHEET_ID_STATUS.trim();
const SHEET_NAME_STATUS      = process.env.SHEET_NAME_STATUS.trim();
const SHEET_NAME_LOG         = process.env.SHEET_NAME_LOG.trim();
const SHEET_NAME_EMAILS      = process.env.SHEET_NAME_EMAILS.trim();
const SHEET_NAME_ACCOUNTS    = process.env.SHEET_NAME_ACCOUNTS.trim();
const GOOGLE_CREDENTIALS_PATH= process.env.GOOGLE_CREDENTIALS_PATH.trim();
const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, GMAIL_REFRESH_TOKEN } = process.env;

// Verificar credenciales de Google
if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
  console.error('No se encontró ruta de credenciales: ' + GOOGLE_CREDENTIALS_PATH);
  process.exit(1);
}

async function initSheets() {
  const creds = require(GOOGLE_CREDENTIALS_PATH);
  const doc = new GoogleSpreadsheet(SHEET_ID_STATUS);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheetStatus   = doc.sheetsByTitle[SHEET_NAME_STATUS];
  const sheetLog      = doc.sheetsByTitle[SHEET_NAME_LOG];
  const sheetEmails   = doc.sheetsByTitle[SHEET_NAME_EMAILS];
  const sheetAccounts = doc.sheetsByTitle[SHEET_NAME_ACCOUNTS];
  if (!sheetStatus || !sheetLog || !sheetEmails || !sheetAccounts) {
    console.error('Faltan pestañas en Google Sheets');
    process.exit(1);
  }
  return { sheetStatus, sheetLog, sheetEmails, sheetAccounts };
}

// Inicializar Gmail
const oAuth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// Estados de flujo
const waitingForEmail    = {};
const validatingEmail    = {};
const waitingForRetry    = {};
const lastMessageTime    = {};
const conversationClosed = {};

async function sendMessage(to, body, type = 'text', interactive = null) {
  const payload = { messaging_product:'whatsapp', to };
  if (type === 'text') payload.text = { body };
  else { payload.type='interactive'; payload.interactive=interactive; }
  await fetch(`https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages?access_token=${WHATSAPP_TOKEN}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
  });
}

async function logMessage(sheetLog, from, type, body) {
  await sheetLog.addRow({ Timestamp: new Date().toISOString(), From: from, Type: type, Body: body });
}

async function handleMessage(m, sheets) {
  const { sheetStatus, sheetLog, sheetEmails } = sheets;
  const from = m.from?.trim(); if (!from) return;
  const now = Date.now();
  // reinicio inactividad
  if (conversationClosed[from] && now - conversationClosed[from] > 0) delete conversationClosed[from];
  if (lastMessageTime[from] && now - lastMessageTime[from] > 5*60*1000 && !conversationClosed[from]) {
    const reminder = '⌛ Hola, parece que estuviste inactivo. ¿Sigues ahí? 🤖✨';
    await sendMessage(from, reminder); await logMessage(sheetLog, from,'outgoing', reminder);
    conversationClosed[from]=now; delete waitingForEmail[from]; delete validatingEmail[from]; delete waitingForRetry[from];
  }
  lastMessageTime[from]=now;

  const msgType = m.type;
  const text = m.text?.body?.trim()||'';
  // gracias
  if (msgType==='text'&&/gracias/i.test(text)){
    const out='¡Con gusto! 😊 Aquí estoy. 🤖';
    await sendMessage(from,out); await logMessage(sheetLog,from,'outgoing',out);
    conversationClosed[from]=now; delete waitingForEmail[from]; delete validatingEmail[from]; delete waitingForRetry[from];
    return;
  }
  if (conversationClosed[from]) return;
  await logMessage(sheetLog,from,msgType,text);

  // validar cliente
  const statusRows = await sheetStatus.getRows();
  const client = statusRows.find(r => r.WhatsApp.trim()===from && r.Estado.trim().toUpperCase()==='VERDE');
  if(!client){ const err='⚠️ No pudimos validar tu acceso.'; await sendMessage(from,err); await logMessage(sheetLog,from,'outgoing',err); return; }

  // validando correo en curso
  if(validatingEmail[from]){
    if(text&&!waitingForRetry[from]){
      const msg='🔄 Validando tu correo, espera…'; await sendMessage(from,msg); await logMessage(sheetLog,from,'outgoing',msg);
      waitingForRetry[from]=true;
    }
    return;
  }

  // flujo correo
  if(waitingForEmail[from]){
    const servicio = waitingForEmail[from];
    const rx = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if(!rx.test(text)){
      const inv='❌ Correo inválido.'; await sendMessage(from,inv); await logMessage(sheetLog,from,'outgoing',inv); return;
    }
    const emailRows = await sheetEmails.getRows();
    const exists = emailRows.some(r=>r.Email?.trim().toLowerCase()===text.toLowerCase());
    if(!exists){ const nf='⚠️ Correo no registrado.'; await sendMessage(from,nf); await logMessage(sheetLog,from,'outgoing',nf); return; }
    delete waitingForEmail[from]; validatingEmail[from]=servicio;

    // mensajes previos
    await sendMessage(from,'🎉 ¡Genial!');
    await sendMessage(from,'⏳ Tu solicitud está en proceso…');
    await sendMessage(from,'🎊 ¡Correo validado correctamente! 😎✅');

    // delay
    const msgGetting = servicio==='codigo_unico_disney'
      ? '⏳ Obteniendo tu Código…'
      : '⏳ Obteniendo tu enlace…';
    await sendMessage(from,msgGetting);
    await new Promise(r=>setTimeout(r,3000));

    // caso Disney+
    if(servicio==='codigo_unico_disney'){
      const subjectQuery='from:disneyplus@trx.mail2.disneyplus.com subject:"Tu código de acceso único para Disney+"';
      const listRes = await gmail.users.messages.list({userId:'me',q:subjectQuery,maxResults:5});
      let code=null;
      if(listRes.data.messages?.length){
        const infos = await Promise.all(listRes.data.messages.map(async msg=>{
          const meta=await gmail.users.messages.get({userId:'me',id:msg.id,format:'metadata',metadataHeaders:['Date']});
          return {id:msg.id, date:new Date(meta.data.payload.headers.find(h=>h.name==='Date').value)};
        }));
        infos.sort((a,b)=>b.date-a.date);
        const full=await gmail.users.messages.get({userId:'me',id:infos[0].id,format:'full'});
        const html=(function extract(parts){
          for(const p of parts||[]){
            if(p.mimeType==='text/html'&&p.body?.data) return Buffer.from(p.body.data,'base64').toString('utf8');
            if(p.parts){const r=extract(p.parts); if(r) return r;}
          }
        })(full.data.payload.parts);
        const mCode = html.match(/(\d{6})/);
        if(mCode) code=mCode[1];
      }
      const out = code
        ? `✅🫶🏻😎 Aquí tienes tu Código 👉 ${code} 🎉 ¡Que disfrutes tu película! 🎬🍿`
        : '⚠️ No pude encontrar tu código. Inténtalo luego.';
      await sendMessage(from,out);
      await sendMessage(from,'¿Hay algo más en lo que pueda ayudarte? 🤖✨');
      delete validatingEmail[from]; delete waitingForRetry[from];
      return;
    }

    // caso Netflix temporal/actualizar
    // ... tu lógica existente para Netflix aquí ...
    delete validatingEmail[from]; delete waitingForRetry[from];
    return;
  }

  // flujos interactivos y menú inicial
  // ... tu código existente para list_reply y button_reply ...
}

// arranque servidor
initSheets().then(sheets=>{
  app.get('/webhook',(req,res)=>{
    if(req.query['hub.verify_token']===WEBHOOK_VERIFY_TOKEN) return res.send(req.query['hub.challenge']);
    res.sendStatus(403);
  });
  app.post('/webhook',async(req,res)=>{res.sendStatus(200);
    const msgs=req.body.entry?.[0]?.changes?.[0]?.value?.messages||[];
    for(const m of msgs) await handleMessage(m,sheets);
  });
  app.listen(PORT,()=>console.log(`Servidor corriendo en puerto ${PORT}`));
});

