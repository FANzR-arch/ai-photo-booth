#!/bin/bash
# Manual desktop entry. Nothing is installed at boot or login.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd -P)"
cd "$root"
if [[ ! -f .mac-ready || ! -x runtime/bin/node || ! -f dist/web/index.html ]]; then
  echo '此设备尚未准备完成，请让安装人员完成 Mac 安装或更新。'
  read -r -p '按回车关闭…' ignored
  exit 1
fi
export PATH="$root/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export BOOTH_EASY_START=1 BOOTH_FRESH_INSTANCE=0 BOOTH_OPEN_BROWSER=1
echo '正在打开拍照亭。此窗口可最小化，保留它即可持续运行。'
echo '首次使用：设备设置 → 设置密码 → 填写 API 并保存。'
echo '停止服务请在此窗口按 Control+C；下次双击桌面图标即可。'
if /usr/bin/caffeinate -i "$root/runtime/bin/node" --import tsx apps/server/index.ts; then
  exit 0
else
  read -r -p '启动未完成，请查看上方提示。按回车关闭…' ignored
  exit 1
fi
