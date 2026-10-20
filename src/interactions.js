import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits as P,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { config } from './config.js';
import { baseEmbed, errorEmbed, successEmbed } from './embeds.js';
import { createServerReport } from './report.js';
import { setupFromSnapshot } from './setup.js';
import { getGuildData, updateGuildData } from './storage.js';
import { communityTheme } from './theme.js';

const moderatedDepartures = new Map();

function markModeratedDeparture(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const expiresAt = Date.now() + 12_000;
  moderatedDepartures.set(key, expiresAt);
  setTimeout(() => {
    if (moderatedDepartures.get(key) === expiresAt) moderatedDepartures.delete(key);
  }, 12_000).unref();
}

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
  const settings = (await getGuildData(guild.id)).notifications?.modlog;
  if (settings?.enabled === false) return;
  const channel = settings?.channelId
    ? guild.channels.cache.get(settings.channelId)
    : guild.channels.cache.get('1151202729763553350')
      || guild.channels.cache.find(item => item.isTextBased() && (item.name.includes('bot-log') || item.name.includes('𝐛𝐨𝐭-𝐥𝐨𝐠')));
  if (channel && !channel.isTextBased()) return;
  await channel?.send({ embeds: [baseEmbed(title, description).setColor(color)] }).catch(() => null);
}

function fillTemplate(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
}

const helpPages = {
  overview: {
    title: '🐉 Dragon Galaxy • Trung tâm trợ giúp',
    description: 'Chọn một mục bên dưới để xem hướng dẫn. Các lệnh quản trị chỉ hiện với thành viên có quyền phù hợp.',
    fields: [
      { name: '🌸 Cộng đồng', value: '`/server` xem thông tin server\n`/panel` đăng bảng xác minh hoặc hỗ trợ', inline: true },
      { name: '🔔 Thông báo', value: '`/notification-panel` mở giao diện chỉnh Welcome, Boost, Rời server và Mod Log', inline: true },
      { name: '🛠️ Quản trị', value: '`/setup` đồng bộ cấu trúc\n`/scan_server` xuất báo cáo server', inline: true }
    ]
  },
  community: {
    title: '🌸 Cộng đồng & thông báo',
    description: 'Các thông báo có thể chỉnh trực tiếp bằng `/notification-panel` hoặc qua lệnh nhanh.',
    fields: [
      { name: 'Chào mừng', value: '`/welcome set` cấu hình kênh và nội dung; `/welcome disable` tắt tự động.', inline: false },
      { name: 'Boost & rời server', value: '`/boost set|disable` quản lý lời cảm ơn boost. Thông báo rời server có kênh/nội dung riêng trong bảng UI.', inline: false },
      { name: 'Placeholder', value: '`{user}` mention thành viên · `{username}` tên · `{server}` tên server · `{memberCount}` số thành viên.', inline: false }
    ]
  },
  moderation: {
    title: '🛡️ Công cụ kiểm duyệt',
    description: 'Các lệnh được Discord giới hạn theo quyền tài khoản và thứ tự role.',
    fields: [
      { name: 'Thành viên & nội dung', value: '`/role add|remove` cấp/gỡ role\n`/clear` xóa tin gần đây\n`/timeout` và `/untimeout` cách ly/gỡ cách ly', inline: false },
      { name: 'Xử lý vi phạm', value: '`/kick` mời thành viên khỏi server\n`/ban` cấm thành viên\n`/modlog set|disable` cấu hình log ban/kick/mute', inline: false },
      { name: 'Lưu ý', value: 'Bot cần đúng quyền Discord và role bot phải nằm cao hơn role mục tiêu.', inline: false }
    ]
  },
  setup: {
    title: '⚙️ Setup & cấu hình server',
    description: 'Dùng các công cụ này khi bạn có quyền Manage Server hoặc Administrator.',
    fields: [
      { name: 'Đồng bộ server', value: '`/setup` có chế độ tạo mới, bổ sung phần thiếu, tái cấu trúc an toàn và đồng bộ nâng cao.', inline: false },
      { name: 'Báo cáo', value: '`/scan_server` xuất danh sách role, category, kênh chat/voice và permission thành Markdown + JSON.', inline: false },
      { name: 'Giao diện thông báo', value: '`/notification-panel` mở bảng tương tác để chọn kênh, sửa nội dung, bật/tắt từng loại.', inline: false }
    ]
  }
};

