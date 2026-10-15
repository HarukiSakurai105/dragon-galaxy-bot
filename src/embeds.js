import { EmbedBuilder } from 'discord.js';
import { config } from './config.js';

export function baseEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${config.brandName} • Community Bot` })
    .setTimestamp();
}

export const successEmbed = description => baseEmbed('✅ Thành công', description).setColor(0x57f287);
export const errorEmbed = description => baseEmbed('❌ Không thể thực hiện', description).setColor(0xed4245);

