# Nhật ký thay đổi

Mỗi phiên bản có một mục `## [x.y.z] - ngày`. Khi phát hành, nội dung của mục đó được dùng làm ghi chú release.

## [Chưa phát hành]

### Độ hiếm thẻ R / SR / SSR

- Mỗi loại thẻ thuộc một cấp: **R** (thường), **SR** (hiếm), **SSR** (siêu hiếm). Thẻ có sẵn được tính là R.
- Cài đặt → Thẻ tiến hoá: bộ thẻ chia thành 3 nhóm, mỗi nhóm có nút "＋ Thêm thẻ R/SR/SSR"; sửa thẻ để đổi cấp.
- Thanh trượt 2 núm chỉnh tỉ lệ ra R / SR / SSR (mặc định 70% / 25% / 5%), có cảnh báo khi một cấp có tỉ lệ mà chưa có thẻ.
- Khung thẻ riêng theo cấp: R viền xanh lá, SR viền tím ánh nhẹ, SSR viền vàng cầu vồng ánh chạy.
- Màn lật thẻ: các lá úp giống hệt nhau cho tới khi chọn; lật ra SR có tia sáng tím, SSR có tia cầu vồng và hạt lấp lánh.
- Luôn chia đủ số lá úp, kể cả khi một cấp có ít loại thẻ (khi đó có thể trùng loại trong cùng một lượt).
- Bộ thẻ mẫu cho dữ liệu mới có 12 thẻ: 5 R, 4 SR, 3 SSR, đặc quyền tăng dần theo độ hiếm.

### Thống kê

- Màn Thống kê chia thành 3 tab con dùng chung bộ lọc: **Tổng quan**, **ATP**, **Thẻ**.
- Thống kê thẻ lọc được theo tháng / tuần.
- Tab Thẻ: số SR / SSR đã phát, phân bố độ hiếm, độ hiếm theo lớp và bảng R / SR / SSR theo từng học sinh. Đổi cấp một loại thẻ không làm đổi số liệu của các lá đã phát.

## [1.2.0] - 2026-10-16

Bản này tập trung vào việc **không làm mất dữ liệu** và **khôi phục được khi lỡ tay**.

### Lưu dữ liệu an toàn hơn

- Mở ứng dụng ở hai tab cùng lúc không còn làm mất dữ liệu: chỉ một tab được ghi, tab kia hiện thông báo và có nút "Dùng ở tab này".
- Thanh bên báo trạng thái lưu ("Đã lưu" / "Đang lưu" / "Chưa lưu được"). Lưu bị lỗi (ví dụ đầy bộ nhớ) thì tự thử lại; đóng tab khi còn thay đổi chưa lưu thì trình duyệt hỏi lại.
- **Bản chụp tự động**: mỗi ngày, và trước khi nhập file, xoá toàn bộ, khôi phục, nâng cấp hay sửa dữ liệu. Giữ 5 bản gần nhất, khôi phục trong Cài đặt → Dữ liệu › Bản chụp.
- **Tự lưu ra file** (Chrome / Edge trên máy tính): chọn một file (nên đặt trong OneDrive / Google Drive hoặc USB), ứng dụng tự ghi toàn bộ dữ liệu vào đó sau mỗi thay đổi. File nằm ngoài trình duyệt nên còn nguyên khi dữ liệu trình duyệt bị xoá. Trình duyệt có thể hỏi lại quyền ghi file mỗi lần mở: bấm nút "📁 Bấm để tiếp tục tự lưu ra file" ở thanh bên.
- **Nhắc sao lưu** khi quá 7 ngày chưa sao lưu (có nút "Xuất ngay" và "Để mai").
- Mở ứng dụng trên trình duyệt chưa có dữ liệu (máy mới, hoặc dữ liệu trình duyệt vừa bị xoá) thì có hộp chào mời **nhập file sao lưu** thay vì bắt đầu trống.
- Nhập file sao lưu được kiểm tra trước: file hỏng hoặc tạo từ phiên bản mới hơn bị từ chối, dữ liệu đang dùng giữ nguyên.
- Mở ứng dụng thì tự kiểm tra dữ liệu lỗi (bản ghi mồ côi, giá trị lạ); có lỗi thì báo và có nút sửa trong Cài đặt → Dữ liệu.

