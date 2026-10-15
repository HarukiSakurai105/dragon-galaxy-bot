import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { categorySpecs, channelSpecs, roleSpecs, snapshot } from './template.js';
import { getGuildData, updateGuildData } from './storage.js';

function permissionBits(names = []) {
  return names.reduce((bits, name) => {
    const flag = PermissionFlagsBits[name];
    return flag === undefined ? bits : bits | flag;
  }, 0n);
}

function primaryColor(hex) {
  return Number.parseInt(String(hex || '#000000').replace('#', ''), 16) || 0;
}

function findRole(guild, name, originalId, roleMap) {
  const mappedId = roleMap[originalId];
  return guild.roles.cache.get(mappedId)
    || (guild.id === snapshot.server.id ? guild.roles.cache.get(originalId) : null)
    || guild.roles.cache.find(role => !role.managed && role.name === name)
    || null;
}

function mapOverwrites(guild, overwrites, rolesByName, roleMap) {
  const result = [];
  for (const item of overwrites || []) {
    let targetId = null;
    if (item.targetType === 'role') {
      if (item.id === snapshot.server.id || item.targetName === '@everyone') targetId = guild.roles.everyone.id;
      else targetId = roleMap[item.id]
        || (guild.id === snapshot.server.id && guild.roles.cache.has(item.id) ? item.id : null)
        || rolesByName.get(item.targetName)?.id;
    } else if (guild.id === snapshot.server.id) {
      targetId = item.id;
    }
    if (!targetId) continue;
    result.push({ id: targetId, allow: permissionBits(item.allow), deny: permissionBits(item.deny) });
  }
  return result;
}

async function ensureRole(guild, spec, storedId, sync, warnings) {
  let role = guild.roles.cache.get(storedId)
    || (guild.id === snapshot.server.id ? guild.roles.cache.get(spec.id) : null)
    || guild.roles.cache.find(item => !item.managed && item.name === spec.name);
  const options = {
    name: spec.name,
    colors: { primaryColor: primaryColor(spec.color) },
    hoist: Boolean(spec.hoist),
    mentionable: Boolean(spec.mentionable),
    permissions: new PermissionsBitField(permissionBits(spec.permissions)),
    reason: 'Dragon Galaxy snapshot synchronization'
  };
  if (!role) {
    role = await guild.roles.create(options);
  } else if (sync && role.editable) {
    await role.edit(options);
  } else if (sync && !role.editable) {
    warnings.push(`Không thể cập nhật role ${role.name}: role cao hơn bot hoặc do Discord quản lý.`);
  }
  return role;
}

function supportedChannelType(type) {
  const supported = [
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ];
  return supported.includes(type) ? type : ChannelType.GuildText;
}

function channelEditOptions(spec, parentId) {
  const options = { name: spec.name, reason: 'Dragon Galaxy snapshot synchronization' };
  if (parentId) options.parent = parentId;
  if (spec.topic !== undefined && spec.topic !== null) options.topic = spec.topic;
  if (spec.nsfw !== undefined) options.nsfw = Boolean(spec.nsfw);
  if (spec.slowmodeSeconds !== undefined) options.rateLimitPerUser = spec.slowmodeSeconds || 0;
  if (spec.bitrate) options.bitrate = spec.bitrate;
  if (spec.userLimit !== undefined) options.userLimit = spec.userLimit || 0;
  if (spec.rtcRegion !== undefined) options.rtcRegion = spec.rtcRegion;
  if (spec.videoQualityMode) options.videoQualityMode = spec.videoQualityMode;
  return options;
}

