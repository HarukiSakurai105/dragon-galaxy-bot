import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits as P
} from 'discord.js';
import { config } from './config.js';
import { baseEmbed, errorEmbed, successEmbed } from './embeds.js';
import { createServerReport } from './report.js';
import { setupFromSnapshot } from './setup.js';
import { communityTheme } from './theme.js';

function value(interaction, name) {
  return interaction.options.get(name)?.value;
}

async function reply(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function canActOn(interaction, member) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (member.id === interaction.user.id || member.id === interaction.guild.ownerId) return false;
  return interaction.member.roles.highest.comparePositionTo(member.roles.highest) > 0;
}

function staffRoles(guild) {
  return config.staffRoleNames.map(name => guild.roles.cache.find(role => role.name === name)).filter(Boolean);
}

function isStaff(interaction) {
  return interaction.member.permissions.has(P.ManageChannels)
    || staffRoles(interaction.guild).some(role => interaction.member.roles.cache.has(role.id));
}

function safeName(valueToClean) {
  return valueToClean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'member';
}

async function logAction(guild, title, description, color = 0x5865f2) {
  const channel = guild.channels.cache.get('1151202729763553350')
    || guild.channels.cache.find(item => item.isTextBased() && (item.name.includes('bot-log') || item.name.includes('𝐛𝐨𝐭-𝐥𝐨𝐠')));
  await channel?.send({ embeds: [baseEmbed(title, description).setColor(color)] }).catch(() => null);
}

