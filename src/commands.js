import { PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const commandData = [
  new SlashCommandBuilder().setName('setup').setDescription('Đồng bộ server theo file scan Dragon Galaxy')
    .addStringOption(option => option.setName('chế_độ').setDescription('Mức áp dụng cấu trúc').setRequired(true).addChoices(
      { name: 'Chỉ tạo phần còn thiếu', value: 'missing' },
      { name: 'Server mới — tạo toàn bộ cấu trúc', value: 'fresh' },
      { name: 'Tái cấu trúc an toàn — giữ chat và role thành viên', value: 'safe' },
      { name: 'Đồng bộ cả permission (nâng cao)', value: 'sync' },
      { name: 'Tạo lại role — chuyển thành viên và xếp theo quyền', value: 'rebuild_roles' }
    )).setDefaultMemberPermissions(P.Administrator),
  new SlashCommandBuilder().setName('scan_server').setDescription('Xuất toàn bộ role, kênh và permission thành MD + JSON').setDefaultMemberPermissions(P.ManageGuild),
  new SlashCommandBuilder().setName('panel').setDescription('Đăng bảng xác minh hoặc ticket')
    .addStringOption(option => option.setName('loại').setDescription('Loại bảng').setRequired(true).addChoices(
      { name: 'Xác minh thành viên', value: 'verify' },
      { name: 'Hỗ trợ / ticket', value: 'ticket' }
    )).setDefaultMemberPermissions(P.ManageGuild),
  new SlashCommandBuilder().setName('announce').setDescription('Gửi thông báo chính thức')
    .addStringOption(option => option.setName('nội_dung').setDescription('Nội dung').setRequired(true))
    .addChannelOption(option => option.setName('kênh').setDescription('Kênh nhận; mặc định kênh hiện tại'))
    .setDefaultMemberPermissions(P.ManageMessages),
  new SlashCommandBuilder().setName('role').setDescription('Cấp hoặc gỡ role cho thành viên')
    .addSubcommand(sub => sub.setName('add').setDescription('Cấp role').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Gỡ role').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .setDefaultMemberPermissions(P.ManageRoles),
  new SlashCommandBuilder().setName('clear').setDescription('Xóa tin nhắn gần đây').addIntegerOption(o => o.setName('số_lượng').setDescription('1–100').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(P.ManageMessages),
  new SlashCommandBuilder().setName('timeout').setDescription('Cách ly thành viên').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).addIntegerOption(o => o.setName('phút').setDescription('Số phút').setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o => o.setName('lý_do').setDescription('Lý do').setRequired(true)).setDefaultMemberPermissions(P.ModerateMembers),
  new SlashCommandBuilder().setName('untimeout').setDescription('Gỡ cách ly thành viên').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).setDefaultMemberPermissions(P.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('Mời thành viên khỏi server').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).addStringOption(o => o.setName('lý_do').setDescription('Lý do').setRequired(true)).setDefaultMemberPermissions(P.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Cấm thành viên').addUserOption(o => o.setName('thành_viên').setDescription('Thành viên').setRequired(true)).addStringOption(o => o.setName('lý_do').setDescription('Lý do').setRequired(true)).setDefaultMemberPermissions(P.BanMembers),
  new SlashCommandBuilder().setName('server').setDescription('Xem thông tin server'),
  new SlashCommandBuilder().setName('help').setDescription('Xem hướng dẫn bot')
].map(command => command.toJSON());

