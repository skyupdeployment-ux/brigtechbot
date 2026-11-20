'use strict';

/**
 * Where product / PCB repair enquiries go (the three links after a customer picks a product):
 *   Email your Enquiry    -> opens the customer's email app, addressed to sales@brightech-group.com
 *   WhatsApp your Enquiry -> opens a WhatsApp chat with +91-9620861000 with the message already typed
 *   Call us for support   -> opens the phone dialer with +91-9620861000
 * To change the numbers later, set ENQUIRY_EMAIL / ENQUIRY_PHONE in Railway (or edit the two lines below).
 */

const EMAIL = process.env.ENQUIRY_EMAIL || 'sales@brightech-group.com';
const PHONE = (process.env.ENQUIRY_PHONE || '919620861000').replace(/\D/g, ''); // digits with country code
const PHONE_SHOW = PHONE.length === 12 && PHONE.startsWith('91') ? `+91-${PHONE.slice(2)}` : `+${PHONE}`;

/** A product name that is safe to put in a link / page. */
const clip = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const subject = (p) => `Enquiry${p ? ' - ' + p : ''}`;
const emailBody = (p) => `Hello Brightech Group,\n\nI would like to enquire about: ${p || 'your products'}\n\nName:\nCompany:\nCity:\nPhone:\nModel / quantity / requirement:\n`;

const mailto = (p) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject(p))}&body=${encodeURIComponent(emailBody(p))}`;
const tel = () => `tel:+${PHONE}`;
const whatsapp = (p) => `https://wa.me/${PHONE}?text=${encodeURIComponent(`Hello Brightech Group, I would like to enquire about: ${p || 'your products'}`)}`;

/**
 * The messages after a customer picks a product: a short line, then THREE cards, each with its own green button
 *   Email your Enquiry    [Open Email]
 *   WhatsApp your Enquiry [Open WhatsApp]
 *   Call us for support   [Call +91-9620861000]
 * (a WhatsApp button label can have 20 characters, so the full wording is in the text of each card).
 * Email and call go through two small pages on this server (WhatsApp does not open mailto: / tel: by itself).
 * Without a known server address those two cards show the plain email address / phone number instead
 * (WhatsApp makes both tappable). An item without `url` is a plain text message.
 */
function enquiryItems(product, baseUrl) {
  const p = clip(product);
  const call = `Call ${PHONE_SHOW}`;
  return [
    { text: `✅ You selected *${p}*.\n\nPlease choose how you would like to send your enquiry:` },
    { text: `✉️ *Email your Enquiry*\n${EMAIL}`, label: 'Open Email', url: baseUrl ? `${baseUrl}/go/email?p=${encodeURIComponent(p)}` : null },
    { text: `💬 *WhatsApp your Enquiry*\n${PHONE_SHOW}`, label: 'Open WhatsApp', url: whatsapp(p) },
    { text: `📞 *Call us for support*\n${PHONE_SHOW}`, label: call.slice(0, 20), url: baseUrl ? `${baseUrl}/go/call` : null },
  ];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A tiny page that opens `url` (mailto: / tel:) by itself and has a big button as a backup. */
function openPage(title, note, url, button) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="0;url=${esc(url)}"><title>${esc(title)} - Brightech Group</title>
<style>body{margin:0;font:16px/1.5 "Segoe UI",system-ui,Arial,sans-serif;background:#f1f3f2;color:#17211c}main{max-width:420px;margin:0 auto;padding:40px 18px;text-align:center}
.card{background:#fff;border:1px solid #e3e7e5;border-radius:18px;padding:28px 18px}h1{margin:0 0 8px;font-size:22px}p{margin:6px 0;color:#5f6b65}
a.b{display:block;margin-top:18px;padding:15px;border-radius:14px;background:#008069;color:#fff;font-weight:700;font-size:17px;text-decoration:none}</style></head>
<body><main><div class="card"><h1>${esc(title)}</h1><p>${esc(note)}</p><a class="b" href="${esc(url)}">${esc(button)}</a></div></main></body></html>`;
}

module.exports = { EMAIL, PHONE, PHONE_SHOW, clip, mailto, tel, whatsapp, enquiryItems, openPage };
