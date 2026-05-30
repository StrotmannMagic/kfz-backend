require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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

function generatePDF(formData, lang) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const isDE = lang !== 'en';
    const { personal, fahrzeug, schadensart, scheibe, unfall, eigenSchaden, gegner, gegnerSchaden, personenschaden, diebstahl } = formData;

    const schadensartLabels = {
      scheibe: isDE ? 'Scheibenschaden' : 'Glass Damage',
      unfall_gegner: isDE ? 'Unfall mit Unfallgegner' : 'Accident with Third Party',
      unfall_eigen: isDE ? 'Unfall ohne Unfallgegner' : 'Single Vehicle Accident',
      diebstahl: isDE ? 'Diebstahl' : 'Theft',
    };

    const field = (label, value) => {
      if (!value) return;
      doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true })
         .font('Helvetica').text(value || '—');
    };

    const heading = (title) => {
      doc.moveDown(0.5)
         .fontSize(13).font('Helvetica-Bold').fillColor('#1a56db').text(title)
         .fillColor('#000000').moveDown(0.3);
    };

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('Rita Last Versicherungen', { align: 'center' });
    doc.fontSize(14).font('Helvetica').text(isDE ? 'KFZ-Schadensmeldung' : 'Car Accident Claim Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`${isDE ? 'Schadensart' : 'Type'}: ${schadensartLabels[schadensart] || schadensart}`, { align: 'center' });
    doc.moveDown(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(0.5);

    // Personal
    heading(isDE ? 'Persönliche Daten' : 'Personal Data');
    field('Name', `${personal?.vorname || ''} ${personal?.nachname || ''}`.trim());
    field('E-Mail', personal?.email);
    field(isDE ? 'Telefon' : 'Phone', personal?.telefon);
    field(isDE ? 'Adresse' : 'Address', [personal?.strasse, personal?.plz, personal?.ort].filter(Boolean).join(', '));

    // Fahrzeug
    heading(isDE ? 'Fahrzeugdaten' : 'Vehicle Data');
    field(isDE ? 'Kennzeichen' : 'License Plate', fahrzeug?.kennzeichen);
    field(isDE ? 'Marke' : 'Make', fahrzeug?.marke);

    // Scheibenschaden
    if (schadensart === 'scheibe') {
      heading(isDE ? 'Scheibenschaden' : 'Glass Damage');
      field(isDE ? 'Reparaturwunsch' : 'Repair preference', scheibe?.reparatur);
      field(isDE ? 'Beschreibung' : 'Description', scheibe?.beschreibung);
    }

    // Unfall
    if (schadensart === 'unfall_gegner' || schadensart === 'unfall_eigen') {
      heading(isDE ? 'Fahrer' : 'Driver');
      if (unfall?.fahrer_ist_vn === 'ja') {
        doc.fontSize(10).font('Helvetica').text(isDE ? 'Fahrer = Versicherungsnehmer' : 'Driver = Policyholder');
      } else {
        field(isDE ? 'Name des Fahrers' : 'Driver name', unfall?.fahrer_name);
        field(isDE ? 'Führerschein Vorne' : 'License Front', unfall?.fuehrerschein_vorne ? '✓' : '—');
        field(isDE ? 'Führerschein Hinten' : 'License Back', unfall?.fuehrerschein_hinten ? '✓' : '—');
        field('NIE / Ausweis', unfall?.nie_dokument ? '✓' : '—');
      }

      heading(isDE ? 'Unfalldaten' : 'Accident Details');
      field(isDE ? 'Datum' : 'Date', unfall?.datum);
      field(isDE ? 'Uhrzeit' : 'Time', unfall?.uhrzeit);
      if (schadensart === 'unfall_gegner') field(isDE ? 'Schuld' : 'Fault', unfall?.schuld);
      field(isDE ? 'Unfallort' : 'Location', [unfall?.ort_strasse, unfall?.ort_plz, unfall?.ort_ort].filter(Boolean).join(', '));
      field(isDE ? 'Hergang' : 'Description', unfall?.hergang);
      if (schadensart === 'unfall_gegner') field(isDE ? 'Unfallbogen ausgefüllt?' : 'Accident report filled?', unfall?.unfallbogen);
      field(isDE ? 'Polizei gerufen?' : 'Police called?', unfall?.polizei);
      field(isDE ? 'Zeugen' : 'Witnesses', unfall?.zeugen);
      if (unfall?.zeugen === 'ja') field(isDE ? 'Zeugendaten' : 'Witness info', unfall?.zeugen_info);

      heading(isDE ? 'Schäden am eigenen Fahrzeug' : 'Own Vehicle Damage');
      field(isDE ? 'Beschreibung' : 'Description', eigenSchaden?.beschreibung);
      field(isDE ? 'Werkstatt' : 'Workshop', eigenSchaden?.werkstatt);
      if (eigenSchaden?.werkstatt === 'eigen') {
        field(isDE ? 'Werkstattdaten' : 'Workshop details', eigenSchaden?.werkstatt_daten);
        field(isDE ? 'Gutachter Termin' : 'Appraiser date', eigenSchaden?.gutachter_termin);
      }
      field(isDE ? 'Fotos' : 'Photos', eigenSchaden?.bilder?.length > 0 ? `${eigenSchaden.bilder.length}` : '0');

      if (schadensart === 'unfall_gegner') {
        heading(isDE ? 'Unfallgegner' : 'Third Party');
        field(isDE ? 'Kennzeichen' : 'License plate', gegner?.kennzeichen);
        field(isDE ? 'Land' : 'Country', gegner?.land);
        field(isDE ? 'Marke & Modell' : 'Make & Model', gegner?.marke_modell);
        field(isDE ? 'Farbe' : 'Color', gegner?.farbe);
        field(isDE ? 'Versicherung' : 'Insurance', gegner?.versicherung);
        field(isDE ? 'Policenummer' : 'Policy No.', gegner?.police_nr);
        field(isDE ? 'Fahrername' : 'Driver name', gegner?.fahrer_name);
        field(isDE ? 'Geburtsdatum' : 'Date of birth', gegner?.geburtsdatum);
        field(isDE ? 'Fahrzeughalter?' : 'Vehicle owner?', gegner?.ist_inhaber);

        heading(isDE ? 'Schaden Unfallgegner' : 'Third Party Damage');
        field(isDE ? 'Beschreibung' : 'Description', gegnerSchaden?.beschreibung);
        field(isDE ? 'Fotos' : 'Photos', gegnerSchaden?.bilder?.length > 0 ? `${gegnerSchaden.bilder.length}` : '0');
      }

      heading(isDE ? 'Personenschäden' : 'Personal Injuries');
      field(isDE ? 'Personenschäden?' : 'Injuries?', personenschaden?.hat_schaden);
      if (personenschaden?.hat_schaden === 'ja') {
        field(isDE ? 'Beschreibung' : 'Description', personenschaden?.beschreibung);
      }
    }

    // Diebstahl
    if (schadensart === 'diebstahl') {
      heading(isDE ? 'Diebstahl' : 'Theft');
      field(isDE ? 'Polizeibericht' : 'Police report', diebstahl?.polizei_bericht ? '✓' : '—');
    }

    // Footer
    doc.moveDown(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(0.5);
    doc.fontSize(9).fillColor('#666666')
       .text(`Rita Last Versicherungen – ritalastversicherungen@gmail.com – kfz-frontend.rita-last.com`, { align: 'center' });

    doc.end();
  });
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
  const isDE = lang !== 'en';

  const subject = `🚗 KFZ-Schaden: ${personal?.vorname || ''} ${personal?.nachname || ''} – ${fahrzeug?.kennzeichen || ''}`.trim();

  // Generate PDF report
  const pdfBuffer = await generatePDF(formData, lang);
  const pdfBase64 = pdfBuffer.toString('base64');
  const pdfAttachment = { name: 'Schadensmeldung.pdf', content: pdfBase64 };

  try {
    // Rita's email with HTML + PDF + photo attachments
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
        attachment: [pdfAttachment, ...attachments],
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
          subject: isDE ? 'Generali-Vertragswerkstätten Mallorca' : 'Generali Partner Workshops Mallorca',
          htmlContent: isDE
            ? `<p>Sehr geehrte/r ${personal.vorname} ${personal.nachname},</p><p>wie angekündigt erhalten Sie anbei die Liste der Generali-Vertragswerkstätten auf Mallorca.</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p><p>Mit freundlichen Grüßen<br>Rita Last Versicherungen</p>`
            : `<p>Dear ${personal.vorname} ${personal.nachname},</p><p>as announced, please find attached the list of Generali partner workshops in Mallorca.</p><p>If you have any questions, please do not hesitate to contact us.</p><p>Kind regards<br>Rita Last Versicherungen</p>`,
          attachment: [{
            name: 'Generali_Vertragswerkstaetten_Mallorca.pdf',
            content: pdfBase64,
          }],
        }),
      });
    }

    // Confirmation email to customer
    if (personal?.email) {
      const customerSubject = isDE
        ? `Bestätigung Ihrer KFZ-Schadensmeldung – ${fahrzeug?.kennzeichen || ''}`
        : `Confirmation of your car accident claim – ${fahrzeug?.kennzeichen || ''}`;

      const customerHtml = isDE
        ? `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#1a56db;">✅ Ihre Schadensmeldung ist eingegangen</h2>
            <p>Sehr geehrte/r ${personal.vorname} ${personal.nachname},</p>
            <p>vielen Dank für Ihre Schadensmeldung. Wir haben Ihre Daten erhalten und werden uns so schnell wie möglich bei Ihnen melden.</p>
            <p>Im Anhang finden Sie eine Kopie Ihrer Schadensmeldung als PDF.</p>
            <p><b>Ihre Referenz:</b> ${fahrzeug?.kennzeichen || ''} – ${new Date().toLocaleDateString('de-DE')}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <p style="color:#6b7280;font-size:13px;">Rita Last Versicherungen<br>ritalastversicherungen@gmail.com</p>
          </div>`
        : `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#1a56db;">✅ Your accident claim has been received</h2>
            <p>Dear ${personal.vorname} ${personal.nachname},</p>
            <p>Thank you for submitting your accident claim. We have received your information and will get back to you as soon as possible.</p>
            <p>Please find attached a copy of your claim report as PDF.</p>
            <p><b>Your reference:</b> ${fahrzeug?.kennzeichen || ''} – ${new Date().toLocaleDateString('en-GB')}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
            <p style="color:#6b7280;font-size:13px;">Rita Last Versicherungen<br>ritalastversicherungen@gmail.com</p>
          </div>`;

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
          subject: customerSubject,
          htmlContent: customerHtml,
          attachment: [pdfAttachment],
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