async function handleCommand(interaction) {
  const { commandName, guild } = interaction;

  if (commandName === 'setup') {
    if (!interaction.member.permissions.has(P.Administrator)) return reply(interaction, { embeds: [errorEmbed('Bạn cần quyền Administrator để đồng bộ cấu trúc server.')] });
    const mode = value(interaction, 'chế_độ');
    const fresh = mode === 'fresh';
    const rebuildRoles = mode === 'rebuild_roles';
    const sync = fresh || mode === 'safe' || mode === 'sync' || rebuildRoles;
    // Server mới cần áp dụng đầy đủ permission từ template.
    // Chỉ hai chế độ bảo toàn mới giữ nguyên permission hiện tại.
    const preserveExisting = mode === 'missing' || mode === 'safe';
    const result = await setupFromSnapshot(guild, {
      sync,
      preserveExisting: rebuildRoles ? true : preserveExisting,
      rebuildRoles,
      progress: message => interaction.editReply({ embeds: [baseEmbed('⚙️ ĐANG ĐỒNG BỘ', message)] })
    });
    if (rebuildRoles && result.roleRebuild && !result.roleRebuild.completed) {
      const rebuild = result.roleRebuild;
      return interaction.editReply({ embeds: [errorEmbed(`Chưa hoàn tất tái tạo role. Role cũ được giữ nếu chưa thể chuyển an toàn. Đã tạo ${rebuild.createdCount} role mới; chuyển ${rebuild.assignmentsMoved || 0} lượt role cho ${rebuild.membersUpdated || 0} thành viên; sao chép ${rebuild.overwritesMoved || 0} quyền kênh; xóa ${rebuild.deletedCount || 0} role cũ.${result.warnings.length ? `\n\n${result.warnings.slice(0, 6).map(item => `• ${item}`).join('\n')}` : ''}`)] });
    }
    const warningText = result.warnings.length
      ? `\n\n⚠️ **${result.warnings.length} lưu ý:**\n${result.warnings.slice(0, 10).map(item => `• ${item}`).join('\n')}${result.warnings.length > 10 ? `\n• Và ${result.warnings.length - 10} lưu ý khác.` : ''}`
      : '';
    const action = rebuildRoles ? 'tạo lại role' : fresh ? 'khởi tạo server mới với' : sync ? 'tái cấu trúc' : 'bổ sung';
    const permissionText = rebuildRoles
      ? '\n✅ Role mới nhận quyền theo template; permission hiện có trong kênh được chuyển qua.'
      : fresh || mode === 'sync'
      ? '\n✅ Đã áp dụng permission role và permission kênh từ template.'
      : '\n✅ Giữ nguyên permission hiện tại.';
    const cleanupText = result.removedDeprecatedChannels
      ? `\n🧹 Đã xóa **${result.removedDeprecatedChannels}** category/phòng thuộc khu SẢNH CHÍNH dư thừa.`
      : '\n✅ Không xóa các kênh cũ từ bản scan.';
    const orderText = sync
      ? result.ordering.roleOrderMatched
        ? `\n✅ Đã kiểm tra: **${result.ordering.orderedRoleCount} role** đúng thứ tự${rebuildRoles ? ' theo quyền từ cao xuống thấp' : ' trong file scan'}.`
        : `\n⚠️ Chưa thể xếp đủ role (${result.ordering.lockedRoleCount} role bị khóa/cao hơn bot).`
      : '';
    const rebuildText = result.roleRebuild
      ? `\n🔁 Đã tạo **${result.roleRebuild.createdCount} role mới**, chuyển **${result.roleRebuild.assignmentsMoved} lượt role** cho **${result.roleRebuild.membersUpdated} thành viên**, chuyển **${result.roleRebuild.overwritesMoved} quyền kênh** và xóa **${result.roleRebuild.deletedCount || 0} role cũ**.`
      : '';
    return interaction.editReply({ embeds: [successEmbed(`Đã ${action} **${result.roles} role** và **${result.channels} category/kênh** cho **${guild.name}**.${warningText}\n\n✅ Lịch sử của các kênh cũ từ bản scan được giữ nguyên.${rebuildRoles ? rebuildText : '\n✅ Không xóa/tạo lại role cũ nên thành viên vẫn giữ nguyên role.'}${permissionText}${cleanupText}${orderText}\n✅ Role fandom mặc định là **Aikon**.`)] });
  }

  if (commandName === 'scan_server') {
    const { files, summary } = await createServerReport(guild, interaction.user);
    const description = `Đã quét **${summary.roles} role**, **${summary.categories} category**, **${summary.textChannels} kênh chat** và **${summary.voiceChannels} kênh voice/stage**.`;
    const message = await interaction.editReply({ embeds: [successEmbed(description)], files });
    const links = [...message.attachments.values()].map(file => `[📥 Tải ${file.name}](${file.url})`).join('\n');
    if (links) await interaction.editReply({ embeds: [successEmbed(`${description}\n\n${links}`)] });
    return;
  }

  if (commandName === 'panel') {
    if (!interaction.channel?.isTextBased()) return reply(interaction, { embeds: [errorEmbed('Hãy dùng lệnh trong kênh chat.')] });
    const panelType = value(interaction, 'loại');
    if (panelType === 'verify') {
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_member').setLabel('Xác minh thành viên').setEmoji('🐉').setStyle(ButtonStyle.Success));
      await interaction.channel.send({ embeds: [baseEmbed('🐉 CHÀO MỪNG ĐẾN ĐỘNG RỒNG GALAXY', `Hãy đọc nội quy của cộng đồng, sau đó bấm nút bên dưới để gia nhập fandom **${config.memberRoleName}**.`)], components: [row] });
      return reply(interaction, { embeds: [successEmbed('Đã đăng bảng xác minh.')] });
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_open').setLabel('Mở ticket hỗ trợ').setEmoji('🎫').setStyle(ButtonStyle.Primary));
    await interaction.channel.send({ embeds: [baseEmbed('🎫 HỖ TRỢ CỘNG ĐỒNG', 'Bấm nút bên dưới để mở một phòng hỗ trợ riêng với đội ngũ quản trị.')], components: [row] });
    return reply(interaction, { embeds: [successEmbed('Đã đăng bảng ticket.')] });
  }

  if (commandName === 'announce') {
    const channel = interaction.options.getChannel('kênh') || interaction.channel;
    if (!channel?.isTextBased()) return reply(interaction, { embeds: [errorEmbed('Kênh được chọn không thể nhận tin nhắn.')] });
    await channel.send({ embeds: [baseEmbed('📢 THÔNG BÁO ĐỘNG RỒNG GALAXY', value(interaction, 'nội_dung')).setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })] });
    return reply(interaction, { embeds: [successEmbed(`Đã gửi thông báo tới ${channel}.`)] });
  }

  if (commandName === 'role') {
    const member = await guild.members.fetch(value(interaction, 'thành_viên'));
    const role = interaction.options.getRole('role');
    if (!canActOn(interaction, member)) return reply(interaction, { embeds: [errorEmbed('Bạn không thể quản lý thành viên ngang/cao hơn mình hoặc chính mình.')] });
    if (!role?.editable || role.id === guild.roles.everyone.id) return reply(interaction, { embeds: [errorEmbed('Bot không thể quản lý role này. Hãy kéo role bot lên cao hơn.')] });
    const adding = interaction.options.getSubcommand() === 'add';
    if (adding) await member.roles.add(role, `Cấp bởi ${interaction.user.tag}`);
    else await member.roles.remove(role, `Gỡ bởi ${interaction.user.tag}`);
    await logAction(guild, adding ? '➕ CẤP ROLE' : '➖ GỠ ROLE', `${member} ${adding ? 'nhận' : 'mất'} ${role}\n**Thực hiện:** ${interaction.user}`);
    return reply(interaction, { embeds: [successEmbed(`Đã ${adding ? 'cấp' : 'gỡ'} ${role} ${adding ? 'cho' : 'khỏi'} ${member}.`)] });
  }

  if (commandName === 'clear') {
    if (!interaction.channel?.isTextBased() || !interaction.channel.bulkDelete) return reply(interaction, { embeds: [errorEmbed('Không thể xóa tin trong kênh này.')] });
    const deleted = await interaction.channel.bulkDelete(value(interaction, 'số_lượng'), true);
    return reply(interaction, { embeds: [successEmbed(`Đã xóa **${deleted.size}** tin nhắn gần đây.`)] });
  }

  if (commandName === 'timeout' || commandName === 'untimeout') {
    const member = await guild.members.fetch(value(interaction, 'thành_viên'));
    if (!canActOn(interaction, member) || !member.moderatable) return reply(interaction, { embeds: [errorEmbed('Không thể cách ly thành viên này do thứ tự role.')] });
    const removing = commandName === 'untimeout';
    await member.timeout(removing ? null : value(interaction, 'phút') * 60_000, removing ? `Gỡ bởi ${interaction.user.tag}` : value(interaction, 'lý_do'));
    await logAction(guild, removing ? '✅ GỠ CÁCH LY' : '⏳ CÁCH LY', `${member} • thực hiện bởi ${interaction.user}`, removing ? 0x57f287 : 0xfee75c);
    return reply(interaction, { embeds: [successEmbed(removing ? `Đã gỡ cách ly ${member}.` : `Đã cách ly ${member} trong **${value(interaction, 'phút')} phút**.`)] });
  }

  if (commandName === 'kick' || commandName === 'ban') {
    const member = await guild.members.fetch(value(interaction, 'thành_viên'));
    if (!canActOn(interaction, member)) return reply(interaction, { embeds: [errorEmbed('Không thể xử lý thành viên này do thứ tự role.')] });
    const reason = value(interaction, 'lý_do');
    if (commandName === 'kick' && !member.kickable) return reply(interaction, { embeds: [errorEmbed('Bot không thể kick thành viên này.')] });
    if (commandName === 'ban' && !member.bannable) return reply(interaction, { embeds: [errorEmbed('Bot không thể ban thành viên này.')] });
    await logAction(guild, commandName === 'kick' ? '👢 KICK' : '🔨 BAN', `**${member.user.tag}**\n**Lý do:** ${reason}\n**Thực hiện:** ${interaction.user}`, 0xed4245);
    if (commandName === 'kick') await member.kick(reason); else await member.ban({ reason });
    return reply(interaction, { embeds: [successEmbed(`Đã ${commandName} **${member.user.tag}**.`)] });
  }

  if (commandName === 'server') {
    const owner = await guild.fetchOwner();
    return reply(interaction, { embeds: [baseEmbed(`🐉 ${guild.name}`, `**Chủ server:** ${owner}\n**Thành viên:** ${guild.memberCount}\n**Role:** ${guild.roles.cache.size}\n**Kênh:** ${guild.channels.cache.size}\n**Thành lập:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`).setThumbnail(guild.iconURL({ size: 256 }))] });
  }

  if (commandName === 'help') {
    return reply(interaction, { embeds: [baseEmbed('🤖 TRỢ GIÚP DRAGON GALAXY BOT', '**Cộng đồng**\n`/server` `/help`\n\n**Quản trị**\n`/announce` `/role add|remove` `/clear` `/timeout` `/untimeout` `/kick` `/ban`\n`/panel` — đăng xác minh hoặc ticket\n`/scan_server` — xuất cấu trúc server\n\n**Chủ server**\n`/setup` — tạo server mới, bổ sung hoặc tái cấu trúc an toàn')] });
  }
}

