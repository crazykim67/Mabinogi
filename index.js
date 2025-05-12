require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const schedule = require('node-schedule');

const boundaryTimes = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
const fieldBossTimes = ['12:00', '18:00', '20:00', '22:00'];
// const boundaryTimes = ['17:10', '17:20', '17:30', '17:40', '17:50', '18:00', '18:10'];
// const fieldBossTimes = ['17:10', '17:16', '17:20', '17:26'];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function saveUserSetting(userId, setting) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_settings`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ user_id: userId, setting })
  });
  if (!res.ok) console.error(`❌ Supabase 저장 실패 (${userId}):`, await res.text());
}

async function loadAllUserSettings() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_settings`, {
    headers: {
      apikey: process.env.SUPABASE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`
    }
  });
  const data = await res.json();
  const result = {};
  for (const row of data) result[row.user_id] = row.setting;
  return result;
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity(`🎮 마비노기 `, { type: 0 });
  boundaryTimes.forEach(t => registerAlarm(t, 'boundary'));
  fieldBossTimes.forEach(t => registerAlarm(t, 'field'));

  const channel = await client.channels.fetch(process.env.SETTING_CHANNEL_ID);
  if (!channel) return;

// 기존 메시지 삭제 (자신이 보낸 메시지 중 임베드 제목이 일치하는 것만)
  const messages = await channel.messages.fetch({ limit: 50 });
  const botMessages = messages.filter(m =>
    m.author.id === client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0].title === '📢 야채가게 뿌대노기 알리미 설정'
  );

  for (const msg of botMessages.values()) {
    try {
      await msg.delete();
      console.log(`🗑️ 이전 설정 메시지 삭제됨 (ID: ${msg.id})`);
    } catch (err) {
      console.warn(`⚠️ 메시지 삭제 실패: ${err.message}`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('📢 야채가게 뿌대노기 알리미 설정')
    .setDescription(
      '버튼을 눌러 알림을 설정하세요.\n\n' +
      '필드보스, 결계 알림을 각각 선택하거나,\n모든 알림 켜기·끄기로 편하게 관리할 수 있습니다.\n\n' +
      '**⏰ 필드보스/결계 시간 5분 전·정각에 알림을 보냅니다.**'
    )
    .setColor(0x93D34A)
    .setThumbnail('https://dszw1qtcnsa5e.cloudfront.net/community/20250204/a1a338aa-2cac-4d1b-a41c-404f1a307cfe/media01.png');

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('alert_all').setLabel('결계-모든시간').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('alert_morning').setLabel('결계-오전').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('alert_afternoon').setLabel('결계-오후').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('alert_no_late').setLabel('결계-심야제외').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('only_fieldboss').setLabel('필드보스만 알림받기').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('alert_all_on').setLabel('모든 알림 켜기').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('alert_all_off').setLabel('모든 알림 끄기').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const id = interaction.customId;

    let title = '✅ 알림 설정 완료';
    let description = {
      alert_all: '[결계-모든시간] 알림이 설정되었습니다.',
      alert_morning: '[결계-오전] 알림이 설정되었습니다.',
      alert_afternoon: '[결계-오후] 알림이 설정되었습니다.',
      alert_no_late: '[결계-심야 제외] 알림이 설정되었습니다.',
      only_fieldboss: '[필드보스만 알림]이 설정되었습니다.',
      alert_all_on: '모든 알림이 켜졌습니다.',
      alert_all_off: '모든 알림이 비활성화되었습니다.'
    }[id] || '알 수 없는 버튼이 클릭되었습니다.';

    if (id === 'alert_all_off') title = '🛑 모든 알림 꺼짐';
    else if (!description) title = '⚠️ 알 수 없는 설정';

        try {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(0x93D34A)
          .setTimestamp()
        ],
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ 이미 응답된 인터랙션입니다:', err);
    }
    saveUserSetting(userId, id).catch(console.error);
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📘 야채가게 뿌대노기 알리미 사용법')
      .setDescription(
        `이 봇은 결계/필드보스 알림을 원하는 시간대에 자동으로 알려줍니다.\n\n` +
        `**🔘 버튼 설명**\n` +
        `- 🛡️ 결계: 오전 / 오후 / 전체 시간 설정 가능\n` +
        `- 👹 필드보스: 정해진 시간에만 등장 (12시, 18시, 20시, 22시)\n\n` +
        `**⚙️ 설정 방법**\n` +
        `설정 채널에서 버튼을 클릭해 원하는 알림을 선택하면 됩니다.\n\n` +
        `**🔕 모든 알림 끄기** 버튼을 누르면 더 이상 알림을 받지 않습니다.`
      )
      .setColor(0x00BFFF)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

function registerAlarm(timeStr, type) {
  const [hour, minute] = timeStr.split(':').map(Number);
  schedule.scheduleJob(`${minute} ${hour} * * *`, () => sendAlarms(type, false));
  const preMinute = (minute - 5 + 60) % 60;
  const preHour = (minute - 5 < 0) ? (hour - 1 + 24) % 24 : hour;
  schedule.scheduleJob(`${preMinute} ${preHour} * * *`, () => sendAlarms(type, true));
}

async function sendAlarms(type, isPreNotice) {
  const settings = await loadAllUserSettings();
  const channel = await client.channels.fetch(process.env.ALERT_CHANNEL_ID);
  if (!channel) return;
  const mentionIds = [];
  for (const [userId, setting] of Object.entries(settings)) {
    const shouldNotify =
      setting === 'alert_all_on' ||
      (type === 'boundary' && (
  setting === 'alert_all' ||
  setting === 'alert_morning' && isMorningTime() ||
  setting === 'alert_afternoon' && isAfternoonTime() ||
  setting === 'alert_no_late' && !isLateNightTime() ||
  setting === 'alert_all_on'
)) ||
(type === 'field' && (
  setting === 'only_fieldboss' || 
  setting === 'alert_all_on'
))

    if (shouldNotify) mentionIds.push(`<@${userId}>`);
  }
  if (mentionIds.length === 0) return;
  const embed = new EmbedBuilder()
    .setTitle(isPreNotice ? '⏰ 5분 전 알림' : '🚨 정시 알림')
    .setDescription(
      type === 'boundary'
        ? (isPreNotice ? '🛡️ 5분 후 결계가 시작됩니다!' : '🛡️ 결계 시간입니다!')
        : (isPreNotice ? '👹 5분 후 필드보스 등장!' : '👹 필드보스 출현!')
    )
    .setColor(type === 'boundary' ? 0x00BFFF : 0x93D34A)
    .setThumbnail(isPreNotice ? 'https://dszw1qtcnsa5e.cloudfront.net/community/20250423/2f7d3618-8140-4bc8-9621-f81dbd8b40a6/%EC%B6%9C%EC%A0%95%EC%9D%98%EB%B0%94%EB%9E%8C%EA%B2%8C%EC%8B%9C%EB%AC%BC1280x720.png' : 'https://dszw1qtcnsa5e.cloudfront.net/community/20250326/d8fe4dce-de91-4cde-9bc0-43ce3ae99ed6/%EA%B8%80%EB%9D%BC%EC%8A%A4%EA%B8%B0%EB%B8%8C%EB%84%A8%EA%B3%BC%EC%9D%98%EC%A1%B0%EC%9A%B0.png')
    .setTimestamp();
  // await channel.send({ content: mentionIds.join(' '), embeds: [embed] });

  const msg = await channel.send({ content: mentionIds.join(' '), embeds: [embed] });

  setTimeout(() => {
    msg.delete().catch(err => console.warn('❌ 메시지 삭제 실패:', err.message));
  }, 600000); // 10분 뒤
}

function isMorningTime() {
  const hour = new Date().getHours();
  return [0, 3, 6, 9].includes(hour);
}
function isAfternoonTime() {
  const hour = new Date().getHours();
  return [12, 15, 18, 21].includes(hour);
}
function isLateNightTime() {
  const hour = new Date().getHours();
  return [0, 3].includes(hour);
}

//#region 슬래시 명령어 등록
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function registerGuildCommands() {
  const commands = [
    new SlashCommandBuilder().setName('help').setDescription('📘 뿌대노기 봇 사용법을 안내합니다.').toJSON()
  ];
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ 서버 전용 슬래시 명령어 등록 완료');
}

async function clearGlobalCommands() {
  const commands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
  for (const cmd of commands) {
    console.log(`🧹 글로벌 명령 삭제 중: ${cmd.name}`);
    await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
  }
  console.log('✅ 글로벌 명령어 정리 완료');
}

async function clearGuildCommands(guildId) {
  const commands = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId));
  for (const cmd of commands) {
    console.log(`🧹 서버(${guildId}) 명령 삭제 중: ${cmd.name}`);
    await rest.delete(Routes.applicationGuildCommand(process.env.CLIENT_ID, guildId, cmd.id));
  }
  console.log(`✅ 서버(${guildId}) 명령어 정리 완료`);
}

(async () => {
  await clearGlobalCommands();
  await clearGuildCommands(process.env.GUILD_ID);
  await registerGuildCommands();
})();
//#endregion

client.login(process.env.DISCORD_BOT_TOKEN);