# Issue #6 — GraphWalker booking harness

Harness thực thi đường đi model Issue #5 qua UI/API, rồi đọc DB ngay sau từng
edge/vertex. Oracle chỉ `select` uid, status, rescheduled, fromReschedule,
startTime, endTime, cancellationReason. UID chỉ dùng trong bộ nhớ; không xuất
email/token/UID/URL quản lý. Không dùng tài khoản thật hoặc database production.

## Môi trường

Windows, PowerShell 7, Node theo phiên bản của repo (Issue 04 dùng 20.20.2),
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

Không thêm dependency hoặc sửa schema. Cài các dependency đã có trong lockfile:

```powershell
$env:ISSUE04_NODE_EXECUTABLE = (Resolve-Path tools/issue06-env/node-v20.20.2-win-x64/node.exe).Path
$env:PATH = (Split-Path -Parent $env:ISSUE04_NODE_EXECUTABLE) + ";" + $env:PATH
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) "tools/issue06-env/playwright-browsers"
$env:PATH = (Resolve-Path 'tools/issue06-env/jdk-21.0.12.1+1/bin').Path + ";" + $env:PATH
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

Ở terminal riêng, khởi động web cục bộ theo Issue 04:

```powershell
$env:NEXT_PUBLIC_IS_E2E = "1"
pwsh -File scripts/run-issue-04-local.ps1 workspace @calcom/web dev -p 3000
```

Lệnh GraphWalker sinh đường đi (JSON từng dòng):

```powershell
java -version
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar check -m docs/qa/model/booking-model.json "random(edge_coverage(100))"
java -jar tools/graphwalker/graphwalker-cli-4.3.3.jar offline --seed 6006 -m docs/qa/model/booking-model.json "random(edge_coverage(100))"
```

Runner tự gọi offline với seed 6006, kiểm tra liên tục các source/target và
coverage của đường đi trước khi chạy browser. Không nhập đường đi viết tay:

```powershell
node scripts/run-issue-06-mbt.mjs --generate-only
node scripts/run-issue-06-mbt.mjs
node .yarn/releases/yarn-4.12.0.cjs biome check --write apps/web/playwright/mbt/issue-06.e2e.ts apps/web/playwright/mbt/playwright.config.ts scripts/run-issue-06-mbt.mjs
node .yarn/releases/yarn-4.12.0.cjs type-check:ci --force
```

## Hai edge khó

`e_RescheduleSlotUnavailable`: chọn slot qua helper trước, rồi intercept request
reschedule ngay trước khi gửi đến server. Dùng `start/end` trong body request
để fixture `bookings.create` chặn đúng khoảng slot cho cùng host/event type,
sau đó tiếp tục request cũ. `date` trong URL có thể chỉ là ngày; `slot` mới
chứa giờ chọn. Log chỉ ghi UTC start/end và cờ so sánh URL date với request.
Yêu cầu HTTP 4xx và DB chứng minh A không thay đổi, vẫn ACCEPTED, không có
booking với `fromReschedule=A`. Blocker không được tính là B và được giữ lại
để `e_SelectAnotherSlot` chứng minh chọn slot khác không trùng blocker.
Nếu UI ngăn gửi request hoặc timeout, edge ghi **chưa kiểm chứng**, không pass.

`e_StartNewBooking`: snapshot booking của phiên cũ, tạo host/event type giả
mới và mở trang booking mới. DB của phiên mới phải rỗng; snapshot phiên cũ
phải giữ nguyên, kể cả B CANCELLED. Fixture được dọn sau khi lưu evidence.

## Đọc và gửi kết quả

Mỗi lần chạy ghi file riêng `docs/qa/evidence/issue-06-<UTC>.json`: SHA gốc,
cờ dirty, thời điểm UTC/Asia/Saigon, môi trường, lỗi preflight, từng bước,
coverage và giới hạn. Đường đi sinh chỉ là kế hoạch; chỉ bước hoàn tất oracle
mới tăng coverage. Edge coverage = số edge pass / 6; vertex coverage = số
vertex pass / 5. Pass toàn harness cần cả hai đạt 100%. Fail khi oracle sai;
chưa kiểm chứng khi chưa hoàn tất action/DB hoặc thiếu môi trường.
Generate-only không chứng minh booking pass. Runner trả mã lỗi nếu không pass.

Tắt reporter/trace/screenshot/video và snapshot lỗi tự động
(`PLAYWRIGHT_NO_COPY_PROMPT=1`); artifact nằm trong `test-results/mbt/results`
được Git bỏ qua. Runner giữ output browser trong bộ nhớ và
không xuất nó. Lỗi browser được thay bằng lý do an toàn; lỗi công cụ preflight
không chứa booking data được giữ nguyên văn. Không đính kèm output server thô.

Ngay sau mỗi lần chạy, gửi file evidence cùng coverage cho **@anvodangiu**
(Issue #7, Phần G) và báo **@BoyTay** qua comment Issue #7 bằng
`gh issue comment 7 --repo BoyTay/cal.diy --body-file <file đã lọc>`.

Giới hạn: chỉ model cá nhân 6 edge/5 vertex; chưa chứng minh PENDING, REJECTED,
AWAITING_HOST, token guards, seats, recurring, payment/calendar/email/webhook.

## Kết quả thực tế ngày 13/10/2026

Lần chạy trên SHA `67f426243f8553b73e0d3059e30cb0248f8e10ab`, `dirty=false`,
đã pass 25 bước: **edge 6/6 (100%), vertex 5/5 (100%)**.
[Evidence](../../../../docs/qa/evidence/issue-06-2026-10-12T19-31-46-588Z.json)
ghi HTTP 409 khi slot bị chặn, A giữ nguyên, không có B và
`urlDateMatchesRequestStart=false`: `date` không phải giờ slot đã chọn.
Edge bắt đầu phiên mới cũng pass, giữ nguyên dữ liệu booking đã hủy.

Hai lần trước dừng ở lookup UI, chỉ đạt 1/6 edge và 2/5 vertex; các edge
chưa gửi request được ghi “chưa kiểm chứng”. Mỗi lần đã gửi log vào Issue #7.
Biome exit 0 (còn cảnh báo độ dài hàm); kiểm tra type riêng hai file TS đạt
0 diagnostics. `yarn type-check:ci --force --concurrency=2` toàn repo đã chạy
nhưng dừng với **`Error: spawn tsc ENOENT`** trên Windows, không ghi là đạt.
