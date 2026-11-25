'use strict';

/**
 * Flow definitions - a 1:1 port of the front-end bot (brightech-whatsapp-bot-preview.html).
 * Every message text, option, validation rule and routing rule is unchanged.
 * Only two things differ from the preview, both required by the brief:
 *   1. the "Preferred date" list is computed from the real current date (Asia/Kolkata by default)
 *      and gains one extra row, "Pick another date" (calendar);
 *   2. callbacks that used closures over browser state are now plain action codes.
 */

const { P, strip } = require('../../utils/text');
const contact = require('../../utils/contact');
const appEnv = require('../../config/env');
const { DateTime } = require('luxon');
const { formatDateShort, formatDateLong } = require('../../utils/time');

/* ---------------- Fixed messages ---------------- */
// Sent after "Hi": ONE message - the poster picture with this text as its caption (WhatsApp allows 1024 characters), then the menu below.
const WELCOME_INTRO =
  'Dear Sir – Good Day!\n\nGreetings from BRIGHTECH-GROUP.\n\nOur Business activities are Industrial Automation PCB Products Repair & Service, Supply New & Discontinued/Obsolete Products & Automation Solutions.\n\n⚙️ OUR ACTIVITIES:\n\n🔧 PCB REPAIR & SERVICE – ANY BRANDS\n\n🏭 INDUSTRIAL SEGMENT:\nAC Drives (VFD), Servo Drives, HMI, PLC-CPU, I/O Modules, Genset Controllers, SMPS Units, Servo Motors, Spindles.\n\n🌱 WIND & SOLAR SEGMENT:\nIGBT Stacks, Driver Boards, Communication Boards, Adapter Boards, Industrial Cooling Fans, PLC-CPU & I/O Modules, HMI & Power Supply Units.\n\n🏢 BUILDING SEGMENT:\nHVAC & Chilling Unit AC Drives (VFD), DDC Controllers, Temperature Controller Units, all PCB Boards, High-Speed Cooling Fans, Exhaust Fans.\n\n🔌 SUPPLY OF AUTOMATION PRODUCTS – NEW / DISCONTINUED /OBSOLETE\nSiemens, Allen-Bradley, Mitsubishi, Schneider Electric, ABB, Omron, Delta, Fuji Electric, B&R, Rexroth, Lenze, GE Fanuc.\n\n🌐 https://www.brightech-group.com\n🌐 https://www.boss-mart.com\n\nSupporting by,\nSales Team\nBRIGHTECH GROUP';
const WELCOME = 'For more information, please click the Options below';
const COMMON =
  'Thank you for contacting Brightech!\n\nYour enquiry details have been collected.\n\nWhat would you like to do next?';

/* ---------------- Option lists ---------------- */
const MAINOPTS = P([
  '1️⃣ Product Enquiry|PLC, HMI, drives, sensors and more',
  '2️⃣ PCB Repair & Service|PCB Repair & Industrial Service',
  '3️⃣ Automation Solutions|Industrial Automation Solutions',
  '4️⃣ Robotics, CNC & SPM|Industrial robotics, CNC and special machines',
  '5️⃣ BMS & Building|BMS & Building Solutions',
  '6️⃣ Training Division|TRAINING DIVISION & R&D DIVISION',
  '7️⃣ PCB Reverse & Design|PCB REVERSE ENGINEERING & PCB NEW DESIGN',
  '8️⃣ Recruitment & Hiring|Jobs and hiring',
  '9️⃣ Company Information|Learn about Brightech',
  '🔟 Contact Us|Branch addresses and contact',
]);
['product', 'service', 'auto', 'robo', 'bms', 'trainingdiv', 'pcbdesign', 'career', 'coinfo', 'contactus'].forEach((g, i) => {
  MAINOPTS[i].go = g;
});

const PRODUCT_CAT = P([
  'PLC',
  'HMI',
  'AC Drive / VFD',
  'Servo Drive & Motor|Servo Drive & Servo Motor',
  'Sensors & Instruments|Sensors & Instrumentation',
  'Industrial PCB / Modules|Industrial PCB / Electronic Modules',
  'Electrical Components|Electrical & Automation Components',
  'Other Products',
]);
const PINFO = [
  'A programmable industrial controller that runs machines and processes using stored logic. Typical uses: production lines, packaging and process control.',
  'A touch screen or operator panel used to view and control a machine or process.',
  'Controls the speed and torque of an AC motor. Typical uses: pumps, fans and conveyors.',
  'Gives precise control of motor position, speed and torque. Typical uses: CNC machines, robotics and packaging.',
  'Sensors and measuring devices for position, temperature, pressure, level and flow that send signals to a controller.',
  'Control boards and electronic modules found inside industrial equipment.',
  'Components used in control panels and automation systems, such as relays, contactors, switches and power supplies.',
  'Tell us what you need and our sales team will review it.',
];
// Short description (used by the keyword shortcuts); the old detailed flow keeps the long text below.
const infoMsg = (i) => '📘 *' + (PRODUCT_CAT[i].d || PRODUCT_CAT[i].t) + '*\n' + PINFO[i];
const PRODUCT_CAT_FULL = PRODUCT_CAT.map((o, i) =>
  Object.assign({}, o, {
    info:
      infoMsg(i) + '\n\nBrands, models, availability and pricing: To be confirmed\n\nNext, we will collect a few details for your enquiry.',
  })
);

