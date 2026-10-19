import { readFileSync } from 'node:fs';
import { communityTheme } from './theme.js';

const templateUrl = new URL('../template/server-structure.json', import.meta.url);
export const snapshot = JSON.parse(readFileSync(templateUrl, 'utf8').replace(/^\uFEFF/, ''));

const themedRoleNameById = new Map(snapshot.roles.map(role => [role.id, communityTheme.roleNames[role.id] || role.name]));

function themedOverwrites(overwrites = []) {
  return overwrites.map(overwrite => ({
    ...overwrite,
    targetName: overwrite.targetType === 'role'
      ? themedRoleNameById.get(overwrite.id) || overwrite.targetName
      : overwrite.targetName
  }));
}

export const roleSpecs = snapshot.roles
  .filter(role => !role.managed && role.name !== '@everyone')
  .map(role => ({ ...role, originalName: role.name, name: communityTheme.roleNames[role.id] || role.name }))
  .sort((a, b) => a.position - b.position);

export const categorySpecs = snapshot.channels
  .filter(channel => channel.type === 'Category')
  .map(channel => ({
    ...channel,
    originalName: channel.name,
    name: communityTheme.channelNames[channel.id] || channel.name,
    permissionOverwrites: themedOverwrites(channel.permissionOverwrites)
  }))
  .sort((a, b) => a.position - b.position);

export const channelSpecs = snapshot.channels
  .filter(channel => channel.type !== 'Category' && !channel.type.includes('Thread'))
  .map(channel => ({
    ...channel,
    originalName: channel.name,
    name: communityTheme.channelNames[channel.id] || channel.name,
    permissionOverwrites: themedOverwrites(channel.permissionOverwrites)
  }))
  .sort((a, b) => a.position - b.position);

export function validateSnapshot() {
  if (!snapshot.server?.id || !snapshot.server?.name) throw new Error('Template thiếu thông tin server.');
  if (!roleSpecs.length || !categorySpecs.length || !channelSpecs.length) throw new Error('Template không có đủ role/category/kênh.');
  const duplicateRoles = roleSpecs.filter((role, index) => roleSpecs.findIndex(item => item.name === role.name) !== index);
  if (duplicateRoles.length) throw new Error(`Template có role trùng tên: ${duplicateRoles.map(role => role.name).join(', ')}`);
  const missingRoleTheme = roleSpecs.filter(role => !communityTheme.roleNames[role.id]);
  if (missingRoleTheme.length) throw new Error(`Theme thiếu icon/tên thường cho ${missingRoleTheme.length} role.`);
  const styledFont = /[\u{1D400}-\u{1D7FF}]/u;
  const invalidRoleNames = roleSpecs.filter(role => !role.name.includes('・') || styledFont.test(role.name));
  if (invalidRoleNames.length) throw new Error(`Role chưa dùng font thường hoặc thiếu icon: ${invalidRoleNames.map(role => role.name).join(', ')}`);
  const themedChannels = [...categorySpecs, ...channelSpecs];
  const missingTheme = themedChannels.filter(channel => !communityTheme.channelNames[channel.id]);
  if (missingTheme.length) throw new Error(`Theme Aikon thiếu ${missingTheme.length} kênh.`);
  const invalidChannelNames = themedChannels.filter(channel => styledFont.test(channel.name));
  if (invalidChannelNames.length) throw new Error(`Kênh vẫn còn font kiểu: ${invalidChannelNames.map(channel => channel.name).join(', ')}`);
  if (!roleSpecs.some(role => role.name === communityTheme.fandomRoleName)) throw new Error(`Không tìm thấy role fandom ${communityTheme.fandomRoleName}.`);
  return {
    server: communityTheme.serverName,
    fandom: communityTheme.fandomRoleName,
    roles: roleSpecs.length,
    themedRoles: roleSpecs.length,
    categories: categorySpecs.length,
    channels: channelSpecs.length,
    themedChannels: themedChannels.length,
    managedRolesSkipped: snapshot.roles.filter(role => role.managed).length
  };
}

