# 🧬 Thợ Săn Thẻ Bài

> Khu rừng tiến hoá — biến mỗi tiết học thành một hành trình tiến hoá.

Ứng dụng quản lý lớp học theo phong cách Sinh học, chạy hoàn toàn trên trình duyệt. Học sinh tích luỹ năng lượng **ATP** qua mỗi lần phát biểu và mỗi điểm cao; đủ mốc ATP thì được lật một **thẻ tiến hoá** để nhận đặc quyền do giáo viên đặt ra.

- **Không cần cài đặt** — mở file là chạy, không có bước build, không có phụ thuộc npm.
- **Không cần mạng** — thư viện và phông chữ đều nằm sẵn trong repo.
- **Dữ liệu nằm trên máy** — lưu bằng SQLite ngay trong trình duyệt, không gửi đi đâu.

![Màn hình Tiết học](assets/landing/man-tiet-hoc.jpg)

## Bắt đầu

1. Tải repo về (hoặc `git clone git@github.com:AnhLeViet1603/Tho-san-the-bai.git`).
2. Mở `index.html` bằng **Chrome** hoặc **Edge** để vào ứng dụng.
3. Mở `landing.html` nếu muốn xem trang giới thiệu.

Lần chạy đầu tiên ứng dụng tự tạo cơ sở dữ liệu và 5 thẻ mẫu. Vào **Cài đặt** để tạo lớp và nhập danh sách học sinh.

## Tính năng

| | |
|---|---|
| ⚡ **Cộng ATP một lần bấm** | Phát biểu, điểm 8–9, điểm 9+ hoặc một số tuỳ ý. Chọn nhiều em để cộng cùng lúc, bấm nhầm thì hoàn tác. |
| 🃏 **Thẻ tiến hoá** | Mỗi thẻ là một đặc quyền có hạn sử dụng. Tự đặt tên, nội dung và ảnh cho từng lá. |
| 🐾 **Chia nhóm trong tiết** | Chia ngẫu nhiên hoặc kéo thả. Cộng điểm cho nhóm thì mọi thành viên đều nhận ATP. |
| 📊 **Thống kê** | Biểu đồ tròn, biểu đồ cột theo lớp, thời gian, loại hoạt động, nhóm, học sinh; kèm bảng xếp hạng. |
| 📥 **Nhập từ Excel** | Chọn file `.xlsx` / `.xls` / `.csv`, chọn cột họ tên, xem trước rồi nhập. Tên trùng được bỏ qua. |
| 💾 **Sao lưu** | Xuất toàn bộ dữ liệu ra một file `.sqlite`, nhập lại trên máy khác. |

## Luật chơi

1. **Săn ATP** — phát biểu và đạt điểm cao để nhận năng lượng. Điểm của nhóm cũng tính cho từng em.
2. **Chạm mốc** — cứ đủ một mốc ATP trong năm học, học sinh có thêm một lượt lật thẻ.
3. **Lật thẻ** — chọn một trong các thẻ đang úp.
4. **Dùng đặc quyền** — từ tuần kế tiếp, giáo viên bấm vào thẻ của em để sử dụng. Thẻ quá hạn tự biến mất.

Mỗi loại thẻ chỉ giữ tối đa một lá. Sang năm học mới, ATP tính lại từ đầu (dữ liệu cũ vẫn còn trong thống kê).

Giá trị mặc định, đều chỉnh được trong **Cài đặt**:

| Thiết lập | Mặc định |
|---|---|
| ATP cho một lần phát biểu | 1 |
| ATP cho điểm 8–9 | 2 |
| ATP cho điểm 9+ | 3 |
| Mốc ATP để lật thẻ | 50 |
| Số thẻ úp mỗi lần lật | 3 |
| Hạn dùng thẻ | 30 ngày |

## Dữ liệu và sao lưu

Dữ liệu được lưu bằng SQLite ([sql.js](https://github.com/sql-js/sql.js)) và ghi bền vào IndexedDB của trình duyệt, dưới tên `tho-san-the-bai`. Điều này có nghĩa là:

- Dữ liệu gắn với **trình duyệt và hồ sơ người dùng** trên máy đó. Xoá dữ liệu duyệt web sẽ xoá luôn dữ liệu lớp.
- Nên thường xuyên vào **Cài đặt → Dữ liệu** để xuất file sao lưu `.sqlite`.
- File sao lưu chứa tên học sinh thật — `.gitignore` đã chặn `*.sqlite` để tránh đưa nhầm lên repo.

## Cấu trúc thư mục

```
index.html          Ứng dụng chính
landing.html        Trang giới thiệu
css/                Giao diện (base, theme-forest, components, views, landing)
js/
  app.js            Khởi động ứng dụng
  core/             db (SQLite + IndexedDB), router (hash), store, time, ui
  data/             Truy vấn theo miền: lớp, học sinh, tiết, ATP, thẻ, tiến hoá, nhóm, thống kê
  features/         Cộng ATP, lật thẻ, chọn học sinh, nhập Excel, sao lưu
  views/            Các màn hình: rừng, tiết học, nhóm, thẻ bài, thống kê, cài đặt
assets/             Phông Be Vietnam Pro và ảnh chụp màn hình
vendor/             sql.js, SheetJS (xlsx), Chart.js — bản offline
tests/              Test đơn vị và test giao diện
```

Mã nguồn là JavaScript thuần, không dùng framework hay bundler. Các file được nạp bằng thẻ `<script>` theo thứ tự trong `index.html` và gắn vào không gian tên chung `window.TSTB`.

## Kiểm thử

Cần [Node.js](https://nodejs.org/) (đã chạy với Node 26); không cần `npm install`.

```bash
# Test đơn vị: lớp dữ liệu chạy trong Node với SQLite trong bộ nhớ
node --test "tests/unit/*.test.js"

# Test giao diện: điều khiển Edge/Chrome headless qua DevTools Protocol
node tests/ui/run-ui.mjs
node tests/ui/landing-ui.mjs
```

Test giao diện tự tìm Edge hoặc Chrome ở đường dẫn cài đặt mặc định; nếu trình duyệt nằm chỗ khác, đặt biến môi trường `BROWSER_PATH`. Test dùng hồ sơ trình duyệt tạm nên không đụng tới dữ liệu thật.

## Giấy phép bên thứ ba

- Phông chữ **Be Vietnam Pro** — SIL Open Font License, xem `assets/fonts/OFL.txt`.
- **sql.js**, **SheetJS** và **Chart.js** trong `vendor/` thuộc giấy phép của từng dự án.
