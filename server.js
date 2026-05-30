require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 Stunde
  max: 5,
  message: { success: false, message: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/submit', submitLimiter, async (req, res) => {
  const { formData, images, honeypot } = req.body;

  // Bot-Schutz: Honeypot-Feld muss leer sein
  if (honeypot) {
    return res.status(400).json({ success: false, message: 'Ungültige Anfrage.' });
  }

  const { personal, fahrzeug, versicherung, unfall, gegner, schaden } = formData;

  const htmlBody = `
    <h2 style="color:#1a56db;">🚗 Neuer KFZ-Schadensfall eingegangen</h2>
    <p>Ein Kunde hat das Schadenformular vollständig ausgefüllt.</p>

    <h3>Persönliche Daten</h3>
    <table border="0" cellpadding="6" style="font-family:sans-serif;font-size:14px;">
      <tr><td><b>Name:</b></td><td>${personal.vorname} ${personal.nachname}</td></tr>
      <tr><td><b>E-Mail:</b></td><td>${personal.email}</td></tr>
      <tr><td><b>Telefon:</b></td><td>${personal.telefon}</td></tr>
      <tr><td><b>Adresse:</b></td><td>${personal.strasse}, ${personal.plz} ${personal.ort}</td></tr>
    </table>

    <h3>Fahrzeugdaten</h3>
    <table border="0" cellpadding="6" style="font-family:sans-serif;font-size:14px;">
      <tr><td><b>Kennzeichen:</b></td><td>${fahrzeug.kennzeichen}</td></tr>
      <tr><td><b>Fahrzeug:</b></td><td>${fahrzeug.marke} ${fahrzeug.modell} (${fahrzeug.baujahr})</td></tr>
      <tr><td><b>FIN:</b></td><td>${fahrzeug.fin || '-'}</td></tr>
    </table>

    <h3>Versicherungsdaten</h3>
    <table border="0" cellpadding="6" style="font-family:sans-serif;font-size:14px;">
      <tr><td><b>Versicherungsgesellschaft:</b></td><td>${versicherung.gesellschaft}</td></tr>
      <tr><td><b>Versicherungsnummer:</b></td><td>${versicherung.nummer}</td></tr>
      <tr><td><b>Schadennummer:</b></td><td>${versicherung.schadennummer || 'noch nicht vergeben'}</td></tr>
    </table>

    <h3>Unfalldaten</h3>
    <table border="0" cellpadding="6" style="font-family:sans-serif;font-size:14px;">
      <tr><td><b>Datum / Uhrzeit:</b></td><td>${unfall.datum} um ${unfall.uhrzeit} Uhr</td></tr>
      <tr><td><b>Unfallort:</b></td><td>${unfall.ort}</td></tr>
      <tr><td><b>Hergang:</b></td><td>${unfall.hergang}</td></tr>
      <tr><td><b>Polizei gerufen:</b></td><td>${unfall.polizei === 'ja' ? 'Ja' : 'Nein'}</td></tr>
      ${unfall.polizei === 'ja' ? `<tr><td><b>Aktenzeichen:</b></td><td>${unfall.aktenzeichen || '-'}</td></tr>` : ''}
    </table>

    <h3>Unfallgegner</h3>
    <table border="0" cellpadding="6" style="font-family:sans-serif;font-size:14px;">
      <tr><td><b>Name:</b></td><td>${gegner.name || '-'}</td></tr>
      <tr><td><b>Kennzeichen:</b></td><td>${gegner.kennzeichen || '-'}</td></tr>
      <tr><td><b>Versicherung:</b></td><td>${gegner.versicherung || '-'}</td></tr>
      <tr><td><b>Versicherungsnr.:</b></td><td>${gegner.versicherungsnummer || '-'}</td></tr>
    </table>

    <h3>Schadensbeschreibung</h3>
    <p style="font-family:sans-serif;font-size:14px;">${schaden.beschreibung}</p>

    <p style="font-family:sans-serif;font-size:14px;color:#666;">
      Anzahl hochgeladener Bilder: <b>${images ? images.length : 0}</b><br>
      Die Bilder sind im Anhang dieser E-Mail beigefügt.
    </p>
  `;

  // Bilder als Anhänge aufbereiten
  const attachments = (images || []).map((img, i) => {
    const [meta, data] = img.dataUrl.split(',');
    const mimeType = meta.match(/:(.*?);/)[1];
    const ext = mimeType.split('/')[1];
    return {
      name: `schaden_foto_${i + 1}.${ext}`,
      content: data,
    };
  });

  const ritaEmail = process.env.RITA_EMAIL;
  const brevoKey = process.env.BREVO_API_KEY;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'KFZ Schadenformular', email: ritaEmail },
        to: [{ email: ritaEmail }],
        replyTo: { email: personal.email, name: `${personal.vorname} ${personal.nachname}` },
        subject: `🚗 Neuer KFZ-Schaden: ${personal.vorname} ${personal.nachname} – ${fahrzeug.kennzeichen}`,
        htmlContent: htmlBody,
        ...(attachments.length > 0 && { attachment: attachments }),
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('Brevo Fehler:', errData);
      return res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden.', error: errData.message });
    }

    res.json({ success: true, message: 'Formular erfolgreich übermittelt.' });
  } catch (err) {
    console.error('E-Mail Fehler:', err);
    res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden.', error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend läuft auf http://localhost:${PORT}`));
