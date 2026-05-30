require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function row(label, value) {
  if (!value) return '';
  return `<tr><td style="padding:4px 8px;font-weight:bold;white-space:nowrap;">${label}:</td><td style="padding:4px 8px;">${value}</td></tr>`;
}

function section(title, icon, rows) {
  if (!rows) return '';
  return `
    <h3 style="color:#1a56db;margin-top:24px;">${icon} ${title}</h3>
    <table border="0" cellpadding="0" style="font-family:sans-serif;font-size:14px;">${rows}</table>
  `;
}

function buildEmailHtml(formData, lang) {
  const { personal, fahrzeug, schadensart, scheibe, unfall, eigenSchaden, gegner, gegnerSchaden, personenschaden, diebstahl } = formData;
  const isDE = lang !== 'en';

  const schadensartLabels = {
    scheibe: '🪟 Scheibenschaden / Glass Damage',
    unfall_gegner: '🚗 Unfall mit Unfallgegner / Accident with Third Party',
    unfall_eigen: '🔧 Unfall ohne Unfallgegner / Single Vehicle Accident',
    diebstahl: '🔓 Diebstahl / Theft',
  };

  let body = `
    <h2 style="color:#1a56db;">🚗 Neuer KFZ-Schadensfall – ${schadensartLabels[schadensart] || schadensart}</h2>
    <p style="font-family:sans-serif;">Sprache / Language: <b>${isDE ? 'Deutsch' : 'English'}</b></p>
  `;

  // Personal
  body += section('Persönliche Daten / Personal Data', '👤',
    row('Name', `${personal?.vorname || ''} ${personal?.nachname || ''}`.trim()) +
    row('E-Mail', personal?.email) +
    row('Telefon', personal?.telefon) +
    row('Adresse', [personal?.strasse, personal?.plz, personal?.ort].filter(Boolean).join(', '))
  );

  // Fahrzeug
  body += section('Fahrzeugdaten / Vehicle', '🚘',
    row('Kennzeichen / Plate', fahrzeug?.kennzeichen) +
    row('Marke / Make', fahrzeug?.marke)
  );

  // Scheibenschaden
  if (schadensart === 'scheibe') {
    body += section('Scheibenschaden / Glass Damage', '🪟',
      row('Reparatur / Repair', scheibe?.reparatur) +
      row('Beschreibung / Description', scheibe?.beschreibung)
    );
  }

  // Unfall mit/ohne Gegner
  if (schadensart === 'unfall_gegner' || schadensart === 'unfall_eigen') {
    body += section('Fahrer / Driver', '🧑',
      row('Name des Fahrers / Driver name', unfall?.fahrer_name) +
      row('Führerschein Vorne', unfall?.fuehrerschein_vorne ? '✓ Angehängt' : '—') +
      row('Führerschein Hinten', unfall?.fuehrerschein_hinten ? '✓ Angehängt' : '—') +
      row('NIE / Ausweis', unfall?.nie_dokument ? '✓ Angehängt' : '—')
    );

    body += section('Unfalldaten / Accident Details', '💥',
      row('Datum / Date', unfall?.datum) +
      row('Uhrzeit / Time', unfall?.uhrzeit) +
      row('Schuld / Fault', unfall?.schuld) +
      row('Unfallort / Location', unfall?.ort) +
      row('Hergang / Description', unfall?.hergang) +
      row('Unfallbogen ausgefüllt?', unfall?.unfallbogen) +
      row('Polizei gerufen?', unfall?.polizei) +
      row('Zeugen / Witnesses', unfall?.zeugen) +
      (unfall?.zeugen === 'ja' ? row('Zeugendaten', unfall?.zeugen_info) : '')
    );

    body += section('Schäden am eigenen Fahrzeug / Own Vehicle Damage', '🔧',
      row('Beschreibung / Description', eigenSchaden?.beschreibung) +
      row('Werkstatt / Workshop', eigenSchaden?.werkstatt) +
      row('Werkstattdaten / Workshop details', eigenSchaden?.werkstatt_daten) +
      row('Gutachter Termin / Appraiser date', eigenSchaden?.gutachter_termin) +
      row('Fotos / Photos', eigenSchaden?.bilder?.length > 0 ? `${eigenSchaden.bilder.length} Foto(s) angehängt` : '—')
    );

    if (schadensart === 'unfall_gegner') {
      body += section('Unfallgegner / Third Party', '🤝',
        row('Kennzeichen / Plate', gegner?.kennzeichen) +
        row('Land / Country', gegner?.land) +
        row('Marke & Modell / Make & Model', gegner?.marke_modell) +
        row('Farbe / Color', gegner?.farbe) +
        row('Versicherung / Insurance', gegner?.versicherung) +
        row('Policenummer / Policy No.', gegner?.police_nr) +
        row('Fahrername / Driver name', gegner?.fahrer_name) +
        row('Geburtsdatum / Date of birth', gegner?.geburtsdatum) +
        row('Führerscheindatum / License date', gegner?.fuehrerschein_datum) +
        row('Fahrzeughalter? / Vehicle owner?', gegner?.ist_inhaber)
      );

      body += section('Schaden Unfallgegner / Third Party Damage', '📷',
        row('Beschreibung / Description', gegnerSchaden?.beschreibung) +
        row('Fotos / Photos', gegnerSchaden?.bilder?.length > 0 ? `${gegnerSchaden.bilder.length} Foto(s) angehängt` : '—')
      );
    }

    body += section('Personenschäden / Personal Injuries', '🏥',
      row('Personenschäden / Injuries', personenschaden?.hat_schaden) +
      (personenschaden?.hat_schaden === 'ja' ? row('Beschreibung / Description', personenschaden?.beschreibung) : '') +
      (personenschaden?.hat_schaden === 'ja' ? row('Arztbericht / Medical report', personenschaden?.arztbericht ? '✓ Angehängt' : '—') : '')
    );
  }

  // Diebstahl
  if (schadensart === 'diebstahl') {
    body += section('Diebstahl / Theft', '🔓',
      row('Datum / Date', diebstahl?.datum) +
      row('Uhrzeit / Time', diebstahl?.uhrzeit) +
      row('Ort / Location', diebstahl?.ort) +
      row('Beschreibung / Description', diebstahl?.beschreibung) +
      row('Polizei gerufen?', diebstahl?.polizei) +
      row('Polizeibericht', diebstahl?.polizei_bericht ? '✓ Angehängt' : '—')
    );
  }

  return body;
}

