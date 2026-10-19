import { writeFileSync } from 'node:fs';
import { categorySpecs, channelSpecs, roleSpecs, snapshot } from './template.js';
import { communityTheme } from './theme.js';

const changedRoles = roleSpecs.filter(role => role.originalName !== role.name);
const unchangedRoles = roleSpecs.filter(role => role.originalName === role.name);
const allChannels = [...categorySpecs, ...channelSpecs];
const scannedCategories = categorySpecs.filter(channel => !channel.isAdditional);
const scannedChannels = channelSpecs.filter(channel => !channel.isAdditional);
const additionalCategories = categorySpecs.filter(channel => channel.isAdditional);
const additionalChannels = channelSpecs.filter(channel => channel.isAdditional);

function mappingLine(item) {
  return `- \`${item.id}\` — **${item.originalName}** → **${item.name}**`;
}

const lines = [
  '# Xem trước thay đổi — Động Rồng Galaxy / Aikon',
  '',
  `Tạo từ snapshot: ${snapshot.generatedAt || 'không rõ thời gian'}`,
  '',
  '## Cam kết của chế độ “Tái cấu trúc an toàn”',
  '',
  '- Không xóa các kênh cũ thuộc snapshot.',
  '- Riêng khu SẢNH CHÍNH dư thừa từng do bot tạo sẽ được gỡ theo yêu cầu mới nhất.',
  '- Kênh được đổi tên/di chuyển trên đúng ID cũ nên lịch sử chat và file đính kèm vẫn còn.',
  '- Không xóa hoặc tạo lại role cũ; thành viên vẫn giữ nguyên role đang có.',
  '- Không ghi đè permission hiện tại của role và kênh.',
  '- Role managed của bot/integration khác được bỏ qua.',
  '- Role/kênh ngoài snapshot được giữ nguyên.',
  '',
  '## Tên server',
  '',
  `- **${snapshot.server.name}** → **${communityTheme.serverName}**`,
  '',
  `## Role được đổi tên (${changedRoles.length})`,
  '',
  ...changedRoles.map(mappingLine),
  '',
  `## Role giữ nguyên tên (${unchangedRoles.length})`,
  '',
  ...unchangedRoles.map(role => `- \`${role.id}\` — **${role.name}**${role.name === communityTheme.fandomRoleName ? ' ← role fandom mặc định' : ''}`),
  '',
  '## Thứ tự role sau setup (cao xuống thấp)',
  '',
  ...[...roleSpecs].reverse().map((role, index) => `${index + 1}. **${role.name}**`),
  '',
  '## Permission quản trị được chuẩn hóa',
  '',
  ...roleSpecs
    .filter(role => Object.prototype.hasOwnProperty.call(communityTheme.rolePermissions, role.id))
    .reverse()
    .map(role => `- **${role.name}**: ${role.permissions.length ? role.permissions.map(permission => `\`${permission}\``).join(', ') : 'không có quyền quản trị đặc biệt'}`),
  '',
  `## Category được đổi tên (${scannedCategories.length})`,
  '',
  ...scannedCategories.map(mappingLine),
  '',
  `## Phòng chat/voice/forum được đổi tên (${scannedChannels.length})`,
  '',
  ...scannedChannels.map(mappingLine),
  '',
  ...(additionalCategories.length + additionalChannels.length ? [
    `## Khu vực trang trí được bổ sung (${additionalCategories.length + additionalChannels.length})`,
    '',
    ...additionalCategories.map(category => `- Category mới: **${category.name}**`),
    ...additionalChannels.map(channel => `- Phòng mới: **${channel.name}**`),
    ''
  ] : []),
  '## Tổng kết',
  '',
  `- ${changedRoles.length} role đổi tên; ${unchangedRoles.length} role giữ nguyên tên.`,
  `- ${snapshot.roles.filter(role => role.managed).length} role managed của bot/integration do Discord quản lý được giữ nguyên.`,
  `- ${scannedCategories.length} category đổi tên.`,
  `- ${scannedChannels.length} phòng chat/voice/forum đổi tên.`,
  ...(additionalCategories.length + additionalChannels.length
    ? [`- ${additionalCategories.length} category và ${additionalChannels.length} phòng trang trí được tạo thêm.`]
    : ['- Khu SẢNH CHÍNH bổ sung đã được loại khỏi template.']),
  `- ${scannedCategories.length + scannedChannels.length} category/phòng cũ được nhận diện bằng ID cũ; tổng cấu trúc sau setup là ${allChannels.length} category/phòng.`,
  '- 0 kênh bị xóa; 0 role bị xóa; 0 thành viên bị gỡ role.'
];

const outputUrl = new URL('../CHANGE-PREVIEW.md', import.meta.url);
writeFileSync(outputUrl, `${lines.join('\n')}\n`, 'utf8');
console.log(`✅ Đã xuất ${outputUrl.pathname}`);

