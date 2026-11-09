# Issue #6 / #18 — GraphWalker booking harness (Model v2)

Harness thực thi đường đi model Issue #16 / #17 (Model v2: 12 edge, 7 vertex) qua UI/API,
rồi đọc DB ngay sau từng edge/vertex. Oracle chỉ `select` uid, status, rescheduled,
fromReschedule, startTime, endTime, cancellationReason, rejectionReason, oneTimePassword.
UID chỉ dùng trong bộ nhớ; không xuất email/token/UID/URL quản lý.
Không dùng tài khoản thật hoặc database production.

## Môi trường

Windows, **PowerShell 7 (`pwsh`) là bắt buộc** (trên Windows PowerShell 5.1, script chuẩn bị
`scripts/prepare-issue-04-env.ps1` báo lỗi `GetBytes` nhưng vẫn ghi ra `.env` hỏng; nếu lỡ chạy
trên PS 5.1 phải xóa `.env` đó rồi chạy lại bằng `pwsh`). Node theo phiên bản repo (20.20.2),
Yarn 4.12.0, Docker Desktop, PostgreSQL 17-alpine, Chromium Playwright,
Temurin JDK **21**, GraphWalker **4.3.3**. Runner chấp nhận Java 11..21,
từ chối Java >=22. **KHÔNG dùng Java 25**.
Tải JAR từ [release chính thức](https://github.com/GraphWalker/graphwalker-project/releases/tag/4.3.3)
về `tools/graphwalker/graphwalker-cli-4.3.3.jar`, giữ cục bộ và không commit.
Đặt JDK 21 vào PATH rồi kiểm tra `java -version`.

Môi trường chuẩn bị ngày 13/10/2026: Node 20.20.2, Docker CLI 29.8.0,
PostgreSQL 17-alpine và Chromium 143. Output `java -version` thực tế:

```text
openjdk version "21.0.12.1" 2026-08-18 LTS
OpenJDK Runtime Environment Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS)
OpenJDK 64-Bit Server VM Temurin-21.0.12.1+1 (build 21.0.12.1+1-LTS, mixed mode, sharing)
```

GraphWalker check trả `No issues found with the model(s).` Lần evidence cũ
0% ghi thiếu runtime; kết quả các lần chạy mới nằm trong `docs/qa/evidence/`.

## Chạy từ thư mục gốc repo

Không thêm dependency hoặc sửa schema. Thời gian ước tính: `yarn install --immutable`
khoảng 6 phút, harness chạy khoảng 3 phút.

Chuẩn bị runtime vào `tools/issue06-env` (tải zip/archive Node 20.20.2 và bất kỳ bản build Temurin JDK 21,
không ghi cứng tên thư mục JDK 21.0.12.1+1):

```powershell
$env:ISSUE04_NODE_EXECUTABLE = (Resolve-Path tools/issue06-env/node-v20.20.2-win-x64/node.exe).Path
$env:PATH = (Split-Path -Parent $env:ISSUE04_NODE_EXECUTABLE) + ";" + $env:PATH
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) "tools/issue06-env/playwright-browsers"
$jdkBin = (Resolve-Path tools/issue06-env/jdk-21*/bin | Select-Object -First 1).Path
$env:PATH = "$jdkBin;$env:PATH"
gh release download 4.3.3 --repo GraphWalker/graphwalker-project --pattern "graphwalker-cli-4.3.3.jar" --dir tools/graphwalker
corepack yarn install --immutable
corepack yarn playwright install chromium
pwsh -File scripts/prepare-issue-04-env.ps1
docker pull postgres:17-alpine
pwsh -File scripts/start-issue-04-db.ps1
pwsh -File scripts/run-issue-04-local.ps1 prisma migrate deploy
pwsh -File scripts/run-issue-04-local.ps1 prisma generate
```

Nếu `.env` đã có, giữ nguyên và kiểm tra đó là cấu hình Issue 04 cục bộ;
prepare script chủ động từ chối ghi đè. Không commit `.env`, secret hoặc JAR.
Các thao tác tạo/dọn fixture chỉ tác động host/event/booking giả của phiên test;
oracle không ghi DB. Không reset database hoặc volume dùng chung.

Lưu ý về cổng mạng: Harness **không dùng app Compose**; harness dùng dev server
ở cổng 3000 và PostgreSQL riêng ở cổng 5450 (container `caldiy-issue04-db`).

Ở terminal riêng, khởi động web cục bộ theo Issue 04 (dùng `--port 3000`, tránh `-p` bị lỗi nhận diện cờ trên PowerShell 7.6.9):

```powershell
$env:NEXT_PUBLIC_IS_E2E = "1"
pwsh -File scripts/run-issue-04-local.ps1 workspace @calcom/web dev --port 3000
```

Lệnh GraphWalker sinh đường đi (JSON từng dòng) theo Model v2 (`docs/qa/model/booking-model.json`):

```powershell
java -version
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar check -m docs/qa/model/booking-model.json "random(edge_coverage(100))"
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar offline --seed 6006 -m docs/qa/model/booking-model.json "random(edge_coverage(100))"
```

Harness hiện tại dùng `docs/qa/model/booking-model.json` tương thích Model v2
(12 edge, 7 vertex) theo hợp đồng đã thống nhất tại PR #30 (`docs/qa/model/booking-model-v2.json`).
Model v1 lưu tại `docs/qa/model/booking-model-v1.json` để tham chiếu hồi quy.

Runner tự gọi offline với seed 6006, kiểm tra liên tục các source/target và
coverage của đường đi trước khi chạy browser. Không nhập đường đi viết tay:

```powershell
node scripts/run-issue-06-mbt.mjs --generate-only
node scripts/run-issue-06-mbt.mjs
node .yarn/releases/yarn-4.12.0.cjs biome check --write apps/web/playwright/mbt/issue-06.e2e.ts apps/web/playwright/mbt/playwright.config.ts scripts/run-issue-06-mbt.mjs
node .yarn/releases/yarn-4.12.0.cjs type-check:ci --force
```

## Các edge đặc thù trong Model v2

`e_CreatePendingBooking`: đặt booking qua form công khai của event type yêu cầu xác nhận
(`requiresConfirmation = true`). Oracle kiểm tra DB trạng thái `PENDING`, có `oneTimePassword`.

`e_ConfirmPendingBooking`: organizer đăng nhập vào `/bookings/unconfirmed`, xác nhận booking.
Oracle kiểm tra DB trạng thái chuyển thành `ACCEPTED`, `oneTimePassword` bị xóa (null).

`e_RejectPendingBooking`: organizer từ chối booking từ `/bookings/unconfirmed` kèm lý do.
Oracle kiểm tra DB trạng thái `REJECTED`, `rejectionReason` khớp lý do đã nhập.

`e_CancelPendingBooking`: organizer hoặc người đặt hủy booking khi đang `PENDING`.
Oracle kiểm tra DB trạng thái `CANCELLED` cùng `cancellationReason`.

`e_RescheduleSlotUnavailable`: chọn slot qua helper trước, rồi intercept request
reschedule ngay trước khi gửi đến server. Dùng `start/end` trong body request
để fixture `bookings.create` chặn đúng khoảng slot cho cùng host/event type,
sau đó tiếp tục request cũ. `date` trong URL có thể chỉ là ngày; `slot` mới
chứa giờ chọn. Log chỉ ghi UTC start/end và cờ so sánh URL date với request.
Yêu cầu HTTP 4xx và DB chứng minh A không thay đổi, vẫn ACCEPTED, không có
booking với `fromReschedule=A`. Blocker không được tính là B và được giữ lại
để `e_SelectAnotherSlot` chứng minh chọn slot khác không trùng blocker.
Nếu UI ngăn gửi request hoặc timeout, edge ghi **chưa kiểm chứng**, không pass.

`e_StartNewBookingAfterCancel` / `e_StartNewBookingAfterReject`: snapshot booking của phiên cũ,
tạo host/event type giả mới và mở trang booking mới. DB của phiên mới phải rỗng; snapshot
phiên cũ phải giữ nguyên. Fixture được dọn sau khi lưu evidence.

## Đọc và gửi kết quả

Mỗi lần chạy ghi file riêng `docs/qa/evidence/issue-06-<UTC>.json`: SHA gốc,
cờ dirty, thời điểm UTC/Asia/Saigon, môi trường, lỗi preflight, từng bước,
coverage và giới hạn. Đường đi sinh chỉ là kế hoạch; chỉ bước hoàn tất oracle
mới tăng coverage. Edge coverage = số edge pass / 12; vertex coverage = số
vertex pass / 7. Pass toàn harness cần cả hai đạt 100%. State coverage đạt
ít nhất 4/5 trạng thái nghiệp vụ (ACCEPTED, PENDING, REJECTED, CANCELLED).
Fail khi oracle sai; chưa kiểm chứng khi chưa hoàn tất action/DB hoặc thiếu môi trường.
Generate-only không chứng minh booking pass. Runner trả mã lỗi nếu không pass.

Tắt reporter/trace/screenshot/video và snapshot lỗi tự động
(`PLAYWRIGHT_NO_COPY_PROMPT=1`); artifact nằm trong `test-results/mbt/results`
được Git bỏ qua. Runner giữ output browser trong bộ nhớ và
không xuất nó. Lỗi browser được thay bằng lý do an toàn; lỗi công cụ preflight
không chứa booking data được giữ nguyên văn. Không đính kèm output server thô.

Ngay sau mỗi lần chạy, gửi file evidence cùng coverage cho **@anvodangiu**
(Issue #7, Phần G) và báo **@BoyTay** qua comment Issue #7 bằng
`gh issue comment 7 --repo BoyTay/cal.diy --body-file <file đã lọc>`.

Giới hạn: AWAITING_HOST, seats, recurring, payment/calendar/email/webhook nằm ngoài phạm vi.
