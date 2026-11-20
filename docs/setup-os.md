# OS-Specific Setup Guide

This guide provides platform-specific instructions and troubleshooting tips for setting up a local development environment for **Cal.diy** on **Windows**, **macOS**, and **Linux**.

For the general quickstart guide, see the [main README](../README.md#development).

---

## 📋 Cross-Platform Requirements

Before starting, ensure you have the following installed on your machine:

| Component | Minimum Version | Recommended Tool / Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.x` | Use [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows) |
| **Yarn** | `v4.x` (Berry) | Managed via Corepack (`corepack enable`) |
| **Docker** | Docker 20+ & Docker Compose v2 | [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Colima |
| **PostgreSQL** | `>= 13.x` | Provided out of the box via Docker Compose (host port `5450`) |
| **Git** | `2.x` | With symlink support enabled |

---

## 🪟 Windows Setup (PowerShell / Git Bash)

Developing on Windows requires attention to filesystem permissions (symlinks), path lengths, and environment variable handling.

### 1. Prerequisites
- **Enable Windows Developer Mode** or run your terminal as **Administrator** to allow Git to create filesystem symlinks:
  - Go to **Windows Settings** > **System** > **For developers** > toggle **Developer Mode** to **ON**.
- Install **Docker Desktop for Windows** (with WSL 2 backend enabled).
- Install **Node.js (LTS)** and **Git for Windows**.

> [!IMPORTANT]
> **Directory Location:** Avoid cloning into folders synced by cloud storage providers (such as **OneDrive**, **Dropbox**, or **Google Drive**) or directories with deep nesting. This prevents file-locking conflicts and Windows `MAX_PATH` length limitations. We recommend cloning to a short path such as `C:\projects\cal.diy` or `C:\Users\<YourUser>\projects\cal.diy`.

### 2. Clone the Repository
Clone with symbolic links explicitly enabled:

```powershell
# PowerShell (or Git Bash)
git clone -c core.symlinks=true https://github.com/calcom/cal.diy.git
cd cal.diy
```

### 3. Install Dependencies
Enable Corepack and run Yarn:

```powershell
corepack enable
yarn install
```

### 4. Configure Environment Variables & Secrets
Cal.diy requires root `.env` configuration and a matching `.env` in `packages/prisma`.

1. Duplicate `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Generate encryption keys:
   - For `NEXTAUTH_SECRET` (32 bytes base64):
     ```powershell
     # In PowerShell (Cryptographically Secure .NET RandomNumberGenerator):
     $bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)
     ```
     *(Or in Git Bash: `openssl rand -base64 32`)*

   - For `CALENDSO_ENCRYPTION_KEY` (24 bytes base64):
     ```powershell
     # In PowerShell (Cryptographically Secure .NET RandomNumberGenerator):
     $bytes = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)
     ```
     *(Or in Git Bash: `openssl rand -base64 24`)*

   Open `.env` in your editor and paste the generated keys into `NEXTAUTH_SECRET` and `CALENDSO_ENCRYPTION_KEY`.

3. Copy `.env` to `packages/prisma/.env`:
   > On Windows, replacing the `packages/prisma/.env` symlink with a physical copy avoids Prisma parser errors (`unexpected character / in variable name`):
   ```powershell
   # In PowerShell:
   Copy-Item .env packages/prisma/.env -Force

   # In Git Bash:
   cp .env packages/prisma/.env
   ```

### 5. Start PostgreSQL (Docker)
Start the bundled PostgreSQL container:

```powershell
docker compose -f packages/prisma/docker-compose.yml up -d
```
> [!NOTE]
> The database container binds to host port **`5450`** (mapped internally to `5432`) to avoid conflicts with any locally installed PostgreSQL instance on Windows. The default `.env.example` is preconfigured to connect to this container at `postgresql://postgres:@localhost:5450/calendso`.

### 6. Run Database Migrations & Seed Data
Initialize the database schema and insert default test accounts:

```powershell
yarn workspace @calcom/prisma db-deploy
yarn workspace @calcom/prisma db-seed
```

### 7. Start the Development Server
```powershell
yarn dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### 🪟 Windows Troubleshooting

<details>
<summary><strong>Issue: Symlink error (<code>EPERM: operation not permitted, symlink</code>) during <code>yarn install</code></strong></summary>

- **Solution:** Make sure Windows **Developer Mode** is turned ON in Windows Settings, or run your terminal (PowerShell / Command Prompt) as **Administrator**.
- If previously cloned without symlink support, re-clone using `git clone -c core.symlinks=true <repo-url>`.
</details>

<details>
<summary><strong>Issue: Prisma error: <code>unexpected character / in variable name</code></strong></summary>

- **Solution:** Windows may fail to dereference the symlink at `packages/prisma/.env`. Replace it with an actual file:
  ```powershell
  Copy-Item -Path .env -Destination packages/prisma/.env -Force
  ```
</details>

<details>
<summary><strong>Issue: Port 5450 or 5432 already in use</strong></summary>

- **Solution:** Check if another service is listening on port 5450:
  ```powershell
  Get-NetTCPConnection -LocalPort 5450
  ```
  If another Docker container or Postgres instance is running, stop it or update the port mapping in `packages/prisma/docker-compose.yml` and `DATABASE_URL` in `.env`.
</details>

<details>
<summary><strong>Issue: Out of memory during Next.js compilation / Turbopack</strong></summary>

- **Solution:** Increase Node.js memory allocation before starting the dev server:
  ```powershell
  # PowerShell
  $env:NODE_OPTIONS="--max-old-space-size=8192"
  yarn dev
  ```

  ```bash
  # Git Bash
  export NODE_OPTIONS="--max-old-space-size=8192"
  yarn dev
  ```

  ```cmd
  REM Command Prompt (CMD)
  set NODE_OPTIONS=--max-old-space-size=8192
  yarn dev
  ```
</details>

---

### 🐧 Alternative: Windows Subsystem for Linux (WSL 2) Setup

Developers preferring a POSIX/Linux development environment on Windows can use WSL 2.

#### 1. Prerequisites
- Install WSL 2 and Ubuntu (run in PowerShell as Administrator):
  ```powershell
  wsl --install
  ```
- Enable WSL 2 integration in **Docker Desktop**:
  - Open **Docker Desktop Settings** > **Resources** > **WSL integration**.
  - Check **Enable integration with my default WSL distro** and toggle on your installed Ubuntu distribution.

#### 2. Clone into the Linux Filesystem
> [!IMPORTANT]
> Always clone the repository into the **WSL native Linux filesystem** (e.g. `~/projects/cal.diy` or `/home/<username>/projects/cal.diy`), **NOT** under the Windows mount `/mnt/c/`. Accessing `/mnt/c/` across the WSL 9P filesystem bridge causes significant disk I/O performance degradation, symlink resolution issues, and file watcher errors with Turbopack.

Inside your WSL terminal:
```bash
mkdir -p ~/projects && cd ~/projects
git clone -c core.symlinks=true https://github.com/calcom/cal.diy.git
cd cal.diy
```

#### 3. Install Node.js & Yarn
```bash
# Install nvm and Node 20
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

corepack enable
yarn install
```

#### 4. Configure Environment & Database
```bash
cp .env.example .env
cp .env packages/prisma/.env

# Generate encryption keys
openssl rand -base64 32
openssl rand -base64 24
# Paste the generated keys into NEXTAUTH_SECRET and CALENDSO_ENCRYPTION_KEY in .env

docker compose -f packages/prisma/docker-compose.yml up -d
yarn workspace @calcom/prisma db-deploy
yarn workspace @calcom/prisma db-seed
yarn dev
```

---

## 🍎 macOS Setup

### 1. Prerequisites
- Install **Homebrew** if not already installed:
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- Install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```
- Install Node.js (via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm)):
  - **Using nvm:**
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # Restart your terminal or source your ~/.zshrc, then:
    nvm install 20
    nvm use 20
    ```
  - **Using fnm (Fast Node Manager):**
    ```bash
    brew install fnm
    eval "$(fnm env --use-on-cd)"
    fnm install 20
    fnm use 20
    ```
- Install **Docker Desktop for Mac** (Apple Silicon or Intel) or [Colima](https://github.com/abiosoft/colima).

### 2. Clone and Setup
```bash
git clone https://github.com/calcom/cal.diy.git
cd cal.diy

