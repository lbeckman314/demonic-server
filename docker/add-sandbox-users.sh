#!/bin/sh
# add-sandbox-users.sh <root> <count>
# Create the pool of sandbox users (sandbox0, sandbox1, ...) in the
# demonic-sandbox group, under the filesystem at <root>. Run once for the
# chroot and once for the server's own root so the UIDs match.
set -eu
root=$1
count=$2

chroot "$root" groupadd --gid 20000 demonic-sandbox
mkdir -p "$root/home/sandbox"
i=0
while [ "$i" -lt "$count" ]; do
    chroot "$root" useradd --uid $((20001 + i)) --gid demonic-sandbox \
        --no-create-home --home-dir /home/sandbox --shell /bin/bash "sandbox$i"
    i=$((i + 1))
done
