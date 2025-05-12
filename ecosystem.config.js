// ecosystem.config.js — Configuración PM2 para Chatbot507
module.exports = {
  apps: [{
    name: 'chatbot507',
    script: './index.js',
    // Usa node_args, no interpreter_args
    node_args: '--openssl-legacy-provider',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT,
      SHEET_ID_STATUS: process.env.SHEET_ID_STATUS,
      SHEET_ID_VALIDACION: process.env.SHEET_ID_VALIDACION,
      SHEET_RANGE_STATUS: process.env.SHEET_RANGE_STATUS,
      SHEET_RANGE_VALIDACION: process.env.SHEET_RANGE_VALIDACION,
      GOOGLE_CREDENTIALS_PATH: process.env.GOOGLE_CREDENTIALS_PATH,
      WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
      WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
    }
  }]
};
