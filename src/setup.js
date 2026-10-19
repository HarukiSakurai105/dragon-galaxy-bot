import { ChannelType, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { categorySpecs, channelSpecs, roleSpecs, snapshot } from './template.js';
import { communityTheme } from './theme.js';
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

const permissionPriority = {
  Administrator: 1_000_000,
  ManageGuild: 100_000,
  ManageRoles: 80_000,
  ManageChannels: 70_000,
  ManageWebhooks: 60_000,
  BanMembers: 50_000,
  KickMembers: 40_000,
  ModerateMembers: 30_000,
  ManageMessages: 20_000,
  ManageThreads: 15_000,
  ManageEvents: 12_000,
  ManageNicknames: 10_000,
  MoveMembers: 8_000,
  MuteMembers: 7_000,
  DeafenMembers: 6_000,
  ViewAuditLog: 5_000
};

function permissionRank(spec) {
  return spec.permissions.reduce((score, name) => score + (permissionPriority[name] || 100), 0);
}

function roleSpecsByPermission() {
  return [...roleSpecs].sort((a, b) => permissionRank(a) - permissionRank(b) || a.position - b.position);
}

function findRole(guild, name, originalId, roleMap) {
  const mappedId = roleMap[originalId];
  return (guild.id === snapshot.server.id ? guild.roles.cache.get(originalId) : null)
    || guild.roles.cache.get(mappedId)
    || guild.roles.cache.find(role => !role.managed && role.name === name)
    || null;
}

async function removeUnusedCreatedRoles(created, reason, warnings) {
  let remaining = 0;
  for (const item of created) {
    try {
      await item.role.delete(reason);
    } catch (error) {
      remaining += 1;
      warnings.push(`Không dọn được role mới ${item.role.name}: ${error.message}`);
    }
  }
  return remaining;
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
    } else if (guild.id === snapshot.server.id && guild.members.cache.has(item.id)) {
      targetId = item.id;
    }
    if (!targetId) continue;
    result.push({ id: targetId, allow: permissionBits(item.allow), deny: permissionBits(item.deny) });
  }
  return result;
}

async function ensureRole(guild, spec, storedId, sync, preserveExisting, warnings, preferStoredId = false) {
  let role = (preferStoredId ? guild.roles.cache.get(storedId) : null)
    || (guild.id === snapshot.server.id ? guild.roles.cache.get(spec.id) : null)
    || guild.roles.cache.get(storedId)
    || guild.roles.cache.find(item => !item.managed && (item.name === spec.name || item.name === spec.originalName));
  const visualOptions = {
    name: spec.name,
    colors: { primaryColor: primaryColor(spec.color) },
    hoist: Boolean(spec.hoist),
    mentionable: Boolean(spec.mentionable),
    reason: 'Dragon Galaxy snapshot synchronization'
  };
  const fullOptions = {
    ...visualOptions,
    permissions: new PermissionsBitField(permissionBits(spec.permissions))
  };
  if (!role) {
    role = await guild.roles.create(fullOptions);
  } else if (sync && role.editable) {
    // Sửa chính role cũ theo ID nên mọi thành viên vẫn giữ nguyên role.
    // Chế độ an toàn không ghi đè permission đang vận hành trên server.
    await role.edit(preserveExisting ? visualOptions : fullOptions);
  } else if (sync && !role.editable) {
    warnings.push(`Không thể cập nhật role ${role.name}: role cao hơn bot hoặc do Discord quản lý.`);
  }
  return role;
}

