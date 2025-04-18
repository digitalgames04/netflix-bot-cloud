const express = require('express');
const dotenv = require('dotenv');
const validateClient = require('./validateClient');
dotenv.config();

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const from = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;

  if (!from || !message) return res.sendStatus(400);

  const clientStatus = await validateClient(from);
  if (!clientStatus.active) {
    return res.send({
      message: `😕 Tu número no está activo. Contacta a soporte: ${process.env.SUPPORT_LINK}`
    });
  }

  return res.send({
    message: `👋 Hola ${clientStatus.name}, ¿cómo podemos ayudarte hoy?

1️⃣ Info de mis cuentas
2️⃣ Solicitar código`
  });
});

app.get('/', (req, res) => {
  res.send('Bot Netflix funcionando');
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Bot corriendo en puerto " + (process.env.PORT || 3000));
});
