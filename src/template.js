import { readFileSync } from 'node:fs';
import { communityTheme } from './theme.js';

const templateUrl = new URL('../template/server-structure.json', import.meta.url);
export const snapshot = JSON.parse(readFileSync(templateUrl, 'utf8').replace(/^\uFEFF/, ''));

const themedRoleNameById = new Map(snapshot.roles.map(role => [role.id, communityTheme.roleNames[role.id] || role.name]));

function themedRolePermissions(role) {
  return Object.prototype.hasOwnProperty.call(communityTheme.rolePermissions || {}, role.id)
    ? communityTheme.rolePermissions[role.id]
    : role.permissions;
}

function themedOverwrites(overwrites = []) {
  return overwrites.map(overwrite => ({
    ...overwrite,
    targetName: overwrite.targetType === 'role'
      ? themedRoleNameById.get(overwrite.id) || overwrite.targetName
      : overwrite.targetName
  }));
}

function stripTreeDecoration(name) {
  return String(name)
    .replace(/^╔★・/, '')
    .replace(/・★╗$/, '')
    .replace(/^[╭├╰]・/, '')
    .trim();
}

function decorateCategoryName(name) {
  return `╔★・${stripTreeDecoration(name)}・★╗`;
}

function decorateChannelTree(channels) {
  const siblingsByParent = new Map();
  for (const channel of channels) {
    const key = channel.parentId || '__root__';
    const siblings = siblingsByParent.get(key) || [];
    siblings.push(channel);
    siblingsByParent.set(key, siblings);
  }

  return channels.map(channel => {
    const siblings = siblingsByParent.get(channel.parentId || '__root__');
    const index = siblings.indexOf(channel);
    const branch = siblings.length === 1 || index === siblings.length - 1 ? '╰' : index === 0 ? '╭' : '├';
    return { ...channel, name: `${branch}・${stripTreeDecoration(channel.name)}` };
  });
}

export const roleSpecs = snapshot.roles
  .filter(role => !role.managed && role.name !== '@everyone')
  .map(role => ({
    ...role,
    originalName: role.name,
    name: communityTheme.roleNames[role.id] || role.name,
    permissions: themedRolePermissions(role)
  }))
  // Giữ đúng thứ tự position thấp → cao trong file scan JSON/Markdown.
  .sort((a, b) => a.position - b.position);

const scannedCategorySpecs = snapshot.channels
  .filter(channel => channel.type === 'Category')
  .map(channel => ({
    ...channel,
    originalName: channel.name,
    name: communityTheme.channelNames[channel.id] || channel.name,
    permissionOverwrites: themedOverwrites(channel.permissionOverwrites)
  }))
  .sort((a, b) => a.position - b.position);

const scannedChannelSpecs = snapshot.channels
  .filter(channel => channel.type !== 'Category' && !channel.type.includes('Thread'))
  .map(channel => ({
    ...channel,
    originalName: channel.name,
    name: communityTheme.channelNames[channel.id] || channel.name,
    permissionOverwrites: themedOverwrites(channel.permissionOverwrites)
  }))
  .sort((a, b) => a.position - b.position);

const additionalCategorySpecs = (communityTheme.additionalCategories || []).map(category => ({
  ...category,
  originalName: null,
  type: 'Category',
  typeCode: 4,
  parentId: null,
  permissionOverwrites: [],
  isAdditional: true
}));

const additionalChannelSpecs = (communityTheme.additionalChannels || []).map(channel => ({
  ...channel,
  originalName: null,
  type: 'Text',
  typeCode: 0,
  permissionOverwrites: [],
  nsfw: false,
  slowmodeSeconds: 0,
  isAdditional: true
}));

export const categorySpecs = [...scannedCategorySpecs, ...additionalCategorySpecs]
  .sort((a, b) => a.position - b.position)
  .map(category => ({ ...category, name: decorateCategoryName(category.name) }));

export const channelSpecs = decorateChannelTree(
  [...scannedChannelSpecs, ...additionalChannelSpecs].sort((a, b) => a.position - b.position)
);

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
  const unexpectedAdmins = roleSpecs.filter(role => role.permissions.includes('Administrator') && !['1555520791137751100', '1117739533543415890'].includes(role.id));
  if (unexpectedAdmins.length) throw new Error(`Role cấp Administrator ngoài dự kiến: ${unexpectedAdmins.map(role => role.name).join(', ')}`);
  const themedChannels = [...categorySpecs, ...channelSpecs];
  const missingTheme = themedChannels.filter(channel => !channel.isAdditional && !communityTheme.channelNames[channel.id]);
  if (missingTheme.length) throw new Error(`Theme Aikon thiếu ${missingTheme.length} kênh.`);
  const invalidChannelNames = themedChannels.filter(channel => styledFont.test(channel.name));
  if (invalidChannelNames.length) throw new Error(`Kênh vẫn còn font kiểu: ${invalidChannelNames.map(channel => channel.name).join(', ')}`);
  const invalidCategories = categorySpecs.filter(category => !category.name.startsWith('╔★・') || !category.name.endsWith('・★╗'));
  if (invalidCategories.length) throw new Error(`Category chưa đồng bộ trang trí: ${invalidCategories.map(category => category.name).join(', ')}`);
  const invalidTreeChannels = channelSpecs.filter(channel => !/^[╭├╰]・/.test(channel.name));
  if (invalidTreeChannels.length) throw new Error(`Phòng chưa đồng bộ nhánh trang trí: ${invalidTreeChannels.map(channel => channel.name).join(', ')}`);
  if (!roleSpecs.some(role => role.name === communityTheme.fandomRoleName)) throw new Error(`Không tìm thấy role fandom ${communityTheme.fandomRoleName}.`);
  return {
    server: communityTheme.serverName,
    fandom: communityTheme.fandomRoleName,
    roles: roleSpecs.length,
    themedRoles: roleSpecs.length,
    categories: categorySpecs.length,
    channels: channelSpecs.length,
    themedChannels: themedChannels.length,
    additionalChannels: additionalCategorySpecs.length + additionalChannelSpecs.length,
    managedRolesSkipped: snapshot.roles.filter(role => role.managed).length
  };
}

