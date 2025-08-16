require('dotenv').config();
const { Telegraf } = require('telegraf');
const mqtt = require('mqtt');

// ---------- Config ----------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'varal/controle';

// tempo mínimo entre comandos recolher/liberar (ms)
const tempoGiroMotor = 3000; // ajuste conforme o firmware

if (!BOT_TOKEN) {
  console.error('Faltou TELEGRAM_BOT_TOKEN no .env');
  process.exit(1);
}

// ---------- Telegram ----------
const bot = new Telegraf(BOT_TOKEN);

// ---------- MQTT ----------
const mqttClient = mqtt.connect(MQTT_URL, {
  clean: true,
  reconnectPeriod: 3000,
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado em', MQTT_URL);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) console.error('[MQTT] Erro ao assinar', MQTT_TOPIC, err);
    else console.log('[MQTT] Assinado', MQTT_TOPIC);
  });
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Erro:', err.message);
});

// Mapa para aguardar resposta de status por chat
const pendingStatusWaiters = new Map(); // chatId -> resolve()

function looksLikeStatus(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    ['estado', 'modo', 'umidade', 'motor'].every((k) =>
      Object.prototype.hasOwnProperty.call(obj, k)
    )
  );
}

// Recebe mensagens do MQTT
mqttClient.on('message', (topic, payloadBuffer) => {
  const payloadStr = payloadBuffer.toString('utf8').trim();
  try {
    const data = JSON.parse(payloadStr);
    if (looksLikeStatus(data)) {
      console.log('[MQTT] Status recebido:', data);
      for (const [chatId, resolver] of pendingStatusWaiters.entries()) {
        resolver(data);
        pendingStatusWaiters.delete(chatId);
      }
    }
  } catch {
    // Não é JSON
  }
});

function publishCommand(cmd) {
  mqttClient.publish(MQTT_TOPIC, cmd, { qos: 0, retain: false });
}

function waitForStatus(chatId, timeoutMs = 7000) {
  if (pendingStatusWaiters.has(chatId)) {
    pendingStatusWaiters.delete(chatId);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingStatusWaiters.delete(chatId);
      reject(new Error('timeout'));
    }, timeoutMs);
    pendingStatusWaiters.set(chatId, (statusObj) => {
      clearTimeout(timer);
      resolve(statusObj);
    });
  });
}

function normalizeText(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatStatusMessage(st) {
  return [
    '📊 *Status do Varal*',
    `• Estado: *${st.estado || '-'}*`,
    `• Modo: *${st.modo || '-'}*`,
    `• Umidade: *${st.umidade || '-'}*`,
  ].join('\n');
}

// ---------- Comandos ----------
const COMMANDS = [
  { re: /^(?:modo )?auto$/, cmd: 'auto', ack: '✅ Ativando modo automático...' },
  { re: /^(?:modo )?manual$/, cmd: 'manual', ack: '✅ Ativando modo manual...' },
  { re: /^recolher$/, cmd: 'recolher', ack: '🔄 Tentando recolher varal...' },
  { re: /^liberar$/, cmd: 'liberar', ack: '🔄 Tentando liberar varal...' },
];

function parseCommand(text) {
  const t = normalizeText(text);
  for (const { re, cmd, ack } of COMMANDS) {
    if (re.test(t)) return { cmd, ack };
  }
  return null;
}

// Controle de tempo entre recolher/liberar por usuário
const ultimoComandoMovimento = {}; // chatId -> timestamp

// ---------- Telegram ----------
bot.start((ctx) =>
  ctx.reply(
    'Olá! Eu controlo o seu Varal Inteligente via MQTT.\n\n' +
      'Comandos:\n' +
      '• modo auto\n' +
      '• modo manual\n' +
      '• liberar\n' +
      '• recolher\n',
    { parse_mode: 'Markdown' }
  )
);

bot.hears(/.*/, async (ctx) => {
  const txt = ctx.message?.text || '';
  const parsed = parseCommand(txt);
  if (!parsed) {
    return ctx.reply(
      'Não entendi 🤔. Tente:\n' +
        '• modo auto\n' +
        '• modo manual\n' +
        '• liberar\n' +
        '• recolher\n',
      { parse_mode: 'Markdown' }
    );
  }

  const { cmd, ack } = parsed;

  // Verifica timeout para recolher/liberar
  if (cmd === 'recolher' || cmd === 'liberar') {
    const now = Date.now();
    const lastTime = ultimoComandoMovimento[ctx.chat.id] || 0;
    if (now - lastTime < tempoGiroMotor) {
      const wait = Math.ceil((tempoGiroMotor - (now - lastTime)) / 1000);
      return ctx.reply(`⚠️ Aguarde ${wait}s antes de enviar outro comando de movimento.`);
    }
    ultimoComandoMovimento[ctx.chat.id] = now;
  }

  await ctx.reply(ack, { parse_mode: 'Markdown' });
  publishCommand(cmd);

  try {
    const status = await waitForStatus(ctx.chat.id, 7000);
    return ctx.reply(formatStatusMessage(status), { parse_mode: 'Markdown' });
  } catch {
    return ctx.reply('⏱️ Não recebi o status a tempo.');
  }
});

// ---------- Iniciar ----------
bot.launch().then(() => {
  console.log('[BOT] Telegram iniciado');
});

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  mqttClient.end(true);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  mqttClient.end(true);
});