async function handleButton(interaction) {
  const { guild } = interaction;
  if (interaction.customId === 'verify_member') {
    const role = guild.roles.cache.get(communityTheme.fandomRoleId)
      || guild.roles.cache.find(item => item.name === config.memberRoleName || item.name === 'Aikon');
    if (!role) return reply(interaction, { embeds: [errorEmbed(`Không tìm thấy role **${config.memberRoleName}**.`)] });
    if (!role.editable) return reply(interaction, { embeds: [errorEmbed('Role thành viên đang nằm cao hơn role bot.')] });
    await interaction.member.roles.add(role, 'Xác minh cộng đồng Dragon Galaxy');
    return reply(interaction, { embeds: [successEmbed(`Bạn đã trở thành **Aikon**! Chào mừng đến Động Rồng Galaxy ${role}.`)] });
  }

  if (interaction.customId === 'ticket_open') {
    const existing = guild.channels.cache.find(channel => channel.topic?.includes(`dragon-ticket-owner:${interaction.user.id}`));
    if (existing) return reply(interaction, { embeds: [errorEmbed(`Bạn đã có ticket đang mở: ${existing}`)] });
    const staff = staffRoles(guild);
    let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === '🎫 HỖ TRỢ CỘNG ĐỒNG');
    if (!category) {
      category = await guild.channels.create({
        name: '🎫 HỖ TRỢ CỘNG ĐỒNG', type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
          ...staff.map(role => ({ id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] }))
        ]
      });
    }
    const channel = await guild.channels.create({
      name: `ticket-${safeName(interaction.user.username)}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `dragon-ticket-owner:${interaction.user.id}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
        ...staff.map(role => ({ id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] }))
      ]
    });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Đóng ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
    await channel.send({ content: `${interaction.user} ${staff.map(role => `${role}`).join(' ')}`, embeds: [baseEmbed('🎫 TICKET HỖ TRỢ', 'Hãy mô tả vấn đề chi tiết. Đội ngũ quản trị sẽ phản hồi tại đây.')], components: [row] });
    return reply(interaction, { embeds: [successEmbed(`Ticket đã được tạo: ${channel}`)] });
  }

  if (interaction.customId === 'ticket_close') {
    const ownerId = interaction.channel.topic?.match(/dragon-ticket-owner:(\d+)/)?.[1];
    if (interaction.user.id !== ownerId && !isStaff(interaction)) return reply(interaction, { embeds: [errorEmbed('Chỉ người mở ticket hoặc Staff được đóng ticket.')] });
    if (ownerId) await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: false }).catch(() => null);
    await interaction.channel.setName(`closed-${interaction.channel.name}`.slice(0, 100)).catch(() => null);
    await interaction.channel.send({ embeds: [baseEmbed('🔒 Ticket đã đóng', `Đóng bởi ${interaction.user}. Kênh sẽ tự xóa sau 5 phút.`).setColor(0xfee75c)] });
    setTimeout(() => interaction.channel.delete('Dragon Galaxy ticket closed for 5 minutes').catch(() => null), 5 * 60_000).unref();
    return reply(interaction, { embeds: [successEmbed('Đã đóng ticket.')] });
  }
}

export async function handleInteraction(interaction) {
  if (!interaction.inGuild()) return;
  try {
    if (interaction.isChatInputCommand() || interaction.isButton()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
  } catch (error) {
    console.error('Interaction error:', error);
    await reply(interaction, { embeds: [errorEmbed(`Đã xảy ra lỗi: ${error.message}`)] }).catch(() => null);
  }
}

export async function sendWelcome(member) {
  const channel = member.guild.channels.cache.get('1146428977402097725')
    || member.guild.channels.cache.find(item => item.isTextBased() && (item.name.includes('chào-mừng') || item.name.includes('𝐰𝐞𝐥𝐜𝐨𝐦𝐞')));
  if (!channel) return;
  await channel.send({ embeds: [baseEmbed(`👋 Chào mừng ${member.user.username}!`, `Xin chào ${member}, bạn là thành viên thứ **${member.guild.memberCount}** của **${member.guild.name}**. Hãy đọc nội quy và xác minh để bắt đầu.`).setThumbnail(member.user.displayAvatarURL({ size: 256 }))] });
}

export async function sendLeave(member) {
  await logAction(member.guild, '📤 Thành viên rời server', `**${member.user.tag}** (${member.id}) đã rời cộng đồng.`, 0x747f8d);
}