corepack enable
yarn install
```

### 3. Environment Variables
```bash
cp .env.example .env

# Generate encryption keys
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export CALENDSO_ENCRYPTION_KEY=$(openssl rand -base64 24)
```
Add the generated values into your `.env` file. Ensure `packages/prisma/.env` points to or copies `.env`:
```bash
cp .env packages/prisma/.env
```

### 4. Database & App Launch
```bash
docker compose -f packages/prisma/docker-compose.yml up -d
yarn workspace @calcom/prisma db-deploy
yarn workspace @calcom/prisma db-seed
yarn dev
```

---

### 🍎 macOS Troubleshooting

<details>
<summary><strong>Issue: Docker / Colima architecture mismatch on Apple Silicon (M1/M2/M3)</strong></summary>

- **Solution:** Docker Desktop for Mac supports multi-platform images automatically via Rosetta 2. If running Colima or encountering architecture warnings, set the platform variable:
  ```bash
  export DOCKER_DEFAULT_PLATFORM=linux/amd64
  ```
</details>

---

## 🐧 Linux Setup (Ubuntu / Debian / Fedora / Arch)

### 1. Prerequisites
Install base build essentials, Git, and Docker:

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y build-essential git curl libssl-dev pkg-config
```

**Fedora:**
```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install -y git curl openssl-devel
```

