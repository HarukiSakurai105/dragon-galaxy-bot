# Dragon Galaxy Community Bot

Bot Discord riêng cho **🐉🪐Động Rồng Galaxy🌸❄**, được tạo từ file scan ngày 15/10/2026.

## Cấu trúc nguồn

- Snapshot gốc: `template/server-structure.json` và `template/server-structure.md`.
- 80 role trong báo cáo; bot tự bỏ qua `@everyone` và role managed của bot/integration khác.
- 14 category, 51 kênh chat/forum/announcement và 10 kênh voice/stage.
- Permission overwrite được ánh xạ theo tên role, nên có thể dùng trên server gốc hoặc server mới.

## Tính năng

- `/setup`:
  - **Chỉ tạo phần còn thiếu**: không sửa/xóa cấu trúc hiện có.
  - **Server mới — tạo toàn bộ cấu trúc**: đặt tên server, tạo đầy đủ role/category/phòng, áp dụng permission từ template và sắp xếp role từ thấp lên cao.
  - **Tái cấu trúc an toàn**: đổi tên và sắp xếp chính kênh/role cũ theo ID. Không xóa kênh cũ trong snapshot, không mất lịch sử chat, không gỡ role khỏi thành viên và không ghi đè permission hiện tại.
  - **Đồng bộ cả permission**: chế độ nâng cao; đồng bộ permission từ snapshot nhưng vẫn không xóa kênh hoặc role.
- `/scan_server`: xuất báo cáo Markdown + JSON và link tải trực tiếp.
- `npm run preview-changes`: xuất `CHANGE-PREVIEW.md` liệt kê tên cũ → tên mới trước khi chạy setup.
- `/panel`: bảng xác minh thành viên hoặc ticket hỗ trợ.
- Ticket riêng tư, Staff xử lý, đóng xong tự xóa sau 5 phút.
- Toàn bộ 14 category dùng kiểu `╔★・TÊN SẢNH・★╗`; toàn bộ 61 phòng dùng nhánh `╭` / `├` / `╰` giống mẫu Discord.
- Welcome/leave log, thông báo, cấp/gỡ role, clear, timeout, kick và ban.
- Đa server, không cần `GUILD_ID`; dữ liệu mỗi server được lưu riêng.

## Cài đặt

Yêu cầu Node.js 20 trở lên.

```bash
npm install
```

Sao chép `.env.example` thành `.env`, rồi điền:

```env
DISCORD_TOKEN=token_bot
# Không bắt buộc; bot tự nhận Application ID từ token đăng nhập
CLIENT_ID=
TIMEZONE=Asia/Ho_Chi_Minh
BRAND_NAME=Động Rồng Galaxy
BRAND_COLOR=FF8FDB
PORT=3001
```

Trong Discord Developer Portal, bật **Server Members Intent**. Link mời bot phải có `bot` và `applications.commands`; lần setup đầu nên cấp `Administrator`. Kéo role bot lên trên mọi role mà bot cần tạo, sửa hoặc cấp.

Bot tự lấy Application ID từ tài khoản bot đã đăng nhập. Không điền ID server vào `CLIENT_ID`; biến này có thể để trống.

## Chạy

Windows: nhấp đúp `CHAY-BOT.cmd`.

Termux/Linux:

```bash
npm install
npm start
```

Sau khi bot online, chủ server chạy `/setup` → **Tái cấu trúc an toàn — giữ chat và role thành viên**. Bot sẽ giữ tên server đúng là **🐉🪐Động Rồng Galaxy🌸❄**, dùng **🌌・Aikon** làm role fandom, đổi toàn bộ 50 role cộng đồng về font thường có icon, trang trí toàn bộ 75 category/kênh cũ theo cùng kiểu nhánh cây và gỡ khu SẢNH CHÍNH bổ sung đang dư thừa.

Bot mới mặc định dùng health port `3001`, nên có thể chạy cùng máy với bot UPD đang dùng port `3000`.

## An toàn

- Bot không có lệnh xóa toàn bộ server.
- Role/kênh ngoài snapshot không bị xóa.
- Chỉ `👑・Quản Lý Aiko` và `🌸・Galaxy Master` được cấp Administrator; các cấp quản lý khác dùng permission giới hạn theo nhiệm vụ.
- Thứ tự role được lấy trực tiếp từ trường `position` trong file scan JSON/Markdown.
- Kênh trong snapshot được đổi tên/di chuyển tại chỗ, vì vậy tin nhắn và lịch sử chat vẫn còn nguyên.
- Role trong snapshot được sửa tại chỗ, không xóa/tạo lại nên membership của thành viên vẫn còn nguyên.
- Role managed của bot khác không được tạo lại.
- Snapshot chứa ID và permission riêng tư; chỉ chia sẻ repository với người tin tưởng.
- Một số role trong snapshot có quyền `Administrator`; hãy kiểm tra kỹ trước khi đồng bộ sang server khác.