async function recreateTemplateRoles(guild, roleMap, members, warnings, progress, preferStoredId) {
  const mapped = roleSpecs.map(spec => ({
    spec,
    role: preferStoredId && guild.roles.cache.has(roleMap[spec.id])
      ? guild.roles.cache.get(roleMap[spec.id])
      : findRole(guild, spec.name, spec.id, roleMap)
  }));
  const previousRoles = mapped.filter(item => item.role && !item.role.managed && item.role.id !== guild.roles.everyone.id);
  const uniqueRoleIds = new Set(previousRoles.map(item => item.role.id));
  if (uniqueRoleIds.size !== previousRoles.length) {
    throw new Error('Có nhiều role template đang trỏ cùng một role hiện tại. Chưa tạo hoặc xóa role nào; hãy chạy /scan_server và đồng bộ ID role trước.');
  }
  const locked = previousRoles.filter(item => !item.role.editable);
  if (locked.length) {
    throw new Error(`Chưa tạo lại role nào. Kéo role bot lên cao hơn các role template này rồi chạy lại: ${locked.slice(0, 8).map(item => item.role.name).join(', ')}${locked.length > 8 ? ', ...' : ''}.`);
  }
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Bot cần quyền Manage Roles để tạo lại role.');
  }

  const created = [];
  try {
    await progress(`Đang tạo ${roleSpecs.length} role mới...`);
    for (const spec of roleSpecs) {
      const role = await guild.roles.create({
        name: spec.name,
        colors: { primaryColor: primaryColor(spec.color) },
        hoist: Boolean(spec.hoist),
        mentionable: Boolean(spec.mentionable),
        permissions: new PermissionsBitField(permissionBits(spec.permissions)),
        reason: 'Tái tạo role theo yêu cầu chủ server'
      });
      created.push({ spec, role });
    }
  } catch (error) {
    await removeUnusedCreatedRoles(created, 'Dọn role mới chưa sử dụng do bước tạo role thất bại', warnings);
    throw new Error(`Không tạo đủ role mới; role cũ vẫn được giữ. Lỗi: ${error.message}`);
  }

  const permissionOrder = roleSpecsByPermission();
  const createdBySpec = new Map(created.map(item => [item.spec.id, item.role]));
  await progress('Đang chuyển role mới cho thành viên...');
  const oldToNew = new Map();
  for (const { spec, role: oldRole } of previousRoles) {
    const newRole = createdBySpec.get(spec.id);
    if (newRole) oldToNew.set(oldRole.id, newRole);
  }
  const memberships = [];
  for (const member of members.values()) {
    const replacementIds = [...oldToNew]
      .filter(([oldRoleId]) => member.roles.cache.has(oldRoleId))
      .map(([, newRole]) => newRole.id);
    if (!replacementIds.length) continue;
    try {
      await member.roles.add(replacementIds, 'Tái tạo role; giữ các role thành viên hiện có');
      memberships.push(replacementIds.length);
    } catch (error) {
      warnings.push(`Dừng trước khi xóa role cũ: không chuyển role cho ${member.user.tag} (${error.message}).`);
      const remainingCreated = await removeUnusedCreatedRoles(created, 'Hoàn tác role mới do chuyển thành viên thất bại', warnings);
      return { completed: false, createdCount: remainingCreated, membersUpdated: memberships.length, assignmentsMoved: memberships.reduce((sum, count) => sum + count, 0), overwritesMoved: 0, deletedCount: 0, orderedRoleCount: 0, roleOrderMatched: false, lockedRoleCount: locked.length };
    }
  }

  await progress('Đang chuyển quyền role trong các kênh...');
  let overwritesMoved = 0;
  try {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.permissionOverwrites) continue;
      for (const [oldRoleId, newRole] of oldToNew) {
        const overwrite = channel.permissionOverwrites.cache.get(oldRoleId);
        if (!overwrite) continue;
        await channel.permissionOverwrites.edit(newRole.id, {
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield
        }, 'Tái tạo role; sao chép quyền kênh sang role mới');
        overwritesMoved += 1;
      }
    }
  } catch (error) {
    warnings.push(`Dừng trước khi xóa role cũ: có quyền kênh chưa sao chép hết (${error.message}). Role cũ vẫn còn.`);
    const remainingCreated = await removeUnusedCreatedRoles(created, 'Hoàn tác role mới do sao chép quyền kênh thất bại', warnings);
    return { completed: false, createdCount: remainingCreated, membersUpdated: memberships.length, assignmentsMoved: memberships.reduce((sum, count) => sum + count, 0), overwritesMoved, deletedCount: 0, orderedRoleCount: 0, roleOrderMatched: false, lockedRoleCount: locked.length };
  }

  const nextRoleMap = { ...roleMap };
  for (const { spec, role } of created) nextRoleMap[spec.id] = role.id;
  const oldRoleIds = previousRoles.map(item => item.role.id);
  await updateGuildData(guild.id, current => ({ ...current, roles: nextRoleMap, pendingRoleRebuild: true, pendingOldRoleIds: oldRoleIds }));
  Object.assign(roleMap, nextRoleMap);

  await progress('Đang xóa role cũ đã được thay thế...');
  let deleted = 0;
  for (const { role } of previousRoles) {
    try {
      await role.delete('Role đã được thay thế; thành viên và quyền kênh đã chuyển sang role mới');
      deleted += 1;
    } catch (error) {
      warnings.push(`Không xóa được role cũ ${role.name}; thành viên đã có role mới (${error.message}).`);
    }
  }
  await guild.roles.fetch();
  const remainingOldRoleIds = previousRoles
    .map(item => item.role.id)
    .filter(id => guild.roles.cache.has(id));
  await updateGuildData(guild.id, current => ({
    ...current,
    roles: nextRoleMap,
    pendingRoleRebuild: remainingOldRoleIds.length > 0,
    pendingOldRoleIds: remainingOldRoleIds
  }));
  return {
    completed: remainingOldRoleIds.length === 0,
    createdCount: created.length,
    membersUpdated: memberships.length,
    assignmentsMoved: memberships.reduce((sum, count) => sum + count, 0),
    overwritesMoved,
    deletedCount: deleted,
    orderedRoleCount: created.length,
    roleOrderMatched: true,
    lockedRoleCount: 0,
    roleOrder: permissionOrder.map(spec => spec.name)
  };
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