**Arch Linux:**
```bash
sudo pacman -S base-devel git curl openssl
```

### 2. Docker Post-Install Configuration
Ensure your user can run Docker commands without `sudo`:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Clone and Setup
```bash
git clone https://github.com/calcom/cal.diy.git
cd cal.diy

# Install and load nvm (if not already installed), then activate Node 20:
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc
nvm install 20
nvm use 20

corepack enable
yarn install
```

### 4. Environment Variables
```bash
cp .env.example .env
cp .env packages/prisma/.env

# Generate keys using OpenSSL
openssl rand -base64 32
openssl rand -base64 24
```
Paste the keys into `NEXTAUTH_SECRET` and `CALENDSO_ENCRYPTION_KEY` in `.env`.

### 5. Database & Development Server
```bash
docker compose -f packages/prisma/docker-compose.yml up -d
yarn workspace @calcom/prisma db-deploy
yarn workspace @calcom/prisma db-seed
yarn dev
```

---

### 🐧 Linux Troubleshooting

<details>
<summary><strong>Issue: <code>ENOSPC: System limit for number of file watchers reached</code></strong></summary>

- **Solution:** Monorepos with Next.js/Turbopack watch many files. Increase the `inotify` watcher limit:
  ```bash
  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  ```
</details>

<details>
<summary><strong>Issue: Docker daemon permission denied</strong></summary>

- **Solution:** Verify that the docker service is active and your user belongs to the `docker` group:
  ```bash
  sudo systemctl start docker
  sudo usermod -aG docker $USER
  ```
  Log out and log back in for changes to take effect.
</details>

---

## 💡 Default Test Logins

Once seeded with `yarn workspace @calcom/prisma db-seed`, you can sign in at [http://localhost:3000](http://localhost:3000) using:

| Email | Password | Role |
| :--- | :--- | :--- |
| `free@example.com` | `free` | Free user |
| `pro@example.com` | `pro` | Pro user |
| `admin@example.com` | `ADMINadmin2022!` | Admin user |
| `trial@example.com` | `trial` | Trial user |