function helpPanelPayload(guild, page = 'overview') {
  const data = helpPages[page] || helpPages.overview;
  const embed = baseEmbed(data.title, data.description).addFields(data.fields);
  const icon = guild.iconURL({ size: 256 });
  if (icon) embed.setThumbnail(icon);
  embed.setFooter({ text: `Dragon Galaxy Bot • ${Object.keys(helpPages).indexOf(page) + 1}/${Object.keys(helpPages).length} • Chọn mục bên dưới` });
  const labels = [['overview', 'Tổng quan', '🐉'], ['community', 'Cộng đồng', '🌸'], ['moderation', 'Kiểm duyệt', '🛡️'], ['setup', 'Setup', '⚙️']];
  const row = new ActionRowBuilder().addComponents(labels.map(([key, label, emoji]) =>
    new ButtonBuilder().setCustomId(`help_page_${key}`).setLabel(label).setEmoji(emoji)
      .setStyle(page === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ));
  return { embeds: [embed], components: [row] };
}

async function handleHelpComponent(interaction) {
  const page = interaction.customId.replace('help_page_', '');
  if (!helpPages[page]) return;
  return interaction.update(helpPanelPayload(interaction.guild, page));
}

async function saveNotificationSettings(guildId, key, value) {
  return updateGuildData(guildId, current => ({
    ...current,
    notifications: { ...(current.notifications || {}), [key]: value }
  }));
}

const defaultNoticeChannels = { welcome: '1146428977402097725', boost: '1186524449290321970', modlog: '1151202729763553350', leave: '1151202729763553350' };

async function notificationPanelPayload(guild) {
  const settings = (await getGuildData(guild.id)).notifications || {};
  const names = { welcome: 'Welcome', boost: 'Server Boost', modlog: 'Log ban / kick / mute', leave: 'Thành viên rời server' };
  const status = Object.entries(names).map(([key, label]) => {
    const item = settings[key];
    const enabled = item?.enabled !== false;
    const channelId = item?.channelId || defaultNoticeChannels[key];
    const channel = guild.channels.cache.get(channelId);
    return `**${label}:** ${enabled ? '🟢 Bật' : '🔴 Tắt'}${enabled ? ` • ${channel ? `<#${channelId}>` : 'kênh mặc định'}` : ''}`;
  }).join('\n');
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('notification_edit_welcome').setLabel('Sửa Welcome').setEmoji('👋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('notification_edit_boost').setLabel('Sửa Boost').setEmoji('🚀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('notification_edit_modlog').setLabel('Kênh Mod Log').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('notification_edit_leave').setLabel('Sửa Rời server').setEmoji('👋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('notification_refresh').setLabel('Làm mới').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('notification_toggle_welcome').setLabel('Bật / tắt Welcome').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('notification_toggle_boost').setLabel('Bật / tắt Boost').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('notification_toggle_modlog').setLabel('Bật / tắt Mod Log').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('notification_toggle_leave').setLabel('Bật / tắt Rời server').setStyle(ButtonStyle.Secondary)
    )
  ];
  return { embeds: [baseEmbed('🔔 BẢNG CẤU HÌNH THÔNG BÁO', `${status}\n\nSửa Welcome, Boost hoặc Rời server để chọn kênh và nội dung. Placeholder: \`{user}\`, \`{username}\`, \`{server}\`, \`{memberCount}\`. Mod Log ghi riêng ban/kick/mute.`)], components: rows };
}

async function handleNotificationPanelComponent(interaction) {
  if (!interaction.memberPermissions?.has(P.ManageGuild)) {
    return reply(interaction, { embeds: [errorEmbed('Bạn cần quyền Manage Server để chỉnh bảng thông báo.')] });
  }
  const [, action, type] = interaction.customId.match(/^notification_(edit|toggle)_(welcome|boost|modlog|leave)$/) || [];
  if (interaction.customId === 'notification_refresh') {
    return interaction.update(await notificationPanelPayload(interaction.guild));
  }
  if (action === 'toggle') {
    const current = (await getGuildData(interaction.guild.id)).notifications?.[type] || {};
    await saveNotificationSettings(interaction.guild.id, type, { ...current, enabled: current.enabled === false });
    return interaction.update(await notificationPanelPayload(interaction.guild));
  }
  if (action !== 'edit') return;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`notification_select_${type}`)
    .setPlaceholder('Chọn kênh chat hoặc announcement')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  return interaction.reply({
    content: type === 'modlog' ? 'Chọn kênh nhận log ban, kick và mute:' : `Chọn kênh đăng ${type === 'welcome' ? 'Welcome' : type === 'boost' ? 'Server Boost' : 'thông báo thành viên rời'}:`,
    components: [new ActionRowBuilder().addComponents(channelSelect)],
    flags: MessageFlags.Ephemeral
  });
}