/* ---------------- 6 Training Division and 7 PCB Reverse Engineering: the titles the client listed (short title + the full title below it) ---------------- */
const TRAINING_TITLES = [
  ['Experienced Training', 'EXPERIENCED TRAINING SOLUTIONS'],
  ['Brand Specialization', 'INDUSTRIAL AUTOMATION – BRAND SPECIALIZATION TRAINING'],
  ['R&D & Engineering', 'R&D and ENGINEERING SOLUTIONS'],
  ['Data Connectivity', 'DATA CONNECTIVITY & INTEGRATION'],
  ['Mechanical Training', 'MECHANICAL ENGINEERING TRAINING'],
  ['Digital Engineering', 'DIGITAL ENGINEERING TRAINING'],
  ['Automation Solutions', 'AUTOMATION SOLUTIONS'],
];
const PCB_DESIGN_TITLES = [
  ['Reverse Engineering', 'REVERSE ENGINEERING & RE-ENGINEERING SERVICE'],
  ['PCB Design', 'PCB DESIGN: (PRINTED CIRCUIT BOARD DESIGN)'],
  ['Prototyping & Mfg', 'PROTOTYPING & ELECTRONIC MANUFACTURING SERVICES'],
  ['Custom Electronics', 'CUSTOM ELECTRONICS DESIGN'],
  ['Embedded Systems', 'EMBEDDED SYSTEMS DESIGN - HARDWARE & FIRMWARE(SOFTWARE)'],
  ['Hardware & PCB Design', 'ELECTRONIC HARDWARE & PCB DESIGN SERVICE'],
  ['IoT Hardware & Sensor', 'IoT HARDWARE & IoT SENSOR'],
];
// a list row has a short title (WhatsApp cuts 24 characters) and the full title as its description; the contact cards use the full title
const titleRows = (list) => P(list.map(([t, full]) => `${t}|${full}`));
const fullTitle = (list, short) => (list.find(([t]) => t === short) || [short, short])[1];
const TRAINING_ROWS = titleRows(TRAINING_TITLES);
const PCB_DESIGN_ROWS = titleRows(PCB_DESIGN_TITLES);

/* ---------------- Contact Us: one address message per branch (from brightech-group.com/contact_us) ---------------- */
const BRANCH_ROWS = P(['Bangalore|Head Office & Factory', 'Chennai|Corporate Office & Factory', 'Coimbatore|Service Centre & Factory', 'Dindigul|Service Center & Office', 'Malaysia|Office']);
const BRANCH_TEXT = {
  Bangalore: `📍 *Bangalore* – Head Office & Factory
Brightech Industrial Automation Pvt. Ltd.
No.7, 1st Floor, Basappa Reddy Compound, Y.V.Annaiah Road, Yelachanalli, Bangalore-560076, Karnataka.
📞 080-49714840
Sales Team: 9900002204, 9606537200, 9591879015, 9606326001

*Brightech Career Solutions* – Head Office
No.7A, 1st Floor, Basappa Reddy Compound, Y.V.Annaiah Road, Yelachanahalli, Bangalore-560076, Karnataka.
HR Team: 9035028272, 9035028270

*Brightech BMS Interior Solutions* – Head Office
No.7B, 1st Floor, Basappa Reddy Compound, Y.V.Annaiah Road, Yelachanahalli, Bangalore-560076, Karnataka.
Sales Team: 9606815911, 9900002204`,
  Chennai: `📍 *Chennai* – Corporate Office & Factory
Brightech Industrial Automation Pvt. Ltd.
S-1, 2nd Floor, No.89/52, Oragadam Rd, Venkatapuram, OT, Ambattur, Chennai, Tamil Nadu 600053.
Sales Team: 9606328004, 9606328002, 9606821911`,
  Coimbatore: `📍 *Coimbatore* – Service Centre & Factory
BRIGHTECH ENGINEERING
No.31, Andal Nagar East, Uppilipalayam Post, Ramanujar Nagar, Coimbatore-641015, Tamil Nadu.
Sales Team: 9606328004, 9035028270, 9606328002`,
  Dindigul: `📍 *Dindigul* – Service Center & Office
BRIGHTECH ENGINEERING
No. 11-7-23-E3, Anna Nagar Main Street, Mettupatti, Chinnalapatti, Dindigul, Tamil Nadu - 624 301.
Sales Team: 9606526100, 9845359300`,
  Malaysia: `📍 *Malaysia* – Office
No.23A-2, Jalan Nagasari E, 36/E, Desa Latania, Seksyen 36, 40470, Shah Alam, Malaysia.`,
};

