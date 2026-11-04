# Phần D - Nguyên lý MBT, phạm vi, rủi ro và tiêu chí pass/fail

Tài liệu này là Phần D của bộ tài liệu kiểm thử booking. Nội dung khớp với model v2 tại [`docs/qa/model/booking-model-v2.json`](model/booking-model-v2.json), state model tại [`issue-05-booking-state-model.md`](issue-05-booking-state-model.md) và kiến trúc kiểm thử tại [`issue-08-system-goals-architecture.md`](issue-08-system-goals-architecture.md). Harness Issue #6 hiện tại tiếp tục dùng model v1 tại [`docs/qa/model/booking-model-v1.json`](model/booking-model-v1.json); `docs/qa/model/booking-model.json` giữ cùng nội dung v1 để runner cũ không bị vỡ.

## 1. Nguyên lý kiểm thử dựa trên mô hình

### 1.1 Model là hợp đồng hành vi

Model mô tả các trạng thái và chuyển tiếp mà người dùng có thể tạo ra qua ứng dụng; model không phải bản sao của service hoặc database schema. Mỗi edge phải tương ứng với một action/điều kiện có thể thực hiện, một oracle quan sát được và một kết quả trạng thái rõ ràng.

Model v2 có 7 vertex và 12 edge:

| Nhóm | Vertex/edge | Ý nghĩa kiểm thử |
| --- | --- | --- |
| Khởi tạo | `v_NoBooking`, `e_CreateAcceptedBooking`, `e_CreatePendingBooking` | Phân biệt event type xác nhận mặc định và event type cần organizer xác nhận |
| Chờ xác nhận | `v_Pending`, `e_ConfirmPendingBooking`, `e_RejectPendingBooking`, `e_CancelPendingBooking` | Kiểm tra ba kết quả hợp lệ của booking `PENDING` |
| Booking đã đặt | `v_BookedA`, `v_BookedB`, `e_RescheduleToNewSlot` | Kiểm tra UID mới, liên kết `fromReschedule` và booking cũ bị đóng khi đổi lịch |
| Kết thúc/lỗi | `v_Rejected`, `v_Cancelled`, `v_SlotUnavailable` và các edge liên quan | Kiểm tra lý do reject/cancel và lỗi slot không làm thay đổi booking cũ |

### 1.2 Sinh đường đi không thay thế bằng chứng

GraphWalker chỉ sinh kế hoạch đường đi. Một edge chỉ được tính là pass sau khi action đã chạy qua ứng dụng và oracle sau action khớp. `offline` hoặc `generate-only` chỉ xác nhận model có thể sinh đường đi, không chứng minh UI, API hay database hoạt động.

### 1.3 Oracle ưu tiên dữ liệu nghiệp vụ

HTTP status, redirect và text trên UI là tín hiệu phụ. Oracle chính là các trường tối thiểu đọc từ database sau từng bước: `uid`, `status`, `rescheduled`, `fromReschedule`, `startTime`, `endTime`, `cancellationReason`, `rejectionReason` và `oneTimePassword`. Không ghi email, token, credential hoặc URL quản lý booking vào evidence.

### 1.4 Mỗi edge phải có trạng thái kết thúc rõ ràng

- Action thành công: trạng thái đích và các trường liên kết phải khớp.
- Action bị chặn có chủ đích: phải chứng minh lỗi đúng và trạng thái nguồn không đổi.
- Không thể chạy action hoặc thiếu oracle: ghi `NOT_VERIFIED`, không tự động tính pass.

## 2. Phạm vi

### 2.1 Trong phạm vi

- Một booking cá nhân, không recurring, không seat, không payment.
- Event type xác nhận mặc định và event type yêu cầu organizer xác nhận.
- `PENDING -> ACCEPTED`, `PENDING -> REJECTED`, `PENDING -> CANCELLED`.
- Booking `ACCEPTED` đổi lịch tới slot mới hoặc bị từ chối vì slot mới không khả dụng.
- Hủy booking và kiểm tra lý do hủy.
- Kiểm tra state coverage tối thiểu 4/5 trạng thái nghiệp vụ: `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`.
- Chạy action qua web application/Playwright và đọc oracle DB trong môi trường local giả lập.