async function ensureChannel(guild, spec, storedId, parentId, overwrites, sync, preserveExisting, warnings) {
  const expectedType = supportedChannelType(spec.typeCode);
  let channel = (guild.id === snapshot.server.id ? guild.channels.cache.get(spec.id) : null)
    || guild.channels.cache.get(storedId)
    || guild.channels.cache.find(item => (item.name === spec.name || item.name === spec.originalName) && item.type === expectedType && (spec.type === 'Category' || item.parentId === parentId));

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
    // Đổi tên/di chuyển chính kênh cũ theo ID; không clone hoặc xóa nên lịch sử chat còn nguyên.
    if (channel.manageable) await channel.edit(channelEditOptions(spec, parentId));
    if (!preserveExisting) {
      await channel.permissionOverwrites.set(overwrites, 'Dragon Galaxy snapshot synchronization').catch(error => warnings.push(`${spec.name}: không cập nhật được permission (${error.message}).`));
    }
  }
  return channel;
}

async function orderStructure(guild, roleMap, channelMap, warnings, roleOrder = roleSpecs, byPermission = false, orderChannels = true) {
  const orderedRoles = roleOrder
    .map(spec => ({ spec, role: guild.roles.cache.get(roleMap[spec.id]) }))
    .filter(item => item.role);
  const editableRoles = orderedRoles.filter(item => item.role.editable);
  const lockedRoles = orderedRoles.filter(item => !item.role.editable);
  if (lockedRoles.length) {
    const names = lockedRoles.slice(-8).reverse().map(item => item.role.name).join(', ');
    warnings.push(`${lockedRoles.length} role không thể sắp xếp vì đang cao hơn role bot: ${names}${lockedRoles.length > 8 ? ', ...' : ''}.`);
  }
  let roleOrderMatched = false;
  try {
    if (editableRoles.length) {
      const firstPosition = Math.max(1, guild.members.me.roles.highest.position - editableRoles.length);
      await guild.roles.setPositions(editableRoles.map(({ role, spec }, index) => ({
        role,
        position: byPermission ? firstPosition + index : spec.position
      })));
      await guild.roles.fetch();

      const expectedLowToHigh = orderedRoles.map(item => item.role.id);
      const actualLowToHigh = orderedRoles
        .map(item => guild.roles.cache.get(item.role.id))
        .filter(Boolean)
        .sort((a, b) => a.position - b.position)
        .map(role => role.id);
      roleOrderMatched = expectedLowToHigh.every((id, index) => actualLowToHigh[index] === id);
      if (!roleOrderMatched) {
        warnings.push(`Discord chưa áp dụng đúng toàn bộ thứ tự role${byPermission ? ' theo quyền' : ' từ file scan'}. Hãy bảo đảm role bot nằm trên tất cả role cộng đồng rồi chạy lại /setup.`);
      }
    }
  } catch (error) {
    warnings.push(`Không xếp được role: ${error.message}. Hãy kéo role bot lên cao nhất rồi chạy lại /setup.`);
  }

  if (orderChannels) try {
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

  return {
    roleOrderMatched,
    orderedRoleCount: editableRoles.length,
    lockedRoleCount: lockedRoles.length
  };
}

async function removeDeprecatedGeneratedChannels(guild, channelMap, warnings) {
  let removed = 0;
  for (const key of communityTheme.deprecatedGeneratedChannelKeys || []) {
    const channelId = channelMap[key];
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      try {
        await channel.delete('Gỡ khu SẢNH CHÍNH dư thừa theo yêu cầu chủ server');
        removed += 1;
        delete channelMap[key];
      } catch (error) {
        warnings.push(`Không xóa được kênh dư thừa ${channel.name}: ${error.message}`);
      }
    } else {
      delete channelMap[key];
    }
  }
  return removed;
}

