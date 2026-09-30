#!/bin/bash
# Install from a Git checkout on Apple Silicon without touching system Node or customer data.
set -euo pipefail
umask 077
trap 'printf "\n安装未完成（第 %s 行）。请保留错误信息，不要删除旧程序或 data。\n" "$LINENO" >&2' ERR

if [[ "$(/usr/bin/uname -s)" != Darwin || "$(/usr/bin/uname -m)" != arm64 ]]; then
  echo '此安装脚本仅适用于 Apple 芯片 Mac，请在客户 M1 Mac 的终端运行。' >&2
  exit 1
fi
if [[ "$EUID" -eq 0 ]]; then
  echo '请使用日常登录账户运行，不要使用 sudo。' >&2
  exit 1
fi
root="$(cd "$(dirname "$0")" && pwd -P)"
cd "$root"
[[ -f package-lock.json && -f .env.example ]] || { echo '仓库文件不完整，请检查 Git 拉取结果。' >&2; exit 1; }
bash scripts/macos/prepare.sh
echo
echo '环境已准备好。当前仅用于有人看护的设备联调，尚不能无人值守收费。'
echo '启动菜单后选 1，可进行不调用付费 API 的联调：'
printf 'bash "%s/mac-booth.command"\n' "$root"
