#!/bin/bash
# Create a manual desktop launcher without registering a login/boot service.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd -P)"
desktop="${HOME}/Desktop"
target="$desktop/启动拍照亭.command"
marker='# SNAP CLUB desktop launcher'
mkdir -p "$desktop"
if [[ -e "$target" || -L "$target" ]]; then
  if [[ -L "$target" ]] || ! /usr/bin/grep -qxF "$marker" "$target"; then
    echo '桌面存在其他同名文件，未覆盖。请先改名后再运行安装快捷方式脚本。' >&2
    exit 1
  fi
fi
temporary="$(mktemp "$desktop/.snap-launcher.XXXXXX")"
trap 'rm -f "$temporary"' EXIT
{
  printf '#!/bin/bash\n%s\n' "$marker"
  printf 'exec /bin/bash %q\n' "$root/启动拍照亭.command"
} > "$temporary"
chmod 700 "$temporary"
mv -f "$temporary" "$target"
chmod 700 "$root/启动拍照亭.command"
echo "桌面快捷方式已创建：$target"
