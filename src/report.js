import { ChannelType } from 'discord.js';

const typeNames = new Map([
  [ChannelType.GuildText, 'Text'], [ChannelType.GuildVoice, 'Voice'], [ChannelType.GuildCategory, 'Category'],
  [ChannelType.GuildAnnouncement, 'Announcement'], [ChannelType.GuildStageVoice, 'Stage Voice'],
  [ChannelType.GuildForum, 'Forum'], [ChannelType.GuildMedia, 'Media']
]);

function permissions(value) {
  return value?.toArray?.().sort() || [];
}

function overwriteData(item, guild) {
  const isRole = item.type === 0;
  return {
    id: item.id,
    targetType: isRole ? 'role' : 'member',
    targetName: isRole ? guild.roles.cache.get(item.id)?.name || null : guild.members.cache.get(item.id)?.user?.tag || null,
    allow: permissions(item.allow),
    deny: permissions(item.deny)
  };
}

export async function createServerReport(guild, user) {
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  const generatedAt = new Date();
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.position - a.position).map(role => ({
    id: role.id, name: role.name, position: role.position, color: role.hexColor, hoist: role.hoist,
    mentionable: role.mentionable, managed: role.managed, memberCount: role.members.size, permissions: permissions(role.permissions)
  }));
  const channels = [...guild.channels.cache.values()].filter(channel => !channel.isThread?.()).sort((a, b) => a.rawPosition - b.rawPosition).map(channel => ({
    id: channel.id, name: channel.name, type: typeNames.get(channel.type) || `Unknown (${channel.type})`, typeCode: channel.type,
    position: channel.rawPosition, parentId: channel.parentId || null, parentName: channel.parent?.name || null,
    topic: 'topic' in channel ? channel.topic || null : undefined,
    nsfw: 'nsfw' in channel ? Boolean(channel.nsfw) : undefined,
    slowmodeSeconds: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser || 0 : undefined,
    bitrate: 'bitrate' in channel ? channel.bitrate || null : undefined,
    userLimit: 'userLimit' in channel ? channel.userLimit || 0 : undefined,
    permissionOverwrites: channel.permissionOverwrites?.cache ? [...channel.permissionOverwrites.cache.values()].map(item => overwriteData(item, guild)) : []
  }));
  const report = {
    schemaVersion: 1, generatedAt: generatedAt.toISOString(), requestedBy: { id: user.id, tag: user.tag },
    server: { id: guild.id, name: guild.name, ownerId: guild.ownerId, memberCount: guild.memberCount, createdAt: guild.createdAt.toISOString() },
    summary: {
      roles: roles.length,
      categories: channels.filter(channel => channel.typeCode === ChannelType.GuildCategory).length,
      textChannels: channels.filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.typeCode)).length,
      voiceChannels: channels.filter(channel => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.typeCode)).length
    }, roles, channels
  };
  const markdown = [
    `# ${guild.name} — Báo cáo cấu trúc`, '',
    `Xuất lúc: ${report.generatedAt}`, '', '## Role (cao xuống thấp)', '',
    ...roles.map(role => `- **${role.name}** — ID \`${role.id}\` · vị trí ${role.position} · ${role.color} · quyền: ${role.permissions.join(', ') || 'Không có'}`),
    '', '## Category và kênh', '',
    ...channels.map(channel => `- **${channel.name}** — ${channel.type} · ID \`${channel.id}\` · parent: ${channel.parentName || 'Không có'} · vị trí ${channel.position}`)
  ].join('\n');
  const date = generatedAt.toISOString().slice(0, 10);
  return {
    summary: report.summary,
    files: [
      { attachment: Buffer.from(`\uFEFF${markdown}`, 'utf8'), name: `dragon-galaxy-scan-${guild.id}-${date}.md` },
      { attachment: Buffer.from(JSON.stringify(report, null, 2), 'utf8'), name: `dragon-galaxy-scan-${guild.id}-${date}.json` }
    ]
  };
}

