#!/bin/bash
# Install or explicitly rebuild a stopped checkout; .env and data are preserved.
set -euo pipefail
umask 077
trap 'printf "\n准备失败（第 %s 行）。修复网络或错误后可重新运行此脚本。\n" "$LINENO" >&2' ERR
[[ "$(/usr/bin/uname -s)" == Darwin && "$(/usr/bin/uname -m)" == arm64 ]] || { echo '仅支持 Apple 芯片 Mac。' >&2; exit 1; }
[[ "$EUID" -ne 0 ]] || { echo '不要使用 sudo。' >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$root"
if [[ "${1:-}" != '' && "${1:-}" != '--update' ]]; then echo '仅支持 --update 参数。' >&2; exit 1; fi
if [[ -f .mac-ready && "${1:-}" != '--update' ]]; then
  echo '此设备已经安装完成；不会在运行中的应用上重装依赖。请使用 mac-booth.command。'
  exit 0
fi
if [[ "${1:-}" == '--update' ]]; then
  echo '更新前必须关闭本项目的所有运行窗口，备份 .env 和 data。'
  read -r -p '确认本项目已停止且已备份后输入 UPDATE：' update_confirmation
  [[ "$update_confirmation" == UPDATE ]] || { echo '未更新。'; exit 1; }
fi
archive='node-v24.15.0-darwin-arm64.tar.gz'
expected='372331b969779ab5d15b949884fc6eaf88d5afe87bde8ba881d6400b9100ffc4'
mkdir -p runtime/downloads
if [[ ! -f "runtime/downloads/$archive" ]]; then
  echo '从 nodejs.org 下载固定版本的 Apple 芯片运行环境…'
  /usr/bin/curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 600 \
    "https://nodejs.org/dist/v24.15.0/$archive" -o "runtime/downloads/$archive.part"
  actual="$(/usr/bin/shasum -a 256 "runtime/downloads/$archive.part" | /usr/bin/awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || { echo '下载文件校验失败，未安装。' >&2; exit 1; }
  /bin/mv "runtime/downloads/$archive.part" "runtime/downloads/$archive"
fi
actual="$(/usr/bin/shasum -a 256 "runtime/downloads/$archive" | /usr/bin/awk '{print $1}')"
[[ "$actual" == "$expected" ]] || { echo '运行环境校验失败。' >&2; exit 1; }
if [[ -f .mac-ready ]]; then /bin/mv .mac-ready .mac-ready.previous; fi
/usr/bin/tar -xzf "runtime/downloads/$archive" -C runtime --strip-components=1
export PATH="$root/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin"
node -e 'if(process.platform!=="darwin"||process.arch!=="arm64"||process.version!=="v24.15.0")process.exit(1)'
echo '安装 Mac 专用依赖，需要联网访问 npm。不会安装 Homebrew，不修改系统 Node。'
npm ci --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org
echo '在这台 Mac 上检查类型并构建页面…'
npm run build
node --input-type=module -e 'import sharp from "sharp"; import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(":memory:"); db.close(); await sharp({create:{width:8,height:8,channels:3,background:"white"}}).jpeg().toBuffer(); console.log("图片处理与本地数据库加载成功。");'
if [[ ! -f .env ]]; then /bin/cp .env.example .env; fi
/bin/chmod 600 .env
# Use bash explicitly so Git executable-bit differences do not affect launch.
printf '%s\n' 'macOS arm64 / Node 24.15.0 / dependencies ready' > .mac-ready