/* ---------------- PCB Repair & Service: segments and the products of each ---------------- */
const SEGMENTS = P([
  'Industrial Segment|Drives, HMI, PLC, servo and more',
  'Wind & Solar Segment|IGBT stacks, driver boards and more',
  'Building Segment|HVAC, DDC and building PCBs',
]);
const SVC_PRODUCTS = {
  'Industrial Segment': P([
    'AC Drives (VFD)',
    'Servo Drives',
    'HMI',
    'PLC-CPU',
    'I/O Modules',
    'Genset Controllers',
    'SMPS Units',
    'Servo Motors',
    'Spindles',
  ]),
  'Wind & Solar Segment': P([
    'IGBT Stacks',
    'Driver Boards',
    'Communication Boards',
    'Adapter Boards',
    'Industrial Cooling Fans',
    'PLC-CPU & I/O Modules',
    'HMI & Power Supply Units',
  ]),
  'Building Segment': P([
    'HVAC & Chilling Drives|HVAC & Chilling Unit AC Drives (VFD)',
    'DDC Controllers',
    'Temperature Controllers|Temperature Controller Units',
    'All PCB Boards',
    'High-Speed Cooling Fans',
    'Exhaust Fans',
  ]),
};

const REQ_TYPE = P([
  'New product purchase',
  'Replacement product',
  'Bulk purchase',
  'Availability enquiry|Product availability enquiry',
  'Technical information',
]);
const EQUIP = P(['PLC', 'HMI', 'AC Drive / VFD', 'Servo Drive', 'PCB Board', 'Power Supply', 'CNC Controller', 'Other Equipment']);
const FAULT = P([
  'Not powering ON|Equipment not powering ON',
  'Display not working',
  'Communication failure',
  'Hardware failure',
  'Overheating',
  'Error / Alarm indication',
  'Intermittent problem',
  'Other issue',
]);
const SVC_REQ = P([
  'Request repair quotation',
  'Request inspection|Request equipment inspection',
  'Discuss with engineer|Discuss with service engineer',
  'Repair feasibility|Enquire about repair feasibility',
]);
const AUTO = P([
  'PLC Automation',
  'SCADA Development',
  'Factory Automation',
  'Machine Automation',
  'Control Panels|Control Panel Development',
  'Industrial IoT',
  'Custom Automation|Custom Automation Project',
  'Other',
]);
const INDUSTRY = P(['Manufacturing', 'Automotive', 'Pharmaceutical', 'Food & Beverage', 'Water & Wastewater', 'Electrical & Electronics', 'Other Industry']);
const SETUP = P(['New installation', 'Existing system upgrade', 'System troubleshooting', 'Automation replacement', 'Other']);
const ROBO = P([
  'Industrial Robotics',
  'CNC Retrofitting',
  'CNC Reconditioning',
  'CNC Automation',
  'SPM Development',
  'Special Machinery|Special Purpose Machinery',
  'Custom Engineering|Custom Engineering Solutions',
]);
const BMS1 = P([
  'Building Mgmt (BMS)|Building Management System (BMS)',
  'HVAC Automation',
  'Car Parking Ventilation',
  'Fire & Safety Automation',
  'Lighting Management',
]);
const BMS2 = P(['CCTV & Security', 'Energy Management', 'Interior Solutions', 'Other Requirements']);
// BMS & Building Solutions as listed on brightech-group.com (BRIGHTECH BMS INTERIOR SOLUTIONS - Activities & Solutions)
const BMS_SERVICES = P([
  'Building Mgmt (BMS)|Building Management Solutions - Sales & Services',
  'HVAC Solutions|HVAC spares, installation, automation and PCB repair',
  'Car Parking Ventilation|Car parking ventilation system and automation',
  'Fire Fighting & Safety|Fire fighting and safety automation',
  'Light Control Automation|Light management: LED, energy saving and IoT lights',
  'IIoT Based Automation|IIOT based industrial automation: machines and production lines',
  'Smart Home Automation|Smart home automation with IoT-based solutions',
  'Energy Management|Energy management solutions and maintenance',
  'Partition & Interiors|Aluminium partition and interior design',
  'Other Requirements',
]);
const PROPERTY = P(['Commercial Building', 'Industrial Building', 'Residential Apartment', 'Office', 'Hospital', 'Shopping Mall', 'Other']);
const CAREER = P(['Looking for a Job', 'Hiring Employees', 'Internship Enquiry', 'Other Recruitment Enquiry|Other recruitment enquiry']); // the old detailed flow
// Career & Recruitment in the menu: only these two
const CAREER_MENU = P(['Looking for a Job', 'Hiring Employees']);
const JOBCAT = P(['Engineering', 'Electrical & Electronics', 'Automation', 'Mechanical', 'IT & Software', 'Sales & Marketing', 'Administration', 'Other']);
// Company Information: the "About Brightech" information from brightech-group.com, shown straight away
const ABOUT_TEXT = `🏢 *About BRIGHTECH-GROUP*
_Engineering Excellence Since 2012_

BRIGHTECH GROUP is an Industrial Automation Solutions, Building Management Solutions & Manpower Solution providing company since 2012.

*Our group*
• Brightech Industrial Automation Private Limited – HO Bangalore
• Brightech BMS Interior Solutions – HO Bangalore, branch Chennai
• Brightech Engineering – Chennai, Coimbatore, Dindigul, Tirunelveli

*What we do*
• Industrial automation products – sales, distributor, importer & stockist
• PCB board-level & chip-level repair & service
• Robotic based automation projects
• SPM and CNC machine retrofitting & reconditioning
• Turn-key & customized industrial automation projects
• BMS & building solutions – HVAC, car parking ventilation, fire safety, lighting, smart home, energy management
• Automation products training (Training Division / R&D Lab)

📍 Karnataka, Tamilnadu, Kerala, Andhra Pradesh, Telangana
📞 ${contact.PHONE_SHOW}
✉️ ${contact.EMAIL}

🌐 https://www.brightech-group.com
🌐 https://www.boss-mart.com`;
const DEPTS = P([
  'Sales Department',
  'Service Department',
  'Automation Projects',
  'Robotics & CNC',
  'BMS Solutions',
  'Career & Recruitment',
  'General Enquiry',
]);

