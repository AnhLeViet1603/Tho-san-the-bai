# Nhật ký thay đổi

Mỗi phiên bản có một mục `## [x.y.z] - ngày`. Khi phát hành, nội dung của mục đó được dùng làm ghi chú release.

## [1.1.1] - 2026-10-14

Không thay đổi tính năng của ứng dụng.

- Mã nguồn dùng giấy phép MIT: được tự do dùng, sửa và chia sẻ lại.
- Dùng được ngay trên web qua GitHub Pages, không cần tải về.
- Thêm nhật ký thay đổi và quy trình phát hành tự động: mỗi phiên bản có file zip tải về ở trang Releases.

## [1.1.0] - 2026-10-14

### Thêm mới

- Giáo viên sửa được thẻ của từng học sinh ngay trong bảng thẻ: sửa ngày hết hạn, đổi sang loại thẻ khác, xoá thẻ.
- Khi xoá thẻ có thể chọn trả lại lượt lật hoặc không. Thẻ xoá mà không trả lượt lật được ghi vào Lịch sử thẻ với ghi chú "Giáo viên xoá" và hoàn tác được.
- Footer hiển thị số phiên bản ở ứng dụng và trang giới thiệu.

### Ghi chú nâng cấp

- Dữ liệu từ bản 1.0.0 dùng tiếp được, không cần xuất rồi nhập lại.

## [1.0.0] - 2026-10-13

Bản đầu tiên.

- Cộng ATP cho phát biểu, điểm 8–9, điểm 9+ hoặc số tuỳ ý; cộng cho nhiều em cùng lúc và hoàn tác.
- Thẻ tiến hoá: lật thẻ khi đủ mốc ATP, mỗi loại giữ một lá, có hạn dùng, không dùng được trong tuần vừa nhận.
- Chia nhóm trong tiết, cộng ATP cho cả nhóm.
- Thống kê bằng biểu đồ và bảng xếp hạng.
- Nhập danh sách học sinh từ Excel.
- Sao lưu và khôi phục dữ liệu bằng file `.sqlite`.
- Trang giới thiệu.