async function handleNotificationChannelSelect(interaction) {
  if (!interaction.memberPermissions?.has(P.ManageGuild)) {
    return reply(interaction, { embeds: [errorEmbed('Bạn cần quyền Manage Server để chỉnh bảng thông báo.')] });
  }
  const type = interaction.customId.replace('notification_select_', '');
  if (!['welcome', 'boost', 'modlog', 'leave'].includes(type)) return;
  const channel = interaction.guild.channels.cache.get(interaction.values[0]);
  if (!channel?.isTextBased() || !channel.send) {
    return reply(interaction, { embeds: [errorEmbed('Kênh đã chọn không hỗ trợ gửi tin nhắn.')] });
  }
  if (type === 'modlog') {
    await saveNotificationSettings(interaction.guild.id, 'modlog', { enabled: true, channelId: channel.id });
    return interaction.update({ content: `✅ Kênh log đã đặt thành ${channel}.`, embeds: [], components: [] });
  }

  const current = (await getGuildData(interaction.guild.id)).notifications?.[type] || {};
  const modal = new ModalBuilder()
    .setCustomId(`notification_modal_${type}_${channel.id}`)
    .setTitle(type === 'welcome' ? 'Cấu hình Welcome' : type === 'boost' ? 'Cấu hình Server Boost' : 'Cấu hình thành viên rời server');
  const defaultMessage = type === 'welcome'
    ? 'Xin chào {user}, bạn là thành viên thứ **{memberCount}** của **{server}**. Hãy đọc nội quy và xác minh để bắt đầu!'
    : type === 'boost'
      ? 'Cảm ơn {user} đã boost **{server}**! Sự ủng hộ của bạn giúp cộng đồng ngày càng phát triển 💖'
      : '👋 **{username}** đã rời khỏi **{server}**. Server hiện còn **{memberCount}** thành viên.';
  const messageInput = new TextInputBuilder()
    .setCustomId('message')
    .setLabel('Nội dung thông báo')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(current.message || defaultMessage)
    .setRequired(true)
    .setMaxLength(1000);
  return interaction.showModal(modal.addComponents(new ActionRowBuilder().addComponents(messageInput)));
}

async function handleNotificationModal(interaction) {
  if (!interaction.memberPermissions?.has(P.ManageGuild)) {
    return reply(interaction, { embeds: [errorEmbed('Bạn cần quyền Manage Server để chỉnh bảng thông báo.')] });
  }
  const [, type, channelId] = interaction.customId.match(/^notification_modal_(welcome|boost|leave)_(\d{17,20})$/) || [];
  if (!type || !channelId) return;
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || !channel.send) {
    return reply(interaction, { embeds: [errorEmbed('Không tìm thấy kênh chat hợp lệ. Hãy mở lại bảng và chọn kênh.')] });
  }
  const settings = { enabled: true, channelId: channel.id };
  if (type !== 'modlog') settings.message = interaction.fields.getTextInputValue('message').trim();
  await saveNotificationSettings(interaction.guild.id, type, settings);
  return reply(interaction, { embeds: [successEmbed(`Đã lưu cấu hình ${type === 'welcome' ? 'Welcome' : type === 'boost' ? 'Server Boost' : 'thành viên rời server'} tại ${channel}.`)] });
}