async function ensureChannel(guild, spec, storedId, parentId, overwrites, sync, warnings) {
  const expectedType = supportedChannelType(spec.typeCode);
  let channel = guild.channels.cache.get(storedId)
    || (guild.id === snapshot.server.id ? guild.channels.cache.get(spec.id) : null)
    || guild.channels.cache.find(item => item.name === spec.name && item.type === expectedType && (spec.type === 'Category' || item.parentId === parentId));

  if (!channel) {
    const createOptions = {
      ...channelEditOptions(spec, parentId),
      type: expectedType,
      permissionOverwrites: overwrites
    };
    try {
      channel = await guild.channels.create(createOptions);
    } catch (error) {
      if (![ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(expectedType)) throw error;
      warnings.push(`${spec.name}: server không hỗ trợ loại ${spec.type}; đã tạo kênh text thay thế.`);
      channel = await guild.channels.create({ ...createOptions, type: ChannelType.GuildText });
    }
  } else if (sync) {
    if (channel.manageable) await channel.edit(channelEditOptions(spec, parentId));
    await channel.permissionOverwrites.set(overwrites, 'Dragon Galaxy snapshot synchronization').catch(error => warnings.push(`${spec.name}: không cập nhật được permission (${error.message}).`));
  }
  return channel;
}

async function orderStructure(guild, roleMap, channelMap, warnings) {
  const orderedRoles = roleSpecs.map(spec => guild.roles.cache.get(roleMap[spec.id])).filter(Boolean);
  try {
    await guild.roles.setPositions(orderedRoles.map((role, index) => ({ role, position: index + 1 })));
  } catch (error) {
    warnings.push(`Không xếp được toàn bộ role: ${error.message}. Hãy kéo role bot lên cao nhất rồi chạy lại chế độ đồng bộ.`);
  }

  try {
    const categories = categorySpecs.map(spec => guild.channels.cache.get(channelMap[spec.id])).filter(Boolean);
    await guild.channels.setPositions(categories.map((channel, index) => ({ channel, position: index })));
    for (const categorySpec of categorySpecs) {
      const children = channelSpecs
        .filter(spec => spec.parentId === categorySpec.id)
        .map(spec => guild.channels.cache.get(channelMap[spec.id]))
        .filter(Boolean);
      if (children.length) await guild.channels.setPositions(children.map((channel, index) => ({ channel, position: index })));
    }
  } catch (error) {
    warnings.push(`Không xếp được toàn bộ kênh: ${error.message}.`);
  }
}

export async function setupFromSnapshot(guild, { sync = false, progress = async () => {} } = {}) {
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
  const stored = await getGuildData(guild.id);
  const roleMap = { ...(stored.roles || {}) };
  const channelMap = { ...(stored.channels || {}) };
  const rolesByName = new Map();
  const warnings = [];

  await progress(`Đang đồng bộ ${roleSpecs.length} role...`);
  for (const spec of roleSpecs) {
    try {
      const role = await ensureRole(guild, spec, roleMap[spec.id], sync, warnings);
      roleMap[spec.id] = role.id;
      rolesByName.set(spec.name, role);
    } catch (error) {
      warnings.push(`Role ${spec.name}: ${error.message}`);
    }
  }

  for (const role of guild.roles.cache.values()) if (!rolesByName.has(role.name)) rolesByName.set(role.name, role);

  await progress(`Đang đồng bộ ${categorySpecs.length} category...`);
  for (const spec of categorySpecs) {
    try {
      const overwrites = mapOverwrites(guild, spec.permissionOverwrites, rolesByName, roleMap);
      const category = await ensureChannel(guild, spec, channelMap[spec.id], null, overwrites, sync, warnings);
      channelMap[spec.id] = category.id;
    } catch (error) {
      warnings.push(`Category ${spec.name}: ${error.message}`);
    }
  }

  await progress(`Đang đồng bộ ${channelSpecs.length} kênh chat/voice...`);
  for (const spec of channelSpecs) {
    try {
      const parentId = spec.parentId ? channelMap[spec.parentId] : null;
      const overwrites = mapOverwrites(guild, spec.permissionOverwrites, rolesByName, roleMap);
      const channel = await ensureChannel(guild, spec, channelMap[spec.id], parentId, overwrites, sync, warnings);
      channelMap[spec.id] = channel.id;
    } catch (error) {
      warnings.push(`Kênh ${spec.name}: ${error.message}`);
    }
  }

  if (sync) {
    await progress('Đang sắp xếp role và kênh...');
    await orderStructure(guild, roleMap, channelMap, warnings);
  }

  const state = await updateGuildData(guild.id, current => ({
    ...current,
    setupComplete: true,
    roles: roleMap,
    channels: channelMap,
    lastSetupAt: new Date().toISOString(),
    sourceSnapshot: snapshot.generatedAt
  }));

  return {
    state,
    roles: Object.keys(roleMap).length,
    channels: Object.keys(channelMap).length,
    warnings
  };
}

