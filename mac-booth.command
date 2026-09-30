#!/bin/bash
set -euo pipefail
umask 077
[[ "$(/usr/bin/uname -s)" == Darwin && "$(/usr/bin/uname -m)" == arm64 ]] || { echo '请在 Apple 芯片 Mac 运行。' >&2; exit 1; }
root="$(cd "$(dirname "$0")" && pwd -P)"
cd "$root"
[[ -f .mac-ready && -x runtime/bin/node ]] || { echo '请先运行 install-mac.command；中断的安装可运行 scripts/macos/prepare.sh。'; exit 1; }
export PATH="$root/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin"
echo '咔嚓！拍照亭 · Mac 设备联调'
echo '当前仍为模拟支付；应用内自动打印和公网取图尚未接入。'
echo '1  免费联调（模拟图片，独立数据，不调用 AI API）'
echo '2  配置真实生图 API（密钥输入不回显）'
echo '3  启动真实生图（生成时消耗 API 额度，支付仍为模拟）'
echo '4  导出设备诊断（不包含密钥、照片、订单）'
echo '5  设置或重置管理员密码（已有登录将失效）'
echo '0  退出'
read -r -p '请选择 [1/2/3/4/5/0]：' choice
case "$choice" in
  5)
    node --import ./node_modules/tsx/dist/loader.mjs scripts/admin-password.ts
    ;;
  1|3)
    export NODE_ENV=production BOOTH_OPEN_BROWSER=1
    if [[ "$choice" == 1 ]]; then
      export GENERATION_MODE=demo BOOTH_FRESH_INSTANCE=1
      # Demo URLs must refer to this Mac even if production later uses a custom pickup host.
      export PICKUP_BASE_URL=''
    else
      export GENERATION_MODE=seedream BOOTH_FRESH_INSTANCE=0
    fi
    echo '运行期间请保持本窗口打开；Ctrl+C 停止。不要合盖，保持供电和联网。'
    exec /usr/bin/caffeinate -i "$root/runtime/bin/node" --import ./node_modules/tsx/dist/loader.mjs apps/server/index.ts
    ;;
  2)
    read -r -s -p 'Seedream API Key：' api_key
    printf '\n'
    read -r -p 'Seedream 模型 ID：' model_id
    printf '%s\n%s\n' "$api_key" "$model_id" | node scripts/macos/configure.mjs
    unset api_key model_id
    ;;
  4)
    mkdir -p diagnostics
    report="diagnostics/mac-check-$(date '+%Y%m%d-%H%M%S').txt"
    {
      echo 'SNAP CLUB Mac deployment diagnostics'
      date '+%Y-%m-%d %H:%M:%S %z'
      /usr/bin/sw_vers
      printf 'Architecture: '; uname -m
      printf 'Node: '; node --version
      printf 'npm: '; npm --version
      echo '--- Printer queues (OS status, not proof of physical output) ---'
      node scripts/macos/printer-diagnostics.mjs --stdout || true
      echo '--- Disk space ---'
      /bin/df -h .
      echo '--- App health (fixed port from configuration) ---'
      node scripts/macos/health.mjs || true
    } > "$report" 2>&1
    echo "已保存：$root/$report"
    /usr/bin/open -R "$root/$report"
    ;;
  0) exit 0 ;;
  *) echo '无效选项，请重新运行。'; exit 1 ;;
esac