async function handleCommand(interaction) {
  const { commandName, guild } = interaction;

  if (commandName === 'notification-panel') {
    if (!interaction.memberPermissions?.has(P.ManageGuild)) return reply(interaction, { embeds: [errorEmbed('Bạn cần quyền Manage Server để mở bảng cấu hình.')] });
    return reply(interaction, await notificationPanelPayload(guild));
  }

  if (['welcome', 'boost', 'modlog'].includes(commandName)) {
    const subcommand = interaction.options.getSubcommand();
    const key = commandName === 'welcome' ? 'welcome' : commandName === 'boost' ? 'boost' : 'modlog';
    if (subcommand === 'disable') {
      await saveNotificationSettings(guild.id, key, { enabled: false });
      return reply(interaction, { embeds: [successEmbed(`Đã tắt thông báo ${key === 'modlog' ? 'kiểm duyệt' : key === 'welcome' ? 'welcome' : 'boost'}.`)] });
    }

    const channel = interaction.options.getChannel('kênh');
    if (!channel?.isTextBased() || !channel.send) return reply(interaction, { embeds: [errorEmbed('Hãy chọn kênh chat hoặc kênh announcement hợp lệ.')] });
    const settings = { enabled: true, channelId: channel.id };
    if (key !== 'modlog') settings.message = interaction.options.getString('nội_dung', true);
    await saveNotificationSettings(guild.id, key, settings);
    const detail = key === 'modlog'
      ? `Log ban, kick và mute sẽ gửi vào ${channel}. Cấu hình thông báo rời server riêng trong /notification-panel.`
      : `Thông báo ${key === 'welcome' ? 'welcome' : 'boost'} sẽ gửi vào ${channel}. Mẫu: ${settings.message}`;
    return reply(interaction, { embeds: [successEmbed(detail)] });
  }

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
    const cleanupText = [
      result.removedDeprecatedChannels ? `🧹 Đã xóa **${result.removedDeprecatedChannels}** category/phòng thuộc khu SẢNH CHÍNH dư thừa.` : '✅ Không xóa các kênh cũ từ bản scan.',
      result.removedRetiredRoles ? `🧹 Đã xóa **${result.removedRetiredRoles}** role cũ đã không còn người giữ.` : null
    ].filter(Boolean).join('\n');
    const orderText = sync
      ? result.ordering.roleOrderMatched
        ? `\n✅ Đã kiểm tra: **${result.ordering.orderedRoleCount} role** đúng thứ tự${rebuildRoles ? ' theo quyền từ cao xuống thấp' : ' trong file scan'}.`
        : '\n⚠️ Discord chưa xác nhận thứ tự role. Xem lỗi trong phần lưu ý để biết quyền hoặc role hierarchy đang chặn.'
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
    await logAction(guild, removing ? '✅ GỠ CÁCH LY' : '⏳ CÁCH LY', `${member} • thực hiện bởi ${interaction.user}${removing ? '' : `\n**Lý do:** ${value(interaction, 'lý_do')}`}`, removing ? 0x57f287 : 0xfee75c);
    return reply(interaction, { embeds: [successEmbed(removing ? `Đã gỡ cách ly ${member}.` : `Đã cách ly ${member} trong **${value(interaction, 'phút')} phút**.`)] });
  }

  if (commandName === 'kick' || commandName === 'ban') {
    const member = await guild.members.fetch(value(interaction, 'thành_viên'));
    if (!canActOn(interaction, member)) return reply(interaction, { embeds: [errorEmbed('Không thể xử lý thành viên này do thứ tự role.')] });
    const reason = value(interaction, 'lý_do');
    if (commandName === 'kick' && !member.kickable) return reply(interaction, { embeds: [errorEmbed('Bot không thể kick thành viên này.')] });
    if (commandName === 'ban' && !member.bannable) return reply(interaction, { embeds: [errorEmbed('Bot không thể ban thành viên này.')] });
    if (commandName === 'kick') await member.kick(reason); else await member.ban({ reason });
    markModeratedDeparture(guild.id, member.id);
    await logAction(guild, commandName === 'kick' ? '👢 KICK' : '🔨 BAN', `**${member.user.tag}**\n**Lý do:** ${reason}\n**Thực hiện:** ${interaction.user}`, 0xed4245);
    return reply(interaction, { embeds: [successEmbed(`Đã ${commandName} **${member.user.tag}**.`)] });
  }

  if (commandName === 'server') {
    const owner = await guild.fetchOwner();
    return reply(interaction, { embeds: [baseEmbed(`🐉 ${guild.name}`, `**Chủ server:** ${owner}\n**Thành viên:** ${guild.memberCount}\n**Role:** ${guild.roles.cache.size}\n**Kênh:** ${guild.channels.cache.size}\n**Thành lập:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`).setThumbnail(guild.iconURL({ size: 256 }))] });
  }

  if (commandName === 'help') return reply(interaction, helpPanelPayload(guild));
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
    if (interaction.isButton() && interaction.customId.startsWith('notification_')) {
      await handleNotificationPanelComponent(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('help_page_')) {
      await handleHelpComponent(interaction);
      return;
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('notification_select_')) {
      await handleNotificationChannelSelect(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('notification_modal_')) {
      await handleNotificationModal(interaction);
      return;
    }
    if (interaction.isChatInputCommand() || interaction.isButton()) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
  } catch (error) {
    console.error('Interaction error:', error);
    await reply(interaction, { embeds: [errorEmbed(`Đã xảy ra lỗi: ${error.message}`)] }).catch(() => null);
  }
}

