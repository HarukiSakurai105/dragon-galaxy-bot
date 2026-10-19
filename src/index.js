import { ActivityType, Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import http from 'node:http';
import { commandData } from './commands.js';
import { config, validateConfig } from './config.js';
import { handleInteraction, sendLeave, sendWelcome } from './interactions.js';
import { validateSnapshot } from './template.js';

validateConfig();
const templateInfo = validateSnapshot();

const health = { startedAt: new Date().toISOString(), discordReady: false, botTag: null, applicationId: null, guildCount: 0, template: templateInfo };
const port = Number(process.env.PORT || 3001);
const healthServer = http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/health') {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return response.end(JSON.stringify({ ok: true, service: 'Dragon Galaxy Bot', ...health }));
});
healthServer.listen(port, '0.0.0.0', () => console.log(`✅ Health server listening on port ${port}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages]
});
const rest = new REST({ version: '10' }).setToken(config.token);

async function registerGuild(guild) {
  // ID của bot đã đăng nhập chính là Application ID đáng tin cậy.
  // Không dùng nhầm Guild ID được nhập thủ công trong CLIENT_ID.
  const applicationId = client.user?.id;
  if (!applicationId) throw new Error('Bot chưa đăng nhập nên chưa xác định được Application ID.');
  await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), { body: commandData });
  console.log(`✅ ${guild.name}: đã đăng ký ${commandData.length} slash command`);
}

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Bot online: ${readyClient.user.tag}`);
  health.discordReady = true;
  health.botTag = readyClient.user.tag;
  health.applicationId = readyClient.user.id;
  health.guildCount = readyClient.guilds.cache.size;
  if (config.clientId && config.clientId !== readyClient.user.id) {
    console.warn(`⚠️ CLIENT_ID=${config.clientId} không khớp bot ${readyClient.user.id}; bot sẽ tự dùng ID đúng.`);
  }
  readyClient.user.setPresence({ activities: [{ name: `${config.brandName} • /help`, type: ActivityType.Watching }], status: 'online' });
  for (const guild of readyClient.guilds.cache.values()) await registerGuild(guild).catch(error => console.error(`Không đăng ký được lệnh cho ${guild.name}:`, error));
});

client.on(Events.GuildCreate, async guild => {
  health.guildCount = client.guilds.cache.size;
  await registerGuild(guild).catch(error => console.error(`Không đăng ký được lệnh cho ${guild.name}:`, error));
});
client.on(Events.GuildDelete, () => { health.guildCount = client.guilds.cache.size; });
client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.GuildMemberAdd, sendWelcome);
client.on(Events.GuildMemberRemove, sendLeave);

process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught exception:', error));

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down…`);
  health.discordReady = false;
  client.destroy();
  healthServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

client.login(config.token);
