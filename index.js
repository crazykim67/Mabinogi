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

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, 'user-settings.json');

// 유저 설정 불러오기
function loadUserSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath);
  return JSON.parse(raw);
}

// 유저 설정 저장하기
function saveUserSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity(`🎮 마비노기 `, {
    type: 0 // Playing (기본값), 0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching, 5 = Competing
});
  for (const time of boundaryTimes) {
    registerAlarm(time, 'boundary');
  }
  for (const time of fieldBossTimes) {
    registerAlarm(time, 'field');
  }

  const channel = await client.channels.fetch(process.env.SETTING_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
  .setTitle('📢 야채가게 뿌대노기 알리미 설정')
  .setDescription(
    '버튼을 눌러 알림을 설정하세요.\n\n' +
    '필드보스, 결계 알림을 각각 선택하거나,\n모든 알림 켜기·끄기로 편하게 관리할 수 있습니다.\n\n' +
    '**⏰ 필드보스/결계 시간 5분 전·정각에 알림을 보냅니다.**'
  )
  .setColor(0x93D34A)
  .setThumbnail('https://dszw1qtcnsa5e.cloudfront.net/community/20250204/a1a338aa-2cac-4d1b-a41c-404f1a307cfe/media01.png'); // 썸네일 이미지 URL (원하는 이미지로 교체)

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

  await channel.send({
    embeds: [embed],
    components: [row1, row2]
  });
});

// 나중에 버튼 처리도 여기에 추가됨
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const id = interaction.customId;

  const settings = loadUserSettings();
  settings[userId] = id; // 유저 ID에 알림 타입 저장
  saveUserSettings(settings);

  // 버튼에 따라 메시지 다르게 출력
  let title = '✅ 알림 설정 완료';
  let description = '';

  switch (id) {
    case 'alert_all':
      description = '[결계-모든시간] 알림이 설정되었습니다.';
      break;
    case 'alert_morning':
      description = '[결계-오전] 알림이 설정되었습니다.';
      break;
    case 'alert_afternoon':
      description = '[결계-오후] 알림이 설정되었습니다.';
      break;
    case 'alert_no_late':
      description = '[결계-심야 제외] 알림이 설정되었습니다.';
      break;
    case 'only_fieldboss':
      description = '[필드보스만 알림]이 설정되었습니다.';
      break;
    case 'alert_all_on':
      description = '모든 알림이 켜졌습니다.';
      break;
    case 'alert_all_off':
      title = '🛑 모든 알림 꺼짐';
      description = '모든 알림이 비활성화되었습니다.';
      break;
    default:
      title = '⚠️ 알 수 없는 설정';
      description = '알 수 없는 버튼이 클릭되었습니다.';
      break;
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x93D34A)
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
});

function registerAlarm(timeStr, type) {
  const [hour, minute] = timeStr.split(':').map(Number);

  // 정각 알림
  schedule.scheduleJob(`${minute} ${hour} * * *`, () => {
    sendAlarms(type, false);
  });

  // 5분 전 알림
  const preMinute = (minute - 5 + 60) % 60;
  const preHour = (minute - 5 < 0) ? (hour - 1 + 24) % 24 : hour;

  schedule.scheduleJob(`${preMinute} ${preHour} * * *`, () => {
    sendAlarms(type, true);
  });
}

async function sendAlarms(type, isPreNotice) {
  const settings = loadUserSettings();
  const channel = await client.channels.fetch(process.env.ALERT_CHANNEL_ID);
  if (!channel) {
    console.error('❌ 알림 채널을 찾을 수 없습니다.');
    return;
  }

  const users = Object.entries(settings);
  const mentionIds = [];

  for (const [userId, setting] of users) {
    const shouldNotify =
      setting === 'alert_all_on' ||
      (type === 'boundary' && (
        setting === 'alert_all' ||
        (setting === 'alert_morning' && isMorningTime()) ||
        (setting === 'alert_afternoon' && isAfternoonTime()) ||
        (setting === 'alert_no_late' && !isLateNightTime())
      )) ||
      (type === 'field' && (setting === 'only_fieldboss' || setting === 'alert_all_on'));

    if (shouldNotify) {
      mentionIds.push(`<@${userId}>`);
    }
  }

  if (mentionIds.length === 0) return; // 아무도 설정 안 했으면 전송 X

  const embed = new EmbedBuilder()
    .setTitle(isPreNotice ? '⏰ 5분 전 알림' : '🚨 정시 알림')
    .setDescription(type === 'boundary'
      ? (isPreNotice ? '🛡️ 5분 후 결계가 시작됩니다!' : '🛡️ 결계 시간입니다!')
      : (isPreNotice ? '👹 5분 후 필드보스 등장!' : '👹 필드보스 출현!'))
    .setColor(type === 'boundary' ? 0x00BFFF : 0x93D34A)
    .setTimestamp();

  await channel.send({
    content: mentionIds.join(' '),
    embeds: [embed]
  });
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

//#region 커맨드

// async function registerSlashCommands() {
//   const commands = [
//     new SlashCommandBuilder()
//       .setName('help')
//       .setDescription('📘 알리미 봇 사용법을 안내합니다.')
//       .toJSON()
//   ];

//   const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

//   try {
//     console.log('🔄 슬래시 명령어 등록 중...');
//     await rest.put(
//       Routes.applicationCommands(process.env.CLIENT_ID),
//       { body: commands }
//     );
//     console.log('✅ 슬래시 명령어 등록 완료!');
//   } catch (error) {
//     console.error('❌ 슬래시 명령어 등록 실패:', error);
//   }
// }

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

async function clearGlobalCommands() {
  const commands = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
  for (const cmd of commands) {
    console.log(`🧹 삭제 중: ${cmd.name}`);
    await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, cmd.id));
  }
  console.log('✅ 글로벌 명령어 모두 삭제 완료!');
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await clearGlobalCommands();
});

// client.on(Events.InteractionCreate, async interaction => {
//   if (interaction.isChatInputCommand()) {
//     if (interaction.commandName === 'help') {
//       const embed = new EmbedBuilder()
//         .setTitle('📘 야채가게 뿌대노기 알리미 사용법')
//         .setDescription(
//           `이 봇은 결계/필드보스 알림을 원하는 시간대에 자동으로 알려줍니다.\n\n` +
//           `**🔘 버튼 설명**\n` +
//           `- 🛡️ 결계: 오전 / 오후 / 전체 시간 설정 가능\n` +
//           `- 👹 필드보스: 정해진 시간에만 등장 (12시, 18시, 20시, 22시)\n\n` +
//           `**⚙️ 설정 방법**\n` +
//           `설정 채널에서 버튼을 클릭해 원하는 알림을 선택하면 됩니다.\n\n` +
//           `**🔕 모든 알림 끄기** 버튼을 누르면 더 이상 알림을 받지 않습니다.`
//         )
//         .setColor(0x00BFFF)
//         .setTimestamp();

//       await interaction.reply({
//         embeds: [embed],
//         ephemeral: true
//       });
//     }
//   }
// });

//#endregion

client.login(process.env.DISCORD_BOT_TOKEN);