/* ---------------- Booking: date and time slot options ---------------- */
const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening', 'No preference'];
const SLOTS = P([
  'Morning|Exact hours: To be confirmed',
  'Afternoon|Exact hours: To be confirmed',
  'Evening|Exact hours: To be confirmed',
  'No preference|We will suggest a time',
]);

/**
 * Next 7 days (from tomorrow) in the conversation's timezone, then "Pick another date"
 * (opens the calendar) and "No preference". Built from the real current date on every render.
 */
function buildDateOptions(ctx) {
  const base = ctx.now().startOf('day');
  const out = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = base.plus({ days: i });
    out.push({
      t: formatDateShort(d),
      d: i === 1 ? 'Tomorrow' : formatDateLong(d),
      dateKey: d.toISODate(),
    });
  }
  out.push({ t: 'Pick another date', d: 'Choose from a calendar', pick: true });
  out.push({ t: 'No preference', d: 'We will suggest a time', dateKey: null });
  return out;
}

/* ---------------- Step helpers ---------------- */
const T = (key, body, x = {}) => Object.assign({ k: 'text', key, body }, x);
const M = (key, body, what, x = {}) => Object.assign({ k: 'media', key, body, what }, x);
const L = (key, head, btn, body, opts, x = {}) => Object.assign({ k: 'list', key, head, btn, body, opts }, x);
const B = (key, body, opts, x = {}) => Object.assign({ k: 'btns', key, body, opts: P(opts) }, x);
const CONT = '\n\nTap *Continue* when you have finished.';
// Last step of the Product Enquiry / PCB Repair flows: the three ways to send the enquiry
const ASK_MORE = 'Is there anything else we can help you with?';
// The final enquiry (the same everywhere). ENQUIRY_STYLE=single (default): ONE message with Email, WhatsApp, Call and the buttons.
// ENQUIRY_STYLE=cards: the green cards, one message each. `key` = the name of one answer, or a function that builds the label from several answers.
const CONTACT_STEP = (key, topic) => {
  const label = (e) => (typeof key === 'function' ? key(e) : e.S.data[key]);
  const email = (e) => (typeof topic === 'function' ? topic(e) : topic); // which address: sales / careers / hr
  return B('Contact', (e) => (contact.singleStyle() ? contact.enquiryBody(label(e), email(e)) : ASK_MORE), ['Main Menu', 'End Conversation'], {
    nonav: true,
    again: ASK_MORE, // shown alone when the customer taps or types something else after the enquiry
    links: (e) => (contact.singleStyle() ? [] : contact.enquiryItems(label(e), appEnv.PUBLIC_BASE_URL, email(e))), // "cards" style: sent first, one message each
    route: { 'main menu': 'MAIN', 'end conversation': 'END' },
  });
};

const SCHED_TEXT = {
  product: 'When should our sales team contact you?',
  service: 'When should our service team contact you about this equipment?',
  auto: 'When would you like a technical discussion with our automation team?',
  robo: 'When would you like a discussion with our engineering team?',
  bms: 'When would you like to discuss with our building solutions team?',
  career: 'When is a good time for our recruitment team to contact you?',
  contact: 'When is a good time for the team to reach you?',
};

