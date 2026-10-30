# Issue 04 — Nghiệp vụ và dữ liệu kiểm thử vòng đời booking

Tài liệu này ghi một phiên kiểm thử **riêng** cho [Issue #4](https://github.com/BoyTay/cal.diy/issues/4). [Issue 01](issue-01-booking-onboarding-architecture.md) cung cấp cách dựng môi trường và bằng chứng tham khảo; các ảnh và kết quả của Issue 01 không được tính là kết quả chạy mới ở đây.

## Mốc nguồn và môi trường

| Mục | Giá trị |
| --- | --- |
| Nhánh gốc | `qa/model-based-booking` |
| SHA trước khi tạo nhánh Issue 04 | `8f5866ac342a7068cc278456a938ed27820228a0` |
| Nhánh làm việc | `docs/issue-04-booking-scenarios` |
| Hệ điều hành | Windows; PowerShell 7 |
| Docker Engine / Compose | 29.7.2 / v5.5.1 |
| Múi giờ máy | `Asia/Saigon` (UTC+07:00) |
| Stack kiểm thử | Next.js 16.2.3 (Node 20.20.2) chạy cục bộ; PostgreSQL 17 trong container riêng `caldiy-issue04-db` trên `127.0.0.1:5450`; Chromium Playwright 143 |
| Cấu hình | `.env.example` + [script chuẩn bị](../../scripts/prepare-issue-04-env.ps1); `.env` cục bộ được Git bỏ qua; secret được sinh ngẫu nhiên và không in ra log |
| Tích hợp ngoài | Không kết nối calendar ngoài; SMTP cục bộ không chạy, nên gửi email báo `ECONNREFUSED ::1:1025` dù các API booking trả 200 |

Các dịch vụ khác trên máy không thuộc stack này. Thời gian của từng thao tác phải ghi theo cả `Asia/Saigon` và UTC, không suy ra từ nhãn múi giờ trên UI nếu chưa đối chiếu.

## Dữ liệu và quy tắc quan sát

- Host thử nghiệm: tài khoản cục bộ dùng email giả, event type cá nhân 30 phút, timezone `Asia/Saigon`, lịch làm việc có hai slot tương lai trống A và B.
- Booker: tên và email giả; không dùng thông tin cá nhân thật. B dùng cùng người đặt với A.
- Ghi nhận `Booking.status`, `rescheduled`, `fromReschedule`, `startTime`, `endTime`, `cancellationReason` qua truy vấn PostgreSQL **chỉ đọc** sau mỗi thao tác. Không xuất email, token, khóa hoặc URL quản lý booking.
- Ảnh UI chỉ được lưu sau khi che email, UID trong URL và liên kết quản lý còn hiệu lực. Log công khai chỉ giữ thời gian, trạng thái, mã HTTP và các mã lỗi không nhạy cảm.
- Ký hiệu: **Đạt** khi có thao tác và kết quả thực tế khớp kỳ vọng; **Lỗi** khi đã chạy và khác kỳ vọng; **Chưa kiểm chứng** khi thiếu quan sát. Một kết quả đọc từ code không được đánh dấu Đạt.

## Ba kịch bản đã chạy trong phiên này

| ID | Luồng và tiền điều kiện | Đầu vào | Trạng thái trước → mong đợi sau | Kết quả thực tế | Phân loại |
| --- | --- | --- | --- | --- | --- |
| B01 | Đặt lịch: host/event type khả dụng, slot A trống | Booker giả, event type 30 phút, A 02/11 16:00–16:30 `Asia/Saigon` | Không có booking của phiên → A được tạo, thời gian UTC khớp slot, `ACCEPTED` | DB trước có 0 booking; sau có A `ACCEPTED`, 09:00–09:30 UTC | **Đạt** |
| B02 | Đổi lịch: B01 đã tạo A, slot B trống và thuộc cùng event type | UID A chỉ dùng cục bộ, B 03/11 16:00–16:30, cùng booker | A `ACCEPTED` → A `CANCELLED` với `rescheduled=true`; B `ACCEPTED`, `fromReschedule=UID A` | DB xác nhận cả hai trạng thái, cờ liên kết và B 09:00–09:30 UTC | **Đạt** |
| B03 | Hủy lịch: B02 đã tạo B và B chưa kết thúc | UID B chỉ dùng cục bộ, lý do `QA issue 04: verify cancellation` | B `ACCEPTED` → B `CANCELLED`, lý do hủy khớp | DB xác nhận B `CANCELLED` và lý do khớp | **Đạt** |

### Đường dẫn tái hiện

1. Chạy script chuẩn bị `.env` một lần: `./scripts/prepare-issue-04-env.ps1`. Nếu `.env` đã tồn tại, script dừng để tránh ghi đè. Cách dựng Compose ban đầu là `docker compose -p caldiy-issue04 up -d --build calcom`; khi registry không truy cập được, dùng image PostgreSQL 17 có sẵn và chạy web cục bộ như bên dưới.
2. Chạy `./scripts/start-issue-04-db.ps1` để khởi động PostgreSQL 17 thử nghiệm riêng ở `127.0.0.1:5450`, rồi chạy `./scripts/run-issue-04-local.ps1 prisma migrate deploy`. Script cần image `postgres:17-alpine` đã có trên máy; nếu registry truy cập được, có thể kéo image này trước. Phiên này áp dụng 595/595 migration.
3. Chạy web với `./scripts/run-issue-04-local.ps1 web dev` và xác nhận `http://localhost:3000` phản hồi; phiên này nhận HTTP 200 sau redirect đến `/auth/setup?step=1`.
4. Đặt `ISSUE04_NODE_EXECUTABLE` đến Node 20 nếu Node hệ thống không tương thích; đặt `PLAYWRIGHT_BROWSERS_PATH` đến thư mục Chromium đã cài và `PLAYWRIGHT_HEADLESS=1`. Chạy `./scripts/run-issue-04-local.ps1 playwright test apps/web/playwright/issue-04-booking-lifecycle.e2e.ts --project=@calcom/web --workers=1`.
5. Bài test tạo host và event type cá nhân 30 phút bằng fixture, mở UI đặt A, đăng nhập host để đổi A sang B và hủy B. Sau mỗi bước, nó đọc đúng các cột trạng thái/thời gian từ DB và đính kèm JSON không chứa UID/email. Fixture dọn dữ liệu giả sau khi chạy.

Với đường chạy cục bộ, [wrapper](../../scripts/run-issue-04-local.ps1) chỉ đổi host/port database trong biến môi trường của tiến trình con và không in URL chứa mật khẩu. Từ gốc repo, lần lượt chạy `./scripts/run-issue-04-local.ps1 prisma migrate deploy`, `./scripts/run-issue-04-local.ps1 web dev`, rồi `./scripts/run-issue-04-local.ps1 playwright test apps/web/playwright/issue-04-booking-lifecycle.e2e.ts --project=@calcom/web`. Database thử nghiệm phải chạy trước các lệnh đó.

### Cơ sở kỳ vọng từ mã nguồn

- Tạo booking: [`apps/web/pages/api/book/event.ts`](../../apps/web/pages/api/book/event.ts) → [`RegularBookingService.ts`](../../packages/features/bookings/lib/service/RegularBookingService.ts) → [`createBooking.ts`](../../packages/features/bookings/lib/handleNewBooking/createBooking.ts).
- Đổi lịch dùng `rescheduleUid` trong cùng đường đặt; booking mới chứa `fromReschedule`, booking cũ có cờ `rescheduled`. Xem [khảo sát luồng](booking-flow-nghia.md).
- Hủy lịch: [`apps/web/app/api/cancel/route.ts`](../../apps/web/app/api/cancel/route.ts) → [`handleCancelBooking.ts`](../../packages/features/bookings/lib/handleCancelBooking.ts).

## Lần thử dựng đầu tiên ngày 12/10/2026

Lúc 17:22 `Asia/Saigon` (10:22 UTC), `docker compose -p caldiy-issue04 up -d --build --quiet-build --quiet-pull calcom` dừng khi kéo image PostgreSQL: Docker báo `failed to perform sync ... input/output error`. Kiểm tra tiếp lúc 17:25 `Asia/Saigon` (10:25 UTC) cho thấy ổ C chỉ còn **131.072 byte**. Docker lưu dữ liệu tại `C:\Users\PC\AppData\Local\Docker\wsl\disk\docker_data.vhdx`; `docker system df` cũng báo I/O error khi đọc một blob. `docker compose -p caldiy-issue04 ps` không có container nào. Trên máy có container của dự án khác, nên không dọn hoặc reset dữ liệu Docker của họ.

| Bước | Trước | Sau quan sát được | Kết quả |
| --- | --- | --- | --- |
| Dựng ứng dụng | Không có `.env`, image Cal.diy hoặc container của project Issue 04 | `.env` cục bộ đã tạo và bị Git bỏ qua; Compose không tạo được container | **Lỗi môi trường** |
| B01 — đặt A | Chưa có host/event type/slot của phiên Issue 04 | Không gửi request đặt; không có quan sát DB/UI | **Chưa kiểm chứng** |
| B02 — đổi A → B | B01 chưa chạy | Không gửi request đổi; không có quan sát DB/UI | **Chưa kiểm chứng** |
| B03 — hủy B | B02 chưa chạy | Không gửi request hủy; không có quan sát DB/UI | **Chưa kiểm chứng** |

Tại thời điểm thất bại môi trường này chưa có ảnh hoặc log booking mới. Các lần chạy tiếp theo bên dưới là phiên riêng của Issue 04; không lấy trạng thái cuối của Issue 01 để điền vào cột kết quả thực tế.

### Lần chạy tiếp sau khi chuyển Docker sang D

Docker Desktop đã chạy lại với `CustomWslDistroDir=D:\DockerDesktopWSL`; đĩa ảo ở `D:\DockerDesktopWSL\disk\docker_data.vhdx`. Lần dựng Compose mới bắt đầu lúc 19:02 `Asia/Saigon` (12:02 UTC) nhưng Docker Hub không phản hồi khi kéo image `postgres:18`, nên chưa thể build web từ Dockerfile. Đây là lỗi tải image, không phải kết quả của luồng booking.

Máy đã có image `postgres:17-alpine`; một container database **riêng** tên `caldiy-issue04-db` nhận kết nối trên `127.0.0.1:5450`. Phiên chạy cục bộ dùng PostgreSQL 17 thay cho image PostgreSQL 18 ghim trong Compose. [Bài kiểm thử Issue 04](../../apps/web/playwright/issue-04-booking-lifecycle.e2e.ts) kiểm tra ba chuyển tiếp trong cùng một phiên và đính kèm JSON chỉ gồm trạng thái, giờ UTC/`Asia/Saigon` và cờ liên kết; không xuất UID hoặc email.

### Kết quả chạy mới sau khi khắc phục môi trường

Ngày 12/10/2026, lần chạy đầu dừng ở timeout 180 giây: UI đã gửi `/api/book/event`, server trả HTTP 200 sau 72 giây biên dịch route lạnh, nhưng test hết thời gian trước khi đối chiếu DB. Đây là lần chạy **chưa kiểm chứng**, không tính vào bảng đạt. Tăng timeout cho lần khởi động lạnh; lần chạy kế tiếp hoàn tất cả ba bước (`1 passed`, 1,5 phút). Lần chạy xác nhận lại lúc **19:52:27 `Asia/Saigon` / 12:52:27 UTC** cũng đạt (`1 passed`, 26 giây); số liệu bên dưới lấy từ lần này.

| Bước | Trước → sau quan sát từ DB | Thời gian đã đối chiếu |
| --- | --- | --- |
| B01 | 0 booking → A `ACCEPTED` | 02/11/2026 16:00–16:30 `Asia/Saigon` = 09:00–09:30 UTC |
| B02 | A `ACCEPTED` → A `CANCELLED`, `rescheduled=true`; B `ACCEPTED`, liên kết `fromReschedule` đúng A | B: 03/11/2026 16:00–16:30 `Asia/Saigon` = 09:00–09:30 UTC |
| B03 | B `ACCEPTED` → B `CANCELLED`; lý do hủy khớp đầu vào | B giữ khung 03/11/2026 16:00–16:30 `Asia/Saigon` |

[Log bằng chứng đã loại UID/email](evidence/issue-04-booking-lifecycle.json) là bản trích từ ba attachment của Playwright. Chỉ số trạng thái/thời gian được công bố; báo cáo JSON đầy đủ, trace và URL booking cục bộ không đưa vào repo. SMTP không hoạt động nên thông báo email không được xác nhận; phạm vi đạt chỉ là UI/API/DB của ba thao tác booking cơ bản. Chưa kiểm chứng lịch ngoài, gửi email và biến thể timezone khác.

Kiểm tra chất lượng: bài E2E đạt hai lần; Biome trên file test và type-check trực tiếp file test đều không có lỗi. Lệnh `yarn type-check:ci --force` toàn monorepo đã được chạy nhưng không hoàn tất: sau hai gói thành công, các tác vụ `@coss/ui` và `@calcom/embed-core` dừng với `spawn tsc ENOENT` trên Windows. Đây là lỗi gọi công cụ của môi trường kiểm thử, không phải kết quả type-check đạt cho toàn repo.

## Bằng chứng kế thừa, không tính vào bảng kết quả mới

[Issue 01](issue-01-booking-onboarding-architecture.md#7-đối-chiếu-ảnh-ui-với-dữ-liệu-chỉ-đọc) đã ghi một chuỗi A → B → hủy B ngày 06/10/2026. Ảnh đã che ở [`evidence/`](evidence/) và truy vấn DB sau chuỗi đó xác nhận A/B cuối cùng `CANCELLED`. Tài liệu Issue 01 chưa có ảnh chụp DB ngay sau đặt A hoặc ngay sau đổi A → B; vì vậy không suy ra trạng thái DB trung gian của phiên cũ.
