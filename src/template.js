import { readFileSync } from 'node:fs';

const templateUrl = new URL('../template/server-structure.json', import.meta.url);
export const snapshot = JSON.parse(readFileSync(templateUrl, 'utf8').replace(/^\uFEFF/, ''));

export const roleSpecs = snapshot.roles
  .filter(role => !role.managed && role.name !== '@everyone')
  .sort((a, b) => a.position - b.position);

export const categorySpecs = snapshot.channels
  .filter(channel => channel.type === 'Category')
  .sort((a, b) => a.position - b.position);

export const channelSpecs = snapshot.channels
  .filter(channel => channel.type !== 'Category' && !channel.type.includes('Thread'))
  .sort((a, b) => a.position - b.position);

export function validateSnapshot() {
  if (!snapshot.server?.id || !snapshot.server?.name) throw new Error('Template thiếu thông tin server.');
  if (!roleSpecs.length || !categorySpecs.length || !channelSpecs.length) throw new Error('Template không có đủ role/category/kênh.');
  const duplicateRoles = roleSpecs.filter((role, index) => roleSpecs.findIndex(item => item.name === role.name) !== index);
  if (duplicateRoles.length) throw new Error(`Template có role trùng tên: ${duplicateRoles.map(role => role.name).join(', ')}`);
  return {
    server: snapshot.server.name,
    roles: roleSpecs.length,
    categories: categorySpecs.length,
    channels: channelSpecs.length,
    managedRolesSkipped: snapshot.roles.filter(role => role.managed).length
  };
}

