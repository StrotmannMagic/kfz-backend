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

const SIGNATURE_DE = `
<div style="font-family:sans-serif;font-size:12px;color:#374151;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
  <p style="margin:0;"><strong>RITA LAST Versicherung</strong><br>
  C/ Garcilaso de Vega, s/n (Complejo 4 Illes)<br>
  07181 Costa d'en Blanes (Balearen)<br>
  Handy: (+34) 618 327 307 &nbsp;|&nbsp; Büro: (+34) 971 675 413<br>
  Email: <a href="mailto:ritalastversicherung@gmail.com">ritalastversicherung@gmail.com</a></p>
  <p style="margin:8px 0 0;">Öffnungszeiten: Montag bis Freitag von 09:00 bis 15:00 Uhr.<br>
  In dringenden Fällen bitte eine SMS Nachricht an die Handy-Nummer schicken!</p>
  <p style="margin:8px 0 0;color:#dc2626;"><strong>WICHTIG:</strong> Aus Datenschutz-Gründen und wegen mangelnder Übersichtlichkeit werden WhatsApp Nachrichten nicht gelesen und nicht bearbeitet!</p>
  <hr style="border:none;border-top:1px solid #d1d5db;margin:12px 0;">
  <p style="margin:0;font-size:10px;color:#6b7280;">RECHTLICHE HINWEIS: Diese E-Mail und, wo zutreffend, jede angehängte Datei enthält vertrauliche Informationen, die ausschließlich an den Empfänger adressiert sind. Seine Offenlegung, Kopierung oder Verbreitung an Dritte ohne vorherige schriftliche Genehmigung der Gesellschaft ist verboten. Wenn Sie diese E-Mail irrtümlich erhalten haben, löschen Sie bitte und informieren Sie den Absender sofort über dessen E-Mail-Adresse. Gemäß den Bestimmungen der Verordnung (EU) 679/2016 und des Organischen Gesetzes 3/2018 vom 5. Dezember zum Schutz personenbezogener Daten und zur Sicherung digitaler Rechte (LOPDPGDD) erhalten Sie folgende Datenschutzinformationen: Verantwortlich: RITA LAST, CIF: X3150888A, Postadresse: C/ GARCILASO DE LA VEGA, EDIF. IBIZA I 3º B, C.P.: 07181, COSTA D'EN BLANES, Telefon: 971675413, E-Mail: RITALASTVERSICHERUNG@GMAIL.COM. Die Rechtmäßigkeit der Verarbeitung Ihrer personenbezogenen Daten beruht auf einem berechtigten Interesse. Sie haben das Recht auf Zugang, Berichtigung, Löschung, Ablehnung, Einschränkung der Verarbeitung sowie das Recht auf Datenübertragbarkeit. Sie haben das Recht, eine Beschwerde bei der Aufsichtsbehörde einzureichen: der spanischen Datenschutzbehörde (<a href="https://www.agpd.es">www.agpd.es</a>).</p>
</div>`;

