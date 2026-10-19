import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  brandName: process.env.BRAND_NAME || 'Động Rồng Galaxy',
  color: Number.parseInt(process.env.BRAND_COLOR || 'FF8FDB', 16),
  memberRoleName: process.env.MEMBER_ROLE_NAME || '🌌・Aikon',
  staffRoleNames: (process.env.STAFF_ROLE_NAMES || '🌸・Galaxy Master|🔰・Moderator|🐉・Dragon Staff').split('|').map(value => value.trim()).filter(Boolean)
};

export function validateConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
}

