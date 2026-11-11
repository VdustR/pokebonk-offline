#!/usr/bin/env bash
set -euo pipefail

# Only the ephemeral Ubuntu 24.04 x64 CI runners use this installer.
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 || "$(dpkg --print-architecture)" != amd64 ]]; then
  printf '%s\n' 'Desktop CI requires Ubuntu 24.04 amd64' >&2
  exit 1
fi

# Keep acquisition scoped to this command and signed by Ubuntu's existing keyring.
# Independent HTTPS mirrors avoid coupling every suite to one DNS domain.
sources=$(mktemp --suffix=.sources)
mirrors=$(mktemp --suffix=.mirrors)
trap 'rm -f "$sources" "$mirrors"' EXIT
chmod 644 "$sources" "$mirrors"
printf '%s\tpriority:%s\n' \
  'https://mirrors.edge.kernel.org/ubuntu/' 1 \
  'https://archive.ubuntu.com/ubuntu/' 2 \
  'https://security.ubuntu.com/ubuntu/' 3 > "$mirrors"
cat > "$sources" <<SOURCES
Types: deb
URIs: mirror+file:$mirrors
Suites: noble noble-updates noble-security
Components: main universe
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
SOURCES
apt=(apt-get)
if (( EUID != 0 )); then apt=(sudo apt-get); fi
options=(-o "Dir::Etc::sourcelist=$sources" -o 'Dir::Etc::sourceparts=-'
  -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20)
"${apt[@]}" "${options[@]}" update --error-on=any
"${apt[@]}" "${options[@]}" install -y --no-install-recommends openbox x11-utils
command -v openbox
command -v xprop