const FL = {
  main: { name: 'Main menu', steps: [L('Service', '', 'Select Option', WELCOME, MAINOPTS, { nonav: true })] },

  __done: {
    name: 'Completed',
    steps: [
      B('Next', COMMON, ['Make Another Enquiry', 'Main Menu', 'End Conversation'], {
        nonav: true,
        route: { 'make another enquiry': 'AGAIN', 'main menu': 'MAIN', 'end conversation': 'END' },
      }),
    ],
  },

  __sched: {
    name: 'Book a time',
    icon: '📅',
    steps: [
      L('Preferred date', 'Preferred Date', 'Select Date', (e) => e.schedText() + '\n\nPlease pick a preferred date.', (e) => buildDateOptions(e.ctx)),
      L('Preferred time', 'Preferred Time', 'Select Time', 'Please pick a preferred time slot.\n\nExact hours: To be confirmed', SLOTS),
    ],
  },

  // Used when DATETIME_PICKER is on: ONE step, the customer picks date + time on a web page.
  __sched2: {
    name: 'Book a time',
    icon: '📅',
    steps: [{ k: 'dtpick', key: 'Preferred date' }],
  },

  __confirm: {
    name: 'Confirm enquiry',
    steps: [
      B('Confirm', (e) => e.summaryText(), ['Confirm Enquiry', 'Start Again', 'Cancel'], {
        nonav: true,
        route: { 'confirm enquiry': 'COMPLETE', 'start again': 'RESTART', cancel: 'CANCEL' },
      }),
    ],
  },

  // NEW: Select Segment -> Select Product (the same lists as PCB Repair & Service) -> Email / WhatsApp / Call
  product: {
    name: 'Product Enquiry',
    icon: '🛒',
    top: 'product',
    topLevel: true,
    steps: [
      L('Segment', 'Product Enquiry', 'Select Segment', 'Welcome to Brightech Product Enquiry!\n\nPlease select your segment.', SEGMENTS),
      L('Product', 'Select Product', 'Select Product', (e) => '*' + (e.S.data['Segment'] || 'Product Enquiry') + '*\n\nPlease select the product.', (e) => SVC_PRODUCTS[e.S.data['Segment']] || []),
      CONTACT_STEP('Product'),
    ],
  },

  // The old detailed product enquiry (name, brand, model, quantity, photo, booking ...). Not in the menu: kept for the tests / future use.
  product_full: {
    name: 'Product Enquiry',
    icon: '🛒',
    top: 'product',
    topLevel: true,
    steps: [
      L('Category', 'Product Category', 'Select Category', 'Welcome to Brightech Product Enquiry!\n\nPlease select the product category you are interested in.', PRODUCT_CAT_FULL),
      T('Manufacturer / brand', 'Please enter the product manufacturer / brand.'),
      T('Model / part number', 'Please enter the model number / part number.'),
      T('Quantity', 'Please enter the required quantity (numbers only).', { v: 'num' }),
      M('Product image', 'Please send a product image or a photograph of the nameplate.', 'a product image or nameplate photograph', { accept: 'image', opt: true }),
      L('Requirement', 'Your Requirement', 'Select Requirement', 'What is your requirement?', REQ_TYPE),
      T('Full name', 'Please enter your full name.'),
      T('Company name', 'Please enter your company name.'),
      T('City / location', 'Please enter your city / location.'),
      T('Email address', 'Please enter your email address (optional).', { opt: true, v: 'email' }),
    ],
    done: 'Thank you for contacting Brightech!\n\nYour product enquiry details have been collected.\n\nOur sales team will review your requirement and contact you regarding product availability and pricing.',
  },

  // NEW: pick the segment, then the product, then Email / WhatsApp / Call
  service: {
    name: 'PCB Repair & Service',
    icon: '🛠️',
    top: 'service',
    topLevel: true,
    steps: [
      L('Segment', 'PCB Repair & Service', 'Select Segment', '🔧 *PCB REPAIR & SERVICE – ANY BRANDS*\n\nPlease select your segment.', SEGMENTS),
      L('Product', 'Select Product', 'Select Product', (e) => '*' + (e.S.data['Segment'] || 'PCB Repair & Service') + '*\n\nPlease select the product.', (e) => SVC_PRODUCTS[e.S.data['Segment']] || []),
      CONTACT_STEP('Product'),
    ],
  },

  // The old detailed PCB repair enquiry. Not in the menu: kept for the tests / future use.
  service_full: {
    name: 'PCB Repair & Industrial Service',
    icon: '🛠️',
    top: 'service',
    topLevel: true,
    steps: [
      L('Equipment type', 'Equipment Type', 'Select Equipment', 'Welcome to Brightech Industrial Service!\n\nWhat type of equipment requires service?', EQUIP),
      T('Equipment brand', 'Please enter the equipment brand.'),
      T('Model number', 'Please enter the model number.'),
      T('Serial number', 'Please enter the serial number (optional).', { opt: true }),
      L('Fault category', 'Fault Category', 'Select Problem', 'What problem are you experiencing?', FAULT),
      T('Fault description', 'Please describe the problem you are experiencing.'),
      M('Photos / videos', 'Please send equipment photographs, PCB images, error display photographs or short fault videos.' + CONT, 'equipment photographs, PCB images or fault videos', { accept: 'any', multi: true }),
      L('Service required', 'Service Required', 'Select Service', 'What service do you need?', SVC_REQ),
      T('Full name', 'Please enter your full name.'),
      T('Company name', 'Please enter your company name.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
      T('Location', 'Please enter your location.'),
      T('Email address', 'Please enter your email address (optional).', { opt: true, v: 'email' }),
    ],
    done: 'Thank you! Your service enquiry has been received.\n\nOur service team will review the equipment details and contact you regarding the next steps.',
  },

  // NEW: pick an option, then Email / WhatsApp / Call (no more questions)
  auto: {
    name: 'Industrial Automation Solutions',
    icon: '⚙️',
    top: 'auto',
    topLevel: true,
    steps: [
      L('Solution type', 'Solution Type', 'Select Solution', 'Welcome to Brightech Automation Solutions!\n\nWhat type of solution are you looking for?', AUTO),
      CONTACT_STEP('Solution type'),
    ],
  },

  // The old detailed enquiry for this service. Not in the menu: kept for the tests / future use.
  auto_full: {
    name: 'Industrial Automation Solutions',
    icon: '⚙️',
    top: 'auto',
    topLevel: true,
    steps: [
      L('Solution type', 'Solution Type', 'Select Solution', 'Welcome to Brightech Automation Solutions!\n\nWhat type of solution are you looking for?', AUTO),
      L('Industry', 'Your Industry', 'Select Industry', 'Which industry does your business belong to?', INDUSTRY),
      T('Project description', 'Please describe your project.'),
      T('Existing system details', 'Please share details of your existing system.'),
      T('Project location', 'What is the project location?'),
      T('Expected timeline', 'What is the expected project timeline?'),
      T('Approximate budget', 'What is your approximate budget? (optional)', { opt: true }),
      M('Drawings / photographs', 'Please send technical drawings or photographs (optional).' + CONT, 'technical drawings or photographs', { accept: 'any', multi: true, opt: true }),
      L('Existing setup', 'Existing Setup', 'Select Setup', 'Please select your existing setup.', SETUP),
    ],
    done: 'Thank you for your interest in Brightech!\n\nYour automation project enquiry has been received.\n\nOur team will contact you for further technical discussion.',
  },

  // NEW: pick an option, then Email / WhatsApp / Call (no more questions)
  robo: {
    name: 'Robotics, CNC & SPM',
    icon: '🤖',
    top: 'robo',
    topLevel: true,
    steps: [
      L('Service', 'Select Service', 'Select Service', 'Please select the service you require.', ROBO),
      CONTACT_STEP('Service'),
    ],
  },

  // The old detailed enquiry for this service. Not in the menu: kept for the tests / future use.
  robo_full: {
    name: 'Robotics, CNC & SPM',
    icon: '🤖',
    top: 'robo',
    topLevel: true,
    steps: [
      L('Service', 'Select Service', 'Select Service', 'Please select the service you require.', ROBO),
      T('Machine manufacturer', 'Please enter the machine manufacturer.'),
      T('Machine model', 'Please enter the machine model.'),
      T('Machine condition', 'Please describe the current machine condition.'),
      T('Application / requirement', 'What is your application / production requirement?'),
      B('Installation type', 'New installation or existing machine upgrade?', ['New installation', 'Machine upgrade']),
      M('Photos / drawings / specs', 'Please send machine photographs, technical drawings or machine specifications.' + CONT, 'machine photographs, drawings or specifications', { accept: 'any', multi: true }),
      T('Full name', 'Please enter your full name.'),
      T('Company name', 'Please enter your company name.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
      T('Location', 'Please enter your location.'),
    ],
    done: 'Thank you! Your robotics / CNC / SPM enquiry has been received.\n\nOur engineering team will contact you.',
  },

  // NEW: pick an option, then Email / WhatsApp / Call (no more questions)
  bms: {
    name: 'BMS & Building Solutions',
    icon: '🏢',
    top: 'bms',
    topLevel: true,
    steps: [
      L('Requirement', 'Your Requirement', 'Select Requirement', 'Welcome to Brightech BMS & Building Solutions!\n\nPlease select your requirement.', BMS_SERVICES),
      CONTACT_STEP('Requirement'),
    ],
  },

  // The old detailed enquiry for this service. Not in the menu: kept for the tests / future use.
  bms_full: {
    name: 'BMS & Building Solutions',
    icon: '🏢',
    top: 'bms',
    topLevel: true,
    steps: [
      L('Requirement', 'Your Requirement', 'Select Requirement', 'Welcome to Brightech Building Solutions!\n\nPlease select your requirement.', BMS1, {
        more: { label: 'More options', desc: 'Show the remaining requirements', opts: BMS2, body: 'More building solutions. Please select your requirement.' },
      }),
      L('Property type', 'Property Type', 'Select Property', 'What type of property is this for?', PROPERTY),
      T('Building / project name', 'Please enter the building / project name.'),
      T('Project location', 'Please enter the project location.'),
      T('Approximate building area', 'Please enter the approximate building area.'),
      T('Required solution', 'Please describe the required solution.'),
      B('Project stage', 'New project or renovation?', ['New project', 'Renovation']),
      M('Drawings / photos / specs', 'Please upload project drawings, building photographs or technical specifications.' + CONT, 'project drawings, building photographs or specifications', { accept: 'any', multi: true }),
    ],
    done: 'Thank you for contacting Brightech!\n\nOur building solutions team will review your requirement and get in touch.',
  },

  // NEW: pick an option, then Email / WhatsApp / Call (no more questions)
  career: {
    name: 'Recruitment & Hiring',
    icon: '💼',
    top: 'career',
    topLevel: true,
    steps: [
      L('Requirement', 'Recruitment & Hiring', 'Select Option', 'Welcome to Brightech Recruitment & Hiring!\n\nPlease select your requirement.', CAREER_MENU),
      // Looking for a Job -> careers@, Hiring Employees -> hr@
      CONTACT_STEP('Requirement', (e) => (e.S.data['Requirement'] === 'Hiring Employees' ? 'hr' : 'careers')),
    ],
  },

  // The old detailed enquiry for this service. Not in the menu: kept for the tests / future use.
  career_full: {
    name: 'Career & Recruitment',
    icon: '💼',
    top: 'career',
    topLevel: true,
    steps: [
      L('Requirement', 'Career Solutions', 'Select Option', 'Welcome to Brightech Career Solutions!\n\nPlease select your requirement.', CAREER, {
        goto: { 'looking for a job': 'career_job', 'hiring employees': 'career_emp', 'internship enquiry': 'career_int', 'other recruitment enquiry': 'career_other' },
      }),
    ],
  },
  career_job: {
    name: 'Career & Recruitment: Job seeker',
    icon: '💼',
    top: 'career',
    steps: [
      L('Job category', 'Job Category', 'Select Category', 'Please select a job category.', JOBCAT),
      T('Full name', 'Please enter your full name.'),
      T('Qualification', 'Please enter your qualification.'),
      T('Work experience', 'Please enter your work experience.'),
      T('Preferred job role', 'Please enter your preferred job role.'),
      T('Preferred location', 'Please enter your preferred location.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
      M('Resume (PDF)', 'Please upload your resume as a PDF.', 'your resume as a PDF document', { accept: 'pdf', opt: true }),
    ],
    done: 'Thank you for submitting your career enquiry!\n\nOur recruitment team will review your details and contact you if a suitable opportunity is available.',
  },
  career_emp: {
    name: 'Career & Recruitment: Employer',
    icon: '💼',
    top: 'career',
    steps: [
      T('Company name', 'Please enter your company name.'),
      T('Contact person', 'Please enter the contact person’s name.'),
      T('Required designation', 'Please enter the required designation.'),
      T('Number of vacancies', 'Please enter the number of vacancies.', { v: 'num' }),
      T('Required qualification', 'Please enter the required qualification.'),
      T('Experience required', 'Please enter the experience required.'),
      T('Job location', 'Please enter the job location.'),
      T('Hiring timeline', 'Please enter the hiring timeline.'),
    ],
    done: 'Thank you! Our recruitment team will contact you regarding your hiring requirement.',
  },
  career_int: {
    name: 'Career & Recruitment: Internship',
    icon: '💼',
    top: 'career',
    steps: [
      T('Full name', 'Please enter your full name.'),
      T('Qualification', 'Please enter your qualification.'),
      T('Preferred department', 'Please enter your preferred department.'),
      T('Internship duration', 'Please enter the internship duration you prefer.'),
      T('Preferred location', 'Please enter your preferred location.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
    ],
    done: 'Thank you for your internship enquiry. Our team will contact you with further information.',
  },
  career_other: {
    name: 'Career & Recruitment: Other',
    icon: '💼',
    top: 'career',
    steps: [
      T('Name', 'Please enter your name.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
      T('Brief requirement', 'Please tell us briefly about your recruitment enquiry.'),
    ],
    done: 'Thank you! Our recruitment team will contact you regarding your enquiry.',
  },

  // NEW: Select Title (the client's 7 titles) -> Email / WhatsApp / Call
  trainingdiv: {
    name: 'Training Division & R&D Division',
    icon: '🎓',
    top: 'trainingdiv',
    topLevel: true,
    steps: [
      L('Title', 'Training Division', 'Select Title', 'TRAINING DIVISION & R&D DIVISION\n\nPlease select a title.', TRAINING_ROWS),
      CONTACT_STEP((e) => fullTitle(TRAINING_TITLES, e.S.data['Title'])),
    ],
  },

  // NEW: Select Title (the client's 7 titles) -> Email / WhatsApp / Call
  pcbdesign: {
    name: 'PCB Reverse Engineering & PCB New Design',
    icon: '🧩',
    top: 'pcbdesign',
    topLevel: true,
    steps: [
      L('Title', 'PCB Reverse & Design', 'Select Title', 'PCB REVERSE ENGINEERING & PCB NEW DESIGN\n\nPlease select a title.', PCB_DESIGN_ROWS),
      CONTACT_STEP((e) => fullTitle(PCB_DESIGN_TITLES, e.S.data['Title'])),
    ],
  },

  // NEW: Contact Us: pick a branch -> its address -> then Email / WhatsApp / Call (below the address)
  contactus: {
    name: 'Contact Us',
    icon: '📍',
    top: 'contactus',
    topLevel: true,
    steps: [
      L('Branch', 'Contact Us', 'Select Branch', 'Brightech Group - Contact Us\n\nPlease select the branch to see its address.', BRANCH_ROWS),
      B('Contact', (e) => (contact.singleStyle() ? contact.enquiryBody(e.S.data['Branch'] + ' Branch') : ASK_MORE), ['Main Menu', 'End Conversation'], {
        nonav: true,
        again: ASK_MORE,
        // sent first: the branch address; then (cards style) the same Email / WhatsApp / Call cards as everywhere else
        links: (e) => [{ text: BRANCH_TEXT[e.S.data['Branch']] || BRANCH_TEXT.Bangalore }].concat(contact.singleStyle() ? [] : contact.enquiryItems(e.S.data['Branch'] + ' Branch', appEnv.PUBLIC_BASE_URL)),
        route: { 'main menu': 'MAIN', 'end conversation': 'END' },
      }),
    ],
  },

  // Company Information: the About Brightech information (no list of old options, no "to be confirmed")
  coinfo: {
    name: 'Company Information',
    icon: 'ℹ️',
    top: 'coinfo',
    topLevel: true,
    steps: [
      B('About', 'Is there anything else we can help you with?', ['Main Menu', 'End Conversation'], {
        nonav: true,
        links: () => [{ text: ABOUT_TEXT }], // sent first: the information
        route: { 'main menu': 'MAIN', 'end conversation': 'END' },
      }),
    ],
  },

  contact: {
    name: 'Contact Our Team',
    icon: '📞',
    top: 'contact',
    topLevel: true,
    steps: [
      L('Department', 'Select Department', 'Select Department', 'We would be happy to assist you!\n\nPlease select the department you want to contact.', DEPTS),
      T('Customer name', 'Please enter your name.'),
      T('Contact number', 'Please enter your contact number.', { v: 'phone' }),
      T('Brief requirement', 'Please tell us your requirement briefly.'),
    ],
    done: (d) =>
      '🔄 *Human support handover*\nWhere available, a team member from *' +
      (d['Department'] || 'the selected department') +
      '* will take over this chat.\n\nIf our team is not available right now:\n• Business hours: To be confirmed\n• Expected response time: To be confirmed\n• Department contact details: To be confirmed',
  },

  vfd: {
    name: 'AC Drive / VFD',
    steps: [
      B('VFD need', 'AC Drive / VFD: how can we help you?', ['Product enquiry', 'Repair / Service'], {
        route: {
          'product enquiry': { go: 'product', idx: 2, preset: { Segment: 'Industrial Segment', Product: 'AC Drives (VFD)' }, intro: 'Welcome to Brightech Product Enquiry!\n\n' + infoMsg(2) },
          'repair / service': { go: 'service', idx: 1, preset: { Segment: 'Industrial Segment' }, intro: '🔧 *PCB REPAIR & SERVICE – ANY BRANDS*\n\n*Industrial Segment*' },
        },
      }),
    ],
  },
};

/* ---------------- Keyword shortcuts ---------------- */
const KW = {
  product: 'product',
  repair: 'service',
  plc: { go: 'product', idx: 2, preset: { Segment: 'Industrial Segment', Product: 'PLC-CPU' }, intro: 'Welcome to Brightech Product Enquiry!\n\n' + infoMsg(0) },
  vfd: 'vfd',
  career: 'career',
  training: 'trainingdiv',
  'reverse engineering': 'pcbdesign',
  contact: 'contactus',
  // hidden shortcuts to the old detailed enquiries (used by the tests)
  'full product enquiry': 'product_full',
  'full service enquiry': 'service_full',
  'full automation enquiry': 'auto_full',
  'full robotics enquiry': 'robo_full',
  'full bms enquiry': 'bms_full',
  'full career enquiry': 'career_full',
  'full contact enquiry': 'contact', // the old Contact Our Team (departments) page
};
const GREET = ['hi', 'hello', 'good morning', 'good evening', 'hey', 'hii', 'hai'];

const REF_CODES = { product: 'PRD', service: 'SVC', auto: 'AUT', robo: 'ROB', bms: 'BMS', career: 'CAR', contact: 'CNT' };

/**
 * First-level options of the menu services. A customer often taps an option of an OLD list that is still in the chat
 * (for example "AC Drive / VFD" after the enquiry is finished): the bot then opens that option instead of complaining.
 * Only options with a text that is unique across these lists are used ("Other" is too common to be one of them).
 */
const GLOBAL_OPTS = [];
[
  ['auto', 1, 'Solution type', AUTO],
  ['robo', 1, 'Service', ROBO],
  ['bms', 1, 'Requirement', BMS_SERVICES],
  ['career', 1, 'Requirement', CAREER_MENU],
  ['contactus', 1, 'Branch', BRANCH_ROWS],
].forEach(([go, idx, key, rows]) => rows.forEach((r) => GLOBAL_OPTS.push({ t: r.t, go, idx, preset: { [key]: r.t } })));
const optKey = (t) => strip(t);
for (let i = GLOBAL_OPTS.length - 1; i >= 0; i -= 1) {
  const k = optKey(GLOBAL_OPTS[i].t);
  if (k === 'other' || GLOBAL_OPTS.filter((o) => optKey(o.t) === k).length > 1) GLOBAL_OPTS.splice(i, 1);
}

module.exports = { WELCOME_INTRO, WELCOME, ABOUT_TEXT, MAINOPTS, FL, KW, GREET, GLOBAL_OPTS, SCHED_TEXT, TIME_SLOTS, REF_CODES, buildDateOptions, infoMsg };
