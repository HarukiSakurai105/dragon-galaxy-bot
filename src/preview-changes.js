import { writeFileSync } from 'node:fs';
import { categorySpecs, channelSpecs, roleSpecs, snapshot } from './template.js';
import { communityTheme } from './theme.js';

const changedRoles = roleSpecs.filter(role => role.originalName !== role.name);
const unchangedRoles = roleSpecs.filter(role => role.originalName === role.name);
const allChannels = [...categorySpecs, ...channelSpecs];

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
  '- Không xóa bất kỳ kênh nào.',
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
  `## Category được đổi tên (${categorySpecs.length})`,
  '',
  ...categorySpecs.map(mappingLine),
  '',
  `## Phòng chat/voice/forum được đổi tên (${channelSpecs.length})`,
  '',
  ...channelSpecs.map(mappingLine),
  '',
  '## Tổng kết',
  '',
  `- ${changedRoles.length} role đổi tên; ${unchangedRoles.length} role giữ nguyên tên.`,
  `- ${snapshot.roles.filter(role => role.managed).length} role managed của bot/integration do Discord quản lý được giữ nguyên.`,
  `- ${categorySpecs.length} category đổi tên.`,
  `- ${channelSpecs.length} phòng chat/voice/forum đổi tên.`,
  `- Tổng cộng ${allChannels.length} category/phòng được nhận diện bằng ID cũ.`,
  '- 0 kênh bị xóa; 0 role bị xóa; 0 thành viên bị gỡ role.'
];

const outputUrl = new URL('../CHANGE-PREVIEW.md', import.meta.url);
writeFileSync(outputUrl, `${lines.join('\n')}\n`, 'utf8');
console.log(`✅ Đã xuất ${outputUrl.pathname}`);

