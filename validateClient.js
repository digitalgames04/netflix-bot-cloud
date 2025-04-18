const { GoogleSpreadsheet } = require('google-spreadsheet');

module.exports = async function validateClient(phone) {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS); // 👈 Esta línea es clave
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle['Base_Clientes_Activos'];
  const rows = await sheet.getRows();

  for (let row of rows) {
    if (row.NumeroCliente && row.NumeroCliente.toString().includes(phone)) {
      const estado = (row.Estado || '').toLowerCase();
      return {
        active: estado.includes("verde") || estado.includes("activo"),
        name: row.Nombre || 'cliente'
      };
    }
  }

  return { active: false };
};