const SIGNATURE_EN = `
<div style="font-family:sans-serif;font-size:12px;color:#374151;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
  <p style="margin:0;"><strong>RITA LAST Insurance</strong><br>
  C/ Garcilaso de la Vega, s/n (Complejo 4 Illes)<br>
  07181 Costa d'en Blanes (Islas Baleares)<br>
  Mobile: (+34) 618 327 307 &nbsp;|&nbsp; Office: (+34) 971 675 413<br>
  Email: <a href="mailto:ritalastinsurance@gmail.com">ritalastinsurance@gmail.com</a></p>
  <p style="margin:8px 0 0;">Opening hours: Monday to Friday from 09:00 till 15:00h.<br>
  In case of an emergency, please send a SMS message to the mobile number.</p>
  <p style="margin:8px 0 0;color:#dc2626;"><strong>IMPORTANT:</strong> Due to data protection and lack of clarity, WhatsApp messages will not be read nor attended.</p>
  <hr style="border:none;border-top:1px solid #d1d5db;margin:12px 0;">
  <p style="margin:0;font-size:10px;color:#6b7280;">LEGAL NOTICE: This e-mail (including any possible file attachments) contains confidential information and is exclusively destined for its addressee. It is prohibited to disclose, copy or distribute to third parties the contents of this e-mail without prior written authorization from the company. If you have received this e-mail accidentally, please delete, and return it immediately to the sender. In accordance with Regulation (EU) 679/2016 and Organic Law 3/2018 of 5 December on Personal Data Protection (LOPDPGDD): Manager: RITA LAST, CIF: X3150888A, Address: C/ GARCILASO DE LA VEGA, EDIF. IBIZA I 3º B, C.P.: 07181, COSTA D'EN BLANES, Tel: 971675413, Email: RITALASTINSURANCE@GMAIL.COM. You have the right to access, rectify, remove, oppose or limit the processing of your personal data and the right to file a complaint with the Spanish Agency for Data Protection (<a href="https://www.agpd.es">www.agpd.es</a>).</p>
</div>`;

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
    row('Adresse', [personal?.strasse, personal?.plz, personal?.ort].filter(Boolean).join(', ')) +
    row(isDE ? 'Policenummer' : 'Policy Number', personal?.police_nr)
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
      row(isDE ? 'Schadendatum' : 'Date of Damage', scheibe?.datum) +
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

  body += isDE ? SIGNATURE_DE : SIGNATURE_EN;
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

    // Send workshop list to customer if Generali selected (Unfall or Scheibenschaden)
    const generaliSelected = formData.eigenSchaden?.werkstatt === 'generali' ||
      (formData.schadensart === 'scheibe' && formData.scheibe?.reparatur === 'generali');
    if (generaliSelected && personal?.email) {
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
            ? `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
                <p>Sehr geehrte/r ${personal.vorname} ${personal.nachname},</p>
                <p>anbei erhalten Sie die Liste der Generali-Vertragswerkstätten auf Mallorca sowie wichtige Informationen zur Schadenabwicklung.</p>
                <hr style="border:none;border-top:2px solid #1a56db;margin:20px 0;">
                <h3 style="color:#1a56db;">FÜR DIE REPARATUR DES FAHRZEUGES GIBT ES ZWEI MÖGLICHKEITEN</h3>
                <h4>1) Eigene Werkstattwahl</h4>
                <p>Wenn eine Werkstatt des eigenen Vertrauens genutzt werden soll, werden folgende Informationen benötigt:</p>
                <ul>
                  <li>Name der Werkstatt</li>
                  <li>Adresse</li>
                  <li>Telefonnummer</li>
                  <li>Ein Tag, an dem das Fahrzeug früh morgens dort abgegeben werden kann</li>
                </ul>
                <p>Der Gutachtertermin wird dann organisiert.<br>
                <strong>Bitte beachten:</strong> Der Tag kann koordiniert werden, die genaue Uhrzeit jedoch nicht. Hierfür ist eine Vorlaufzeit von mindestens 2 Werktagen erforderlich.</p>
                <h4>2) GENERALI-Vertragswerkstatt</h4>
                <p>Alternativ kann eine GENERALI-Vertragswerkstatt auf der Insel genutzt werden (anbei die Liste der verfügbaren Werkstätten).<br>
                Bitte eine Werkstatt auswählen und mitteilen, damit diese im System zugewiesen werden kann und Zugriff auf die Kundendaten erhält. Anschließend kann man während der Öffnungszeiten einfach dort vorbeikommen. Bei kleineren Schäden erstellt die Werkstatt das Gutachten selbst oder kümmert sich um die weitere Organisation. Erfahrungsgemäß ist die Abwicklung auf diesem Weg schneller und effizienter.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <h3 style="color:#1a56db;">ANSPRUCH AUF ERSATZWAGEN</h3>
                <p>Es besteht Anspruch auf einen Ersatzwagen:</p>
                <p><strong>1) Bei einer GENERALI-Vertragswerkstatt:</strong><br>
                Der Ersatzwagen wird direkt bei Fahrzeugabgabe über die Werkstatt organisiert.</p>
                <p><strong>2) Bei eigener Werkstattwahl:</strong><br>
                Der Ersatzwagen sollte selbst bestellt werden, sobald das Fahrzeug zur Reparatur abgegeben wurde – über die mehrsprachige Telefonnummer <strong>900 101 369</strong> oder <strong>+34 915 949 758</strong>.<br>
                Die Versicherung benötigt dafür eine Arbeitsbestätigung („Orden de Trabajo") von der Werkstatt, aus der das Abgabedatum sowie die voraussichtliche Reparaturdauer hervorgehen. Anschließend wird eine SMS mit dem Abholort des Ersatzwagens zugeschickt.<br>
                Sollte der Abholort (häufig der Flughafen) nicht erreichbar sein, kann über dieselbe Telefonnummer ein Taxi auf Kosten der Versicherung organisiert werden.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <p style="background:#fff7ed;border-left:4px solid #f97316;padding:12px;border-radius:4px;">
                <strong>Wichtiger Hinweis:</strong> Nahezu alle Versicherungsleistungen sind Serviceleistungen, die telefonisch bei der Versicherung angefordert werden müssen. Es handelt sich nicht um eine Kostenerstattung im Nachhinein – bitte daher immer vorab organisieren.</p>
                <p>Bei Fragen stehe ich gerne telefonisch oder per E-Mail zur Verfügung.</p>
                ${SIGNATURE_DE}
              </div>`
            : `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
                <p>Dear ${personal.vorname} ${personal.nachname},</p>
                <p>Please find attached the list of Generali partner workshops in Mallorca and important information about the claims process.</p>
                <hr style="border:none;border-top:2px solid #1a56db;margin:20px 0;">
                <h3 style="color:#1a56db;">THERE ARE TWO OPTIONS FOR YOUR VEHICLE REPAIR</h3>
                <h4>1) Your own choice of workshop</h4>
                <p>If you wish to use a workshop of your own choice, the following information is required:</p>
                <ul>
                  <li>Name of the workshop</li>
                  <li>Address</li>
                  <li>Phone number</li>
                  <li>A day when the vehicle can be dropped off early in the morning</li>
                </ul>
                <p>The appraiser appointment will then be organised.<br>
                <strong>Please note:</strong> The day can be coordinated, but not the exact time. A lead time of at least 2 working days is required.</p>
                <h4>2) GENERALI partner workshop</h4>
                <p>Alternatively, a GENERALI partner workshop on the island can be used (please find the list of available workshops attached).<br>
                Please select a workshop and let us know so it can be assigned in the system and given access to your data. You can then simply visit during opening hours. For minor damage, the workshop will prepare the assessment themselves or arrange further organisation. In our experience, this process tends to be faster and more efficient.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <h3 style="color:#1a56db;">ENTITLEMENT TO A REPLACEMENT VEHICLE</h3>
                <p>You are entitled to a replacement vehicle:</p>
                <p><strong>1) At a GENERALI partner workshop:</strong><br>
                The replacement vehicle is organised directly through the workshop when you drop off your vehicle.</p>
                <p><strong>2) With your own choice of workshop:</strong><br>
                The replacement vehicle should be ordered yourself once the vehicle has been dropped off for repair – via the multilingual phone number <strong>900 101 369</strong> or <strong>+34 915 949 758</strong>.<br>
                The insurance company requires a work confirmation ("Orden de Trabajo") from the workshop, showing the drop-off date and estimated repair duration. An SMS with the pick-up location of the replacement vehicle will then be sent.<br>
                If the pick-up location (often the airport) is not accessible, a taxi at the insurance company's expense can be arranged via the same phone number.</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <p style="background:#fff7ed;border-left:4px solid #f97316;padding:12px;border-radius:4px;">
                <strong>Important note:</strong> Almost all insurance services must be arranged in advance by phone with the insurance company. These are not reimbursements after the fact – please always organise in advance.</p>
                <p>If you have any questions, please feel free to contact me by phone or email.</p>
                ${SIGNATURE_EN}
              </div>`,
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
            ${SIGNATURE_DE}
          </div>`
        : `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#1a56db;">✅ Your accident claim has been received</h2>
            <p>Dear ${personal.vorname} ${personal.nachname},</p>
            <p>Thank you for submitting your accident claim. We have received your information and will get back to you as soon as possible.</p>
            <p>Please find attached a copy of your claim report as PDF.</p>
            <p><b>Your reference:</b> ${fahrzeug?.kennzeichen || ''} – ${new Date().toLocaleDateString('en-GB')}</p>
            ${SIGNATURE_EN}
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

// ─── Hogar Angebotsanfrage ───────────────────────────────────────────────────
app.post('/api/hogar-anfrage', submitLimiter, async (req, res) => {
  const { formData, honeypot } = req.body;
  if (honeypot) return res.status(400).json({ success: false, message: 'Ungültige Anfrage.' });

  const ritaEmail = process.env.RITA_EMAIL;
  const brevoKey = process.env.BREVO_API_KEY;
  const { personal, adresse, objekt, nutzung, flaechen, werte } = formData;

  const r = (label, value) => value ? `<tr><td style="padding:4px 8px;font-weight:bold;white-space:nowrap;">${label}:</td><td style="padding:4px 8px;">${value}</td></tr>` : '';
  const sec = (title, rows) => `<h3 style="color:#cc0000;margin-top:20px;">🏠 ${title}</h3><table border="0" cellpadding="0" style="font-family:sans-serif;font-size:14px;">${rows}</table>`;

  const objektTyp = objekt?.typ === 'wohnung'
    ? `Wohnung (${objekt?.wohnung_lage || ''})`
    : objekt?.typ === 'haus'
    ? `Haus (${objekt?.haus_art === 'reihenhaus' ? 'Reihenhaus' : 'Alleinstehendes Haus'})`
    : '';

  const nutzungText = nutzung?.art === 'eigennutzung'
    ? `Eigennutzung – ${nutzung?.eigennutzung_typ === 'hauptwohnsitz' ? 'Hauptwohnsitz' : 'Nebenwohnsitz'}`
    : nutzung?.art === 'vermietet'
    ? `Vermietet – ${nutzung?.vermietung_typ || ''}`
    : '';

  const htmlBody = `
    <h2 style="color:#cc0000;">🏠 Neue Hausversicherung-Anfrage</h2>
    ${sec('Versicherungsnehmer',
      r('Name', `${personal?.vorname || ''} ${personal?.nachname || ''}`.trim()) +
      r('NIE-Nummer', personal?.nie) +
      r('Geburtsdatum', personal?.geburtsdatum) +
      r('E-Mail', personal?.email)
    )}
    ${sec('Adresse der Immobilie',
      r('Straße', adresse?.strasse) +
      r('PLZ / Ort', [adresse?.plz, adresse?.ort].filter(Boolean).join(' '))
    )}
    ${sec('Objekt-Details',
      r('Art', objektTyp) +
      r('Baujahr', objekt?.baujahr) +
      r('Komplett saniert?', objekt?.saniert) +
      (objekt?.saniert === 'ja' ? r('Jahr der Sanierung', objekt?.saniert_jahr) : '') +
      r('Kataster-Nummer', objekt?.kataster)
    )}
    ${sec('Nutzung & Flächen',
      r('Nutzung', nutzungText) +
      r('Bebaute Fläche', flaechen?.bebaute_flaeche ? `${flaechen.bebaute_flaeche} m²` : '') +
      r('Weitere Nutzflächen', flaechen?.weitere_flaechen)
    )}
    ${sec('Versicherungswerte',
      r('Wiederaufbauwert Gebäude', werte?.wiederaufbauwert ? `${werte.wiederaufbauwert} €` : '') +
      r('Wiederbeschaffungswert Hausrat', werte?.wiederbeschaffungswert ? `${werte.wiederbeschaffungswert} €` : '') +
      r('Wertgegenstände', werte?.wertgegenstaende)
    )}
    ${SIGNATURE_DE}
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': brevoKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Hogar Angebotsformular', email: ritaEmail },
        to: [{ email: ritaEmail }],
        replyTo: { email: personal?.email || ritaEmail, name: `${personal?.vorname || ''} ${personal?.nachname || ''}`.trim() },
        subject: `🏠 Hogar-Anfrage: ${personal?.vorname || ''} ${personal?.nachname || ''} – ${objekt?.ort || ''}`.trim(),
        htmlContent: htmlBody,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden.', error: errData.message });
    }

    // Bestätigungsmail an Kunden
    if (personal?.email) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': brevoKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Rita Last Versicherungen', email: ritaEmail },
          to: [{ email: personal.email, name: `${personal.vorname} ${personal.nachname}` }],
          subject: 'Ihre Hogar-Angebotsanfrage ist eingegangen',
          htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#cc0000;">✅ Ihre Angebotsanfrage ist eingegangen</h2>
            <p>Sehr geehrte/r ${personal.vorname} ${personal.nachname},</p>
            <p>vielen Dank für Ihre Anfrage zur Hogar-Versicherung. Rita meldet sich innerhalb von 24 Stunden bei Ihnen.</p>
            ${SIGNATURE_DE}
          </div>`,
        }),
      });
    }

    res.json({ success: true, message: 'Anfrage erfolgreich übermittelt.' });
  } catch (err) {
    console.error('Hogar Fehler:', err);
    res.status(500).json({ success: false, message: 'E-Mail konnte nicht gesendet werden.', error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend läuft auf http://localhost:${PORT}`));