### 2.2 Ngoài phạm vi

`AWAITING_HOST` được ghi nhận trong enum nhưng không thuộc model chạy của Issue #17 vì chưa có fixture host/team và action tương ứng. Cũng không claim coverage cho team/round-robin, seats, recurring, payment, calendar ngoài, email delivery, webhook delivery, retry/resubmit token hoặc booking đã bắt đầu.

Không dùng dữ liệu production, tài khoản thật, credential thật hoặc URL quản lý booking.

## 3. Ma trận chuỗi tối thiểu

| Chuỗi | Đường đi model | Action qua ứng dụng | Oracle bắt buộc |
| --- | --- | --- | --- |
| S01 | `NoBooking -> BookedA -> BookedB -> Cancelled` | Đặt booking mặc định, reschedule, cancel | A `CANCELLED` + `rescheduled=true`; B UID khác A, `fromReschedule=A.uid`; B `CANCELLED` sau cancel |
| S02 | `NoBooking -> Pending -> BookedA` | Đặt event cần xác nhận, organizer confirm | Booking giữ UID; `status=ACCEPTED`; token bị xóa |
| S03 | `NoBooking -> Pending -> Rejected` | Đặt event cần xác nhận, organizer reject | Booking giữ UID; `status=REJECTED`; lý do reject khớp; token bị xóa |
| S04 | `NoBooking -> Pending -> Cancelled` | Đặt event cần xác nhận, hủy trước confirm | Booking giữ UID; `status=CANCELLED`; lý do hủy khớp |
| S05 | `BookedA -> SlotUnavailable -> BookedA` | Chọn slot bị chặn rồi chọn slot khác | Request đầu trả lỗi 4xx; A không đổi; không tạo B; slot khác chạy được |

Ba chuỗi S02-S04 là bắt buộc để chứng minh ba nhánh mới của model v2. S01 và S05 bảo toàn coverage reschedule của baseline. Một phiên random chỉ được coi là đạt khi coverage và oracle của các edge thực sự chạy đều đạt điều kiện bên dưới.

## 4. Rủi ro và biện pháp kiểm soát

| Rủi ro | Dấu hiệu sai | Biện pháp kiểm soát |
| --- | --- | --- |
| Đường đi sinh được nhưng action không chạy | Chỉ có output `offline` hoặc generate-only | Chỉ tăng coverage sau khi browser action và DB oracle hoàn tất |
| UI hiển thị đúng nhưng DB sai | UI báo thành công, status/UID không khớp | Đọc các trường oracle sau từng edge |
| Tạo `PENDING` bằng fixture rồi gọi đó là application flow | Không có thao tác form trong evidence | S02-S04 phải tạo booking qua form của ứng dụng |
| Slot lỗi làm thay đổi booking cũ | A bị cancel hoặc có B dù request bị từ chối | Dùng blocker theo `start/end`, kiểm tra A và `fromReschedule` sau lỗi |
| Coverage giả do vertex kỹ thuật | `v_SlotUnavailable` bị tính như BookingStatus | Tách state coverage nghiệp vụ 4/5 khỏi vertex coverage 7 vertex |
| Dữ liệu giữa các phiên làm nhiễu oracle | Booking của phiên trước xuất hiện trong phiên mới | Host/event type giả riêng cho phiên, snapshot trước và cleanup sau |
| Timezone hoặc thời gian hiện tại không ổn định | Slot/notice thay đổi giữa các lần chạy | Dùng UTC cho oracle, hiển thị `Asia/Saigon`, dùng slot có khoảng đệm |
| Lộ dữ liệu nhạy cảm | Evidence chứa email, token, credential hoặc URL quản lý | Chỉ lưu field whitelist; redact lỗi browser và không commit `.env`/JAR |
| Thiếu runtime | Không có JDK 21, Docker, dependency hoặc Chromium | Ghi `BLOCKED`/`NOT_VERIFIED`, không đánh dấu pass dựa trên static check |

## 5. Tiêu chí pass/fail

### 5.1 Model/static gate

Pass khi:

1. JSON parse được và GraphWalker `check` không báo lỗi.
2. `v_NoBooking` là start element; mọi edge trỏ tới vertex đã khai báo.
3. Có đủ 12 edge và ba edge từ `v_Pending` tới accepted/rejected/cancelled.
4. Tất cả vertex cần kiểm thử reachable; generator dùng `random(edge_coverage(100))` hoặc tương đương.

