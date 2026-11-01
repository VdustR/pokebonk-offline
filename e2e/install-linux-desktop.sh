#!/usr/bin/env bash
set -euo pipefail

# Only the ephemeral Ubuntu 24.04 x64 CI runners use this installer.
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 || "$(dpkg --print-architecture)" != amd64 ]]; then
  printf '%s\n' 'Desktop CI requires Ubuntu 24.04 amd64' >&2
  exit 1
fi

# The runner mirror list can stall on Azure. Use signed official HTTPS sources
# for these commands only; leave runner-wide repository and trust settings intact.
sources=$(mktemp --suffix=.sources)
trap 'rm -f "$sources"' EXIT
chmod 644 "$sources"
cat > "$sources" <<'SOURCES'
Types: deb
URIs: https://archive.ubuntu.com/ubuntu
Suites: noble noble-updates
Components: main universe
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: https://security.ubuntu.com/ubuntu
Suites: noble-security
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