export async function sendWelcome(member) {
  const settings = (await getGuildData(member.guild.id)).notifications?.welcome;
  if (settings?.enabled === false) return;
  const channel = settings?.channelId
    ? member.guild.channels.cache.get(settings.channelId)
    : member.guild.channels.cache.get('1146428977402097725')
      || member.guild.channels.cache.find(item => item.isTextBased() && (item.name.includes('chào-mừng') || item.name.includes('𝐰𝐞𝐥𝐜𝐨𝐦𝐞')));
  if (!channel?.isTextBased()) return;
  const template = settings?.message || 'Xin chào {user}, bạn là thành viên thứ **{memberCount}** của **{server}**. Hãy đọc nội quy và xác minh để bắt đầu!';
  const description = fillTemplate(template, member);
  await channel.send({ embeds: [baseEmbed(`👋 Chào mừng ${member.user.username}!`, description).setThumbnail(member.user.displayAvatarURL({ size: 256 }))], allowedMentions: { users: [member.id] } });
}

export async function sendLeave(member) {
  await new Promise(resolve => setTimeout(resolve, 1_200));
  const key = `${member.guild.id}:${member.id}`;
  const moderatedUntil = moderatedDepartures.get(key);
  if (moderatedUntil && moderatedUntil > Date.now()) {
    moderatedDepartures.delete(key);
    return;
  }
  const notifications = (await getGuildData(member.guild.id)).notifications || {};
  const settings = notifications.leave || {};
  if (settings.enabled === false) return;
  const channelId = settings.channelId || notifications.modlog?.channelId || defaultNoticeChannels.leave;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  const template = settings.message || '👋 **{username}** đã rời khỏi **{server}**. Server hiện còn **{memberCount}** thành viên.';
  await channel.send({ embeds: [baseEmbed('📤 THÀNH VIÊN RỜI SERVER', fillTemplate(template, member)).setColor(0x747f8d)] });
}

export async function sendBoost(oldMember, newMember) {
  if (oldMember.premiumSinceTimestamp || !newMember.premiumSinceTimestamp) return;
  const settings = (await getGuildData(newMember.guild.id)).notifications?.boost;
  if (settings?.enabled === false) return;
  const channel = settings?.channelId
    ? newMember.guild.channels.cache.get(settings.channelId)
    : newMember.guild.channels.cache.get('1186524449290321970');
  if (!channel?.isTextBased()) return;
  const template = settings?.message || 'Cảm ơn {user} đã boost **{server}**! Sự ủng hộ của bạn giúp cộng đồng ngày càng phát triển 💖';
  await channel.send({ embeds: [baseEmbed('🚀 CẢM ƠN BẠN ĐÃ BOOST SERVER!', fillTemplate(template, newMember)).setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))], allowedMentions: { users: [newMember.id] } });
}

export async function sendModerationAudit(entry, guild) {
  if (!guild || entry.executorId === guild.members.me?.id) return;
  const targetId = entry.targetId || entry.target?.id;
  const actorText = entry.executorId ? `<@${entry.executorId}>` : 'Không xác định';
  const reason = entry.reason || 'Không ghi lý do';
  let title;
  let color = 0xed4245;

  if (entry.action === AuditLogEvent.MemberKick) title = '👢 KICK THÀNH VIÊN';
  else if (entry.action === AuditLogEvent.MemberBanAdd) title = '🔨 BAN THÀNH VIÊN';
  else if (entry.action === AuditLogEvent.MemberUpdate) {
    const change = entry.changes?.find(item => ['communication_disabled_until', 'mute', 'deaf'].includes(item.key));
    if (!change) return;
    const enabled = Boolean(change.new);
    if (change.key === 'communication_disabled_until') title = enabled ? '⏳ TIMEOUT' : '✅ GỠ TIMEOUT';
    else if (change.key === 'mute') title = enabled ? '🔇 SERVER MUTE' : '🔊 GỠ SERVER MUTE';
    else title = enabled ? '🔕 SERVER DEAFEN' : '🔔 GỠ SERVER DEAFEN';
    if (!enabled) color = 0x57f287;
  } else return;

  if ((entry.action === AuditLogEvent.MemberKick || entry.action === AuditLogEvent.MemberBanAdd) && targetId) {
    markModeratedDeparture(guild.id, targetId);
  }
  const targetText = targetId ? `<@${targetId}> (${targetId})` : 'Không xác định';
  await logAction(guild, title, `**Thành viên:** ${targetText}\n**Thực hiện:** ${actorText}\n**Lý do:** ${reason}`, color);
}

