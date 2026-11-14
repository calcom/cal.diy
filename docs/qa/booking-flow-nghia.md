# Tài liệu khảo sát: Luồng đặt, đổi và hủy booking (Model-Based)

**Người phụ trách:** Nguyễn Hoàng Hiếu Nghĩa (@2212426-create)
**Nhánh khảo sát:** `qa/model-based-booking`
**SHA dùng để đối chiếu mã nguồn:** [`a43ab82`](https://github.com/BoyTay/cal.diy/tree/a43ab82)
**Tài liệu bằng chứng:** [Issue 01 – Booking onboarding architecture](https://github.com/BoyTay/cal.diy/blob/qa/model-based-booking/docs/qa/issue-01-booking-onboarding-architecture.md)

> `[Đọc từ code]` nghĩa là điều kiện/kết quả được xác định bằng cách đọc mã nguồn tại SHA `a43ab82`. `[Đã chạy thử]` chỉ dùng cho kết quả Issue 01 ghi nhận từ lần chạy thực tế; nguồn được nêu ngay cạnh kết quả.

## 1. Sơ đồ luồng

```mermaid
graph TD
    Start([Khách gửi form]) --> RouteCreate[POST /api/book/event<br/>apps/web/pages/api/book/event.ts]
    RouteCreate --> Service[RegularBookingService.createBooking]
    Service --> Validation{"Kiểm tra event, người dùng,<br/>giới hạn và khả dụng"}
    Validation -->|Lỗi| CreateError[Từ chối booking]
    Validation -->|Hợp lệ| Create[handleNewBooking/createBooking.ts]
    Create --> NewBooking[(Booking mới)]
    NewBooking --> CreatedState["Trạng thái ban đầu phụ thuộc cấu hình<br/>[Đọc từ code; chưa kiểm chứng bằng Issue 01]"]

    CreatedState --> RescheduleRequest[Request có rescheduleUid]
    RescheduleRequest --> RescheduleValidation["RegularBookingService<br/>kiểm tra reschedule và khả dụng"]
    RescheduleValidation -->|Lỗi| RescheduleError[Từ chối đổi lịch]
    RescheduleValidation -->|Hợp lệ| DB_Reschedule[(Cập nhật booking cũ và tạo booking mới)]
    DB_Reschedule --> RescheduleState["Booking cũ: status = CANCELLED,<br/>rescheduled = true; booking mới: fromReschedule = uid cũ<br/>[Đã chạy thử theo tài liệu Issue 01]"]

    RescheduleState --> CancelRequest[Request hủy booking B]
    CancelRequest --> CancelRoute[apps/web/app/api/cancel/route.ts]
    CancelRoute --> CancelHandler[handleCancelBooking.ts]
    CancelHandler -->|Lỗi| CancelError[Từ chối hủy]
    CancelHandler -->|Hợp lệ| DB_Cancel[(Booking status = CANCELLED, lưu cancellationReason)]
    DB_Cancel --> CancelState["Hủy booking B: CANCELLED,<br/>có cancellationReason<br/>[Đã chạy thử theo tài liệu Issue 01]"]
```

Booking status là enum trong [`packages/prisma/schema.prisma`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/prisma/schema.prisma): `CANCELLED`, `ACCEPTED`, `REJECTED`, `PENDING`, `AWAITING_HOST`. Khi đổi lịch, booking cũ có `status = CANCELLED` và `rescheduled = true`; booking mới lưu UID booking cũ trong `fromReschedule`.

### Models liên quan

Các model dưới đây được khai báo trong [`packages/prisma/schema.prisma`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/prisma/schema.prisma).

| Luồng | Model | Dữ liệu liên quan |
|---|---|---|
| Đặt | `Booking` | `uid`, thời gian, `status`, `eventTypeId`, `userId`; booking có nhiều `Attendee`. |
| Đặt | `Attendee`, `EventType`, `User` | Attendee gắn với booking; EventType chứa cấu hình lịch/giới hạn; User là organizer/owner hoặc host. |
| Đổi | `Booking`, `EventType`, `User` | Booking cũ và mới; `rescheduled`, `fromReschedule`; EventType cung cấp `minimumRescheduleNotice`; User được dùng để xác định organizer. |
| Hủy | `Booking`, `EventType`, `User`, `BookingSeat` | Booking lưu `status`, `cancellationReason`, `cancelledBy`; EventType cấu hình `disableCancelling` và `requiresCancellationReason`; User được kiểm tra vai trò host/owner; BookingSeat liên quan booking có chỗ ngồi. |

## 2. Đường dẫn và hành vi theo luồng

Các link mã nguồn dưới đây đều trỏ tới SHA `a43ab82`.

### 2.1. Đặt lịch

**Luồng chính:** [`apps/web/pages/api/book/event.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/apps/web/pages/api/book/event.ts) → [`RegularBookingService.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/service/RegularBookingService.ts) → [`createBooking.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/createBooking.ts).

| Hàm/file | Điều kiện kích hoạt | Kết quả trong code |
|---|---|---|
| `checkBookingAndDurationLimits` → `checkBookingLimits` trong [`checkBookingLimits.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/checkBookingLimits.ts) | Booking đã chạm/vượt số booking tối đa trong khoảng giới hạn cấu hình. | HTTP `401`, thông báo `booking_limit_reached`; `_checkBookingLimit` tạo lỗi `403` nhưng `_checkBookingLimits` bắt và bọc lại thành `401`. **[Đọc từ code]** |
| `checkBookingAndDurationLimits` → `checkDurationLimits` trong [`checkDurationLimits.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/checkDurationLimits.ts) | Tổng thời lượng booking đã chạm/vượt giới hạn trong khoảng cấu hình. | HTTP `401`, thông báo `duration_limit_reached`; `checkDurationLimit` tạo lỗi `403` nhưng `checkDurationLimits` bắt và bọc lại thành `401`. **[Đọc từ code]** |
| `RegularBookingService.createBooking` → `ensureAvailableUsers` trong [`ensureAvailableUsers.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts) | Không có user khả dụng trong thời gian được yêu cầu (ví dụ ngoài giờ khả dụng hoặc xung đột busy time). | Ném `ErrorCode.NoAvailableUsersFound`; không gán HTTP status tại hàm này. **[Đọc từ code]** |
| `checkIfBookerEmailIsBlocked` trong [`checkIfBookerEmailIsBlocked.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/checkIfBookerEmailIsBlocked.ts) | Email sau chuẩn hóa nằm trong `BLACKLISTED_GUEST_EMAILS` (hoặc user yêu cầu xác minh email khi không phải reschedule), và không có user đã xác minh tương ứng. | Ném `ErrorCode.BookerEmailBlocked`; hàm không gán HTTP status. **[Đọc từ code]** |
| `checkIfBookerEmailIsBlocked` trong [`checkIfBookerEmailIsBlocked.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/checkIfBookerEmailIsBlocked.ts) | User đã xác minh email tồn tại nhưng requester không đăng nhập đúng user đó. | Không có verification code thì ném `BookerEmailRequiresLogin`; code sai thì ném `InvalidVerificationCode`; lỗi khi xác minh thì ném `UnableToValidateVerificationCode`; code hợp lệ thì hàm cho tiếp tục. Không gán HTTP status tại hàm. **[Đọc từ code]** |
| `checkIfBookerEmailIsBlocked` trong [`checkIfBookerEmailIsBlocked.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/checkIfBookerEmailIsBlocked.ts) | Requester đã đăng nhập đúng user có email đã xác minh. | Không chặn booking; hàm không ném lỗi. **[Đọc từ code]** |
| `RegularBookingService` khi ghi booking, [`RegularBookingService.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/service/RegularBookingService.ts) | Prisma báo lỗi unique constraint `P2002`. | HTTP `409`, mã `BookingConflict`. **[Đọc từ code]** |
| `createBooking` trong [`createBooking.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/createBooking.ts) | Tất cả kiểm tra cho phép tạo booking. | Tạo bản ghi booking; trạng thái ban đầu phụ thuộc cấu hình xác nhận. Issue 01 không truy vấn DB để xác nhận trạng thái ngay sau khi đặt. **[Đọc từ code]** |
| Luồng đặt trong Issue 01 | Đặt booking A; tài liệu Issue 01 ghi nhận booking đã được tạo. | Booking A được tạo. **[Đã chạy thử]** — nguồn: tài liệu Issue 01. |

### 2.2. Đổi lịch

Request đổi lịch đi cùng luồng tạo booking, nhưng có `rescheduleUid`. [`RegularBookingService.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/service/RegularBookingService.ts) tìm booking gốc qua `getOriginalRescheduledBooking`; `createBooking.ts` tạo booking mới và đặt `fromReschedule` bằng UID booking gốc.

| Hàm/file | Điều kiện kích hoạt | Kết quả trong code |
|---|---|---|
| `validateRescheduleRestrictions` trong [`RegularBookingService.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/service/RegularBookingService.ts) | Request có `rescheduleUid`, có `minimumRescheduleNotice`, người gửi **không phải organizer**, và booking nằm trong khoảng cấm đổi sát giờ. | HTTP `403`, thông báo `Rescheduling is not allowed within the minimum notice period before the event`. Organizer được loại khỏi kiểm tra này. **[Đọc từ code]** |
| `ensureAvailableUsers` trong [`ensureAvailableUsers.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts) | Không có user khả dụng cho giờ mới. | Ném `NoAvailableUsersFound`; không gán HTTP status tại hàm này. **[Đọc từ code]** |
| `RegularBookingService` khi ghi booking, [`RegularBookingService.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/service/RegularBookingService.ts) | Ghi booking mới gặp Prisma `P2002`. | HTTP `409`, mã `BookingConflict`. **[Đọc từ code]** |
| `RegularBookingService` + `createBooking.ts` | Đổi lịch thành công. | Booking cũ có `status = CANCELLED` và `rescheduled = true`; booking mới có `fromReschedule = uid` của booking cũ. **[Đọc từ code]** |
| Luồng booking A → B trong Issue 01 | Đổi lịch booking A sang B. | B có `fromReschedule = uid A`; A có `rescheduled = true` và status `CANCELLED`. **[Đã chạy thử]** — nguồn: tài liệu Issue 01. |

### 2.3. Hủy lịch

Route: [`apps/web/app/api/cancel/route.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/apps/web/app/api/cancel/route.ts). Route gọi [`handleCancelBooking.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleCancelBooking.ts).

| Hàm/file | Điều kiện kích hoạt | Kết quả trong code |
|---|---|---|
| `handleCancelBooking` trong [`handleCancelBooking.ts`](https://github.com/BoyTay/cal.diy/blob/a43ab82/packages/features/bookings/lib/handleCancelBooking.ts) | Booking đã có `status = CANCELLED`. | HTTP `400`, thông báo chính xác: `This booking has already been cancelled.` **[Đọc từ code]** |
| `handleCancelBooking` | Booking không có `userId` hoặc user liên kết không tồn tại. | HTTP `400`, thông báo `User not found`. **[Đọc từ code]** |
| `handleCancelBooking` | Event type đặt `disableCancelling = true`. | HTTP `400`, thông báo `This event type does not allow cancellations`. **[Đọc từ code]** |
| `handleCancelBooking` | Lý do bị bỏ trống/blank, quy tắc `requiresCancellationReason` yêu cầu lý do cho caller, và không thuộc trường hợp platform/bỏ qua validation. | HTTP `400`, thông báo `Cancellation reason is required`. **[Đọc từ code]** |
| `handleCancelBooking` | `endTime` của booking đã qua. | HTTP `400`, thông báo `Cannot cancel a booking that has already ended`. **[Đọc từ code]** |
| `handleCancelBooking` | Booking có `seatsPerTimeSlot`, request không có `seatReferenceUid`, và user không phải host hoặc owner event type. | HTTP `401`, thông báo `User not a host of this event`. **[Đọc từ code]** |
| `handleCancelBooking` | Các kiểm tra hủy đều hợp lệ. | Hủy booking, cập nhật `status = CANCELLED`, lưu lý do hủy nếu có. **[Đọc từ code]** |
| Luồng hủy booking B trong Issue 01 | Hủy booking B sau khi đổi lịch. | B có status `CANCELLED` và `cancellationReason`. **[Đã chạy thử]** — nguồn: tài liệu Issue 01. |

## 3. Kết quả Issue 01 dùng làm bằng chứng chạy thử

Tài liệu [Issue 01](https://github.com/BoyTay/cal.diy/blob/qa/model-based-booking/docs/qa/issue-01-booking-onboarding-architecture.md) ghi nhận ba kết quả: đặt A; đổi A → B (B có `fromReschedule = uid A`, A có `rescheduled = true` và status `CANCELLED`); hủy B (status `CANCELLED`, có `cancellationReason`). Tài liệu đó không truy vấn database để xác nhận trạng thái ban đầu của A, vì vậy trạng thái ngay sau khi đặt được đánh dấu `[Đọc từ code]`, không phải `[Đã chạy thử]`.