Fail nếu model không parse được, có edge mồ côi, thiếu một nhánh `PENDING`, hoặc đường đi không thể đạt vertex/edge theo thiết kế.

### 5.2 Runtime/application gate

Pass khi:

1. Web application khởi động bằng môi trường local được ghi trong evidence.
2. S02, S03 và S04 đều tạo booking từ form, không chỉ bằng Prisma fixture.
3. Mỗi edge đã chạy action tương ứng và đọc oracle ngay sau action.
4. State coverage đạt ít nhất 4/5 trạng thái nghiệp vụ; `AWAITING_HOST` được đánh dấu ngoài phạm vi.
5. Edge coverage đạt 12/12 và vertex coverage đạt 7/7 cho phiên đầy đủ.
6. Không có oracle sai, dữ liệu nhạy cảm hoặc booking của phiên khác lọt vào evidence.

Fail khi bất kỳ oracle nào sai, UID/liên kết reschedule sai, trạng thái nguồn bị thay đổi sau lỗi có chủ đích, hoặc test chỉ dừng ở UI/HTTP mà không đọc DB.

### 5.3 Phân loại kết quả

| Nhãn | Khi dùng | Cách báo cáo |
| --- | --- | --- |
| `PASS` | Action, oracle và coverage đều đạt | Ghi edge/vertex/state coverage, SHA và evidence |
| `FAIL` | Đã chạy nhưng hành vi/oracle sai | Ghi bước lỗi, expected/actual và dữ liệu đã redact |
| `NOT_VERIFIED` | Chưa hoàn tất action hoặc thiếu oracle | Không tính vào coverage pass |
| `BLOCKED` | Không thể chạy vì thiếu runtime/hạ tầng | Ghi preflight error, không gọi là test fail |

## 6. Evidence và tính tái lập

Mỗi phiên phải ghi SHA/tag, `dirty` flag, thời gian UTC và `Asia/Saigon`, toolchain, model path, seed, từng edge/vertex, coverage, giới hạn và preflight error nếu có. Evidence phải loại UID/email/token/credential/URL quản lý khỏi nội dung lưu trữ hoặc comment.

Lệnh chuẩn:

```powershell
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar check -m docs/qa/model/booking-model-v2.json "random(edge_coverage(100))"
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar offline --seed 6006 -m docs/qa/model/booking-model-v2.json "random(edge_coverage(100))"
node scripts/run-issue-06-mbt.mjs
```

`check` và `offline` không thay thế lệnh runner. Chỉ evidence từ runner sau khi application flow và DB oracle hoàn tất mới được dùng để kết luận runtime pass.

### Kết quả chạy thực tế ngày 04/11/2026

- Static gate: `booking-model-v2.json` được GraphWalker `check` kiểm tra không lỗi; `offline --seed 6006` sinh được các nhánh `PENDING -> ACCEPTED`, `PENDING -> REJECTED`, `PENDING -> CANCELLED`, reschedule và slot unavailable. Đây chỉ là model/static evidence.
- Application/API gate: PostgreSQL 17 local, 595 migrations, Prisma Client, Next.js local và Chromium đã được chuẩn bị; `booking-confirm-reject.e2e.ts` pass `2/2` với booking `PENDING` được tạo bằng Prisma fixture. Kết quả này chỉ xác nhận handler/token và DB oracle, không chứng minh S02-S04 qua form.
- UI/application flow: S02-S04 qua form và nhánh reschedule/cancel UI hiện `NOT_VERIFIED`. `issue-04-booking-lifecycle.e2e.ts` dừng ở helper `incrementMonth`; webpack cũng log `node:path`/`node:process`. Không tính các kết quả này là runtime pass.

## 7. Quyết định hoàn thành

Issue #17 hoàn thành khi tài liệu này được review cùng model v2, static gate pass, có evidence runtime hoặc ghi rõ blocker theo phân loại trên, và PR target là `qa/model-based-booking`. Không merge một kết quả chỉ có generated path, fixture DB hoặc ảnh UI mà thiếu oracle.