function collectAttachments(formData) {
  const attachments = [];
  const { schadensart, unfall, eigenSchaden, gegnerSchaden, personenschaden, diebstahl } = formData;

  const addDoc = (doc, name) => {
    if (doc?.dataUrl) {
      const [meta, data] = doc.dataUrl.split(',');
      const mimeType = meta.match(/:(.*?);/)[1];
      const ext = mimeType.split('/')[1];
      attachments.push({ name: `${name}.${ext}`, content: data });
    }
  };

  const addImages = (images, prefix) => {
    (images || []).forEach((img, i) => {
      if (img?.dataUrl) {
        const [meta, data] = img.dataUrl.split(',');
        const mimeType = meta.match(/:(.*?);/)[1];
        const ext = mimeType.split('/')[1];
        attachments.push({ name: `${prefix}_${i + 1}.${ext}`, content: data });
      }
    });
  };

  if (schadensart === 'unfall_gegner' || schadensart === 'unfall_eigen') {
    addDoc(unfall?.fuehrerschein_vorne, 'fuehrerschein_vorne');
    addDoc(unfall?.fuehrerschein_hinten, 'fuehrerschein_hinten');
    addDoc(unfall?.nie_dokument, 'nie_dokument');
    addDoc(unfall?.unfallbogen_bild, 'unfallbogen');
    addDoc(unfall?.polizei_bericht, 'polizeibericht');
    addImages(eigenSchaden?.bilder, 'eigener_schaden');
    if (schadensart === 'unfall_gegner') {
      addImages(gegnerSchaden?.bilder, 'gegner_schaden');
    }
    addDoc(personenschaden?.arztbericht, 'arztbericht');
  }

  if (schadensart === 'diebstahl') {
    addDoc(diebstahl?.polizei_bericht, 'polizeibericht');
  }

  return attachments;
}

app.post('/api/submit', submitLimiter, async (req, res) => {
  const { formData, honeypot, lang } = req.body;

  if (honeypot) {
    return res.status(400).json({ success: false, message: 'Ungültige Anfrage.' });
  }

  const ritaEmail = process.env.RITA_EMAIL;
  const brevoKey = process.env.BREVO_API_KEY;
  const { personal, fahrzeug } = formData;

  const htmlBody = buildEmailHtml(formData, lang);
  const attachments = collectAttachments(formData);

  const subject = `🚗 KFZ-Schaden: ${personal?.vorname || ''} ${personal?.nachname || ''} – ${fahrzeug?.kennzeichen || ''}`.trim();

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
        replyTo: { email: personal?.email || ritaEmail, name: `${personal?.vorname || ''} ${personal?.nachname || ''}`.trim() },
        subject,
        htmlContent: htmlBody,
        ...(attachments.length > 0 && { attachment: attachments }),
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('Brevo Fehler:', errData);
      return res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden.', error: errData.message });
    }

    // Send workshop list to customer if Generali selected
    if (formData.eigenSchaden?.werkstatt === 'generali' && personal?.email) {
      const fs = require('fs');
      const path = require('path');
      const pdfPath = path.join(__dirname, 'werkstaetten_mallorca.pdf');
      const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');

      const isDE = lang !== 'en';

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Rita Last Versicherungen', email: ritaEmail },
          to: [{ email: personal.email, name: `${personal.vorname} ${personal.nachname}` }],
          subject: isDE ? 'Liste der Vertragswerkstätten Mallorca' : 'List of Partner Workshops Mallorca',
          htmlContent: isDE
            ? `<p>Sehr geehrte/r ${personal.vorname} ${personal.nachname},</p><p>wie angekündigt erhalten Sie anbei die Liste der Vertragswerkstätten auf Mallorca.</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p><p>Mit freundlichen Grüßen<br>Rita Last Versicherungen</p>`
            : `<p>Dear ${personal.vorname} ${personal.nachname},</p><p>as announced, please find attached the list of partner workshops in Mallorca.</p><p>If you have any questions, please do not hesitate to contact us.</p><p>Kind regards<br>Rita Last Versicherungen</p>`,
          attachment: [{
            name: 'Vertragswerkstaetten_Mallorca.pdf',
            content: pdfBase64,
          }],
        }),
      });
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
