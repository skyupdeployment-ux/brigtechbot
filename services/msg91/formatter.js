'use strict';

/**
 * Turns one bot message (from the engine) into WhatsApp messages.
 * Each part has an `interactive` payload (list / reply buttons) AND a `fallbackText`
 * that is sent automatically if MSG91 rejects the interactive payload.
 *
 * ★ If MSG91 expects a different interactive JSON shape, this is the only place to change.
 */

const { clean } = require('../../utils/text');
const { DateTime } = require('luxon');

const LIM = { body: 1024, header: 60, rowTitle: 24, rowDesc: 72, listBtn: 20, btnTitle: 20, maxRows: 10, maxBtns: 3 };
const cut = (s, n) => {
  const str = String(s == null ? '' : s);
  const chars = Array.from(str);
  return chars.length <= n ? str : chars.slice(0, n - 1).join('') + '…';
};
const fmtDate = (key) => DateTime.fromISO(key).setLocale('en').toFormat('d LLL yyyy');
const ddmmyyyy = (key) => DateTime.fromISO(key).toFormat('dd/LL/yyyy');

function listParts(msg) {
  const rows = msg.list.rows;
  const nav = msg.list.nav || [];
  let navFits = rows.length + nav.length <= LIM.maxRows;
  const shown = navFits ? rows.concat(nav) : rows.slice(0, LIM.maxRows);
  const hint = nav.length && !navFits ? '\n\n_Type *Go Back* or *Main Menu* at any time._' : '';

  const numbered = rows
    .map((r, i) => `${i + 1}. ${clean(r.t)}${r.d ? ` – ${r.d}` : ''}`)
    .join('\n');
  const navHint = nav.length ? '\n\nType *Go Back* or *Main Menu* at any time.' : '';
  const fallbackText = `${msg.head ? `*${msg.head}*\n` : ''}${msg.text}\n\n${numbered}\n\nReply with the *number* or the option name.${navHint}`;

  let body = msg.text + hint;
  const parts = [];
  if (Array.from(body).length > LIM.body) {
    parts.push({ kind: 'text', text: msg.text });
    body = 'Please choose an option from the list.' + hint;
  }
  parts.push({
    kind: 'interactive',
    fallbackText: parts.length ? `${numbered}\n\nReply with the *number* or the option name.${navHint}` : fallbackText,
    interactive: {
      type: 'list',
      ...(msg.head ? { header: { type: 'text', text: cut(msg.head, LIM.header) } } : {}),
      body: { text: body },
      action: {
        button: cut(msg.list.btn, LIM.listBtn),
        sections: [
          {
            title: cut(msg.list.title || 'Options', LIM.rowTitle),
            rows: shown.map((r) => ({
              id: cut(r.t, 200),
              title: cut(r.t, LIM.rowTitle),
              ...(r.d ? { description: cut(r.d, LIM.rowDesc) } : {}),
            })),
          },
        ],
      },
    },
  });
  return parts;
}

function buttonParts(text, buttons) {
  const fallbackText = `${text}\n\nReply: ${buttons.map((b) => `*${b}*`).join('  •  ')}`;
  if (buttons.length > LIM.maxBtns) return [{ kind: 'text', text: fallbackText }];
  const parts = [];
  let body = text;
  if (Array.from(body).length > LIM.body) {
    parts.push({ kind: 'text', text });
    body = 'Please choose an option.';
  }
  parts.push({
    kind: 'interactive',
    fallbackText: parts.length ? `Reply: ${buttons.map((b) => `*${b}*`).join('  •  ')}` : fallbackText,
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: cut(b, 256), title: cut(b, LIM.btnTitle) } })) },
    },
  });
  return parts;
}

/** msg = an item of `botMessages` from the conversation service. */
function build(msg) {
  if (msg.list) return listParts(msg);

  if (msg.datePicker) {
    const { min, max } = msg.datePicker;
    const text =
      '📆 *Preferred date*\n\nPlease type your preferred date as *DD/MM/YYYY*.\n' +
      `Example: ${ddmmyyyy(min)}\nAvailable: ${fmtDate(min)} to ${fmtDate(max)}.`;
    return buttonParts(text, msg.buttons || ['Go Back', 'Main Menu']);
  }

  if (msg.buttons && msg.buttons.length) return buttonParts(`${msg.head ? `*${msg.head}*\n` : ''}${msg.text}`, msg.buttons);

  return [{ kind: 'text', text: msg.text }];
}

module.exports = { build, LIM };