### Thùng rác và khôi phục

- Xoá **lớp**, **học sinh** hay **loại thẻ** giờ là chuyển vào thùng rác: biến khỏi mọi màn hình và thống kê nhưng dữ liệu còn nguyên, khôi phục được ở tab con "Thùng rác" trong Cài đặt. Muốn xoá hẳn thì bấm "Xoá vĩnh viễn" trong thùng rác.
- Khôi phục loại thẻ thì các lá bị thu lúc xoá được trả lại cho học sinh.
- Xoá thẻ của học sinh kiểu "trả lại lượt lật" giờ cũng hoàn tác được trong Lịch sử thẻ (khi em chưa dùng lượt được trả để lật thẻ khác). Không hoàn tác được thì ứng dụng nói rõ lý do.
- Import Excel kiểu "Thay thế danh sách" chuyển học sinh cũ vào thùng rác thay vì xoá hẳn.
- **Nhật ký thao tác** (Cài đặt → Dữ liệu › Nhật ký): ghi lại các lần xoá, sửa, hoàn tác và đổi cài đặt, để tra lại khi có thắc mắc về điểm hay thẻ.

### Lượt lật thẻ luôn đúng

- Xoá một loại thẻ không còn làm học sinh được lật bù.
- Đổi mốc ATP tiến hoá thì ứng dụng báo trước bao nhiêu em có thêm lượt lật hoặc thành ra đã lật quá.
- Hoàn tác / xoá lượt cộng ATP mà làm em không còn đủ ATP cho số thẻ đã lật thì ứng dụng hỏi lại, nêu tên các em.
- Màn lật thẻ mở từ trước mà trong lúc đó ATP bị hoàn tác hay thẻ bị xoá thì không phát thẻ, báo lý do.
- Một học sinh không thể giữ hai lá cùng loại, kể cả khi dữ liệu bị chỉnh tay.
- ATP theo năm học tính đúng tới từng mili giây ở ranh giới đầu / cuối năm (giờ Việt Nam).

### Giao diện

- Cài đặt → Lớp học, Học sinh, Thẻ tiến hoá và Dữ liệu được chia thành các tab con cho gọn.
- Trang giới thiệu có thêm mục "Không sợ mất dữ liệu, không sợ bấm nhầm" và các câu hỏi về xoá dữ liệu trình duyệt, xoá nhầm.

### Ghi chú nâng cấp

- Dữ liệu từ các bản 1.x dùng tiếp được, không cần xuất rồi nhập lại. Lần đầu mở bản này, ứng dụng tự nâng cấp dữ liệu và chụp lại một bản "Trước khi nâng cấp dữ liệu" để phòng khi cần lùi lại.
- **Đừng nhập file sao lưu của bản này vào bản cũ hơn**: bản 1.1.x không hiểu thùng rác và cách tính lượt lật mới, sẽ hiện sai (ví dụ lớp, học sinh đã xoá hiện trở lại). Hãy cập nhật mọi máy lên 1.2.0. Từ bản này trở đi, ứng dụng tự từ chối file tạo bởi phiên bản mới hơn.
- Vẫn nên xuất file sao lưu hoặc bật tự lưu ra file: bản chụp tự động nằm cùng chỗ với dữ liệu trong trình duyệt, xoá dữ liệu trình duyệt là mất cả hai.

## [1.1.2] - 2026-10-14

### Sửa lỗi

- Hộp thoại "Cộng / trừ ATP": gõ số rồi nhấn Enter giờ ghi nhận ngay như bấm nút Ghi nhận. Trước đây nhấn Enter không có tác dụng, ATP không được cộng. Các hộp thoại khác có từ hai ô nhập trở lên (sửa thẻ, sửa học sinh…) cũng nhận Enter.

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