export async function setupFromSnapshot(guild, { sync = false, preserveExisting = true, rebuildRoles = false, progress = async () => {} } = {}) {
  const [, , fetchedMembers] = await Promise.all([
    guild.roles.fetch(),
    guild.channels.fetch(),
    guild.members.fetch().catch(error => {
      if (rebuildRoles) throw new Error(`Không tải được danh sách thành viên nên chưa thay đổi role: ${error.message}`);
      return null;
    })
  ]);
  const stored = await getGuildData(guild.id);
  const roleMap = { ...(stored.roles || {}) };
  const channelMap = { ...(stored.channels || {}) };
  const rolesByName = new Map();
  const warnings = [];
  let removedDeprecatedChannels = 0;
  let ordering = { roleOrderMatched: false, orderedRoleCount: 0, lockedRoleCount: 0 };
  let roleRebuild = null;

  if (rebuildRoles) {
    let resumedPendingRebuild = false;
    await progress(`Chuẩn bị tạo lại ${roleSpecs.length} role...`);
    for (const spec of roleSpecs) {
      const mappedRole = stored.rolesRebuilt || stored.pendingRoleRebuild
        ? guild.roles.cache.get(roleMap[spec.id])
        : null;
      const currentRole = mappedRole || findRole(guild, spec.name, spec.id, roleMap);
      if (currentRole) roleMap[spec.id] = currentRole.id;
    }
    if (!fetchedMembers) throw new Error('Không tải đủ danh sách thành viên; chưa thay đổi role.');
    if (stored.pendingRoleRebuild) {
      resumedPendingRebuild = true;
      await progress('Đang hoàn tất xóa các role cũ còn lại...');
      let deletedCount = 0;
      const remainingOldRoleIds = [];
      for (const roleId of stored.pendingOldRoleIds || []) {
        const oldRole = guild.roles.cache.get(roleId);
        if (!oldRole) continue;
        if (!oldRole.editable) {
          remainingOldRoleIds.push(roleId);
          warnings.push(`Role cũ ${oldRole.name} vẫn cao hơn role bot nên chưa xóa được.`);
          continue;
        }
        try {
          await oldRole.delete('Hoàn tất thay thế role; thành viên đã chuyển sang role mới');
          deletedCount += 1;
        } catch (error) {
          remainingOldRoleIds.push(roleId);
          warnings.push(`Chưa xóa được role cũ ${oldRole.name}: ${error.message}`);
        }
      }
      await guild.roles.fetch();
      roleRebuild = {
        completed: remainingOldRoleIds.length === 0,
        createdCount: 0,
        membersUpdated: 0,
        assignmentsMoved: 0,
        overwritesMoved: 0,
        deletedCount,
        orderedRoleCount: roleSpecs.length,
        roleOrderMatched: false,
        lockedRoleCount: remainingOldRoleIds.length
      };
      await updateGuildData(guild.id, current => ({
        ...current,
        pendingRoleRebuild: remainingOldRoleIds.length > 0,
        pendingOldRoleIds: remainingOldRoleIds
      }));
    } else {
      roleRebuild = await recreateTemplateRoles(guild, roleMap, fetchedMembers, warnings, progress, Boolean(stored.rolesRebuilt));
    }
    if (!roleRebuild.completed) {
      return {
        state: await getGuildData(guild.id),
        roles: Object.keys(roleMap).length,
        channels: Object.keys(channelMap).length,
        preservedHistory: true,
        preservedRoleMemberships: true,
        removedDeprecatedChannels: 0,
        ordering: roleRebuild,
        roleRebuild,
        warnings
      };
    }

    ordering = await orderStructure(guild, roleMap, channelMap, warnings, roleSpecsByPermission(), true, false);
    roleRebuild.roleOrderMatched = ordering.roleOrderMatched;
    roleRebuild.orderedRoleCount = ordering.orderedRoleCount;
    if (resumedPendingRebuild && roleRebuild.createdCount === 0) roleRebuild.roleOrderMatched = ordering.roleOrderMatched;
    const state = await updateGuildData(guild.id, current => ({
      ...current,
      setupComplete: true,
      roles: roleMap,
      lastSetupAt: new Date().toISOString(),
      sourceSnapshot: snapshot.generatedAt,
      pendingRoleRebuild: false,
      pendingOldRoleIds: [],
      rolesRebuilt: true
    }));
    return {
      state,
      roles: Object.keys(roleMap).length,
      channels: Object.keys(channelMap).length,
      preservedHistory: true,
      preservedRoleMemberships: true,
      removedDeprecatedChannels: 0,
      ordering,
      roleRebuild,
      warnings
    };
  }

  if (sync) {
    await progress('Đang gỡ khu SẢNH CHÍNH dư thừa...');
    removedDeprecatedChannels = await removeDeprecatedGeneratedChannels(guild, channelMap, warnings);
  }

  if (sync && guild.name !== communityTheme.serverName) {
    await guild.setName(communityTheme.serverName, 'Đồng bộ thương hiệu Động Rồng Galaxy / Aikon')
      .catch(error => warnings.push(`Không đổi được tên server: ${error.message}`));
  }

  await progress(`Đang đồng bộ ${roleSpecs.length} role...`);
  for (const spec of roleSpecs) {
    try {
      const role = await ensureRole(guild, spec, roleMap[spec.id], sync, preserveExisting, warnings, Boolean(stored.rolesRebuilt || stored.pendingRoleRebuild));
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
      const category = await ensureChannel(guild, spec, channelMap[spec.id], null, overwrites, sync, preserveExisting, warnings);
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
      const channel = await ensureChannel(guild, spec, channelMap[spec.id], parentId, overwrites, sync, preserveExisting, warnings);
      channelMap[spec.id] = channel.id;
    } catch (error) {
      warnings.push(`Kênh ${spec.name}: ${error.message}`);
    }
  }

  if (sync) {
    await progress('Đang sắp xếp role và kênh...');
    const orderByPermission = Boolean(stored.rolesRebuilt);
    ordering = await orderStructure(
      guild,
      roleMap,
      channelMap,
      warnings,
      orderByPermission ? roleSpecsByPermission() : roleSpecs,
      orderByPermission
    );
  }

  const state = await updateGuildData(guild.id, current => ({
    ...current,
    setupComplete: true,
    roles: roleMap,
    channels: channelMap,
    lastSetupAt: new Date().toISOString(),
    sourceSnapshot: snapshot.generatedAt,
    preserveExisting,
    pendingRoleRebuild: false,
    rolesRebuilt: Boolean(stored.rolesRebuilt)
  }));

  return {
    state,
    roles: Object.keys(roleMap).length,
    channels: Object.keys(channelMap).length,
    preservedHistory: true,
    preservedRoleMemberships: true,
    removedDeprecatedChannels,
    ordering,
    roleRebuild,
    warnings
  };
}
