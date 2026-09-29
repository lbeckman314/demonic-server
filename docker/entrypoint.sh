#!/bin/sh
# Container entrypoint. Runs as root to prepare the sandbox, then drops to
# the unprivileged demonic user to run the server.
set -eu

CHROOT=/srv/chroot
USER=demonic

# Make the shared chroot read-only. Firejail mounts its own private /tmp,
# home, /dev and /run on top for each sandbox, so programs still get
# scratch space, but nothing a visitor does can change the chroot for the
# next visitor. Requires a privileged container (Firejail needs one anyway).
if ! mountpoint -q "$CHROOT"; then
    mount --bind "$CHROOT" "$CHROOT"
fi
# Firejail keeps its own state under <chroot>/run/firejail, so give it a
# root-owned tmpfs there; sandboxes still get their own private /run.
mount -t tmpfs -o mode=755,nosuid,nodev,noexec tmpfs "$CHROOT/run"
mount -o remount,bind,ro "$CHROOT"

if touch "$CHROOT/.rw-test" 2>/dev/null; then
    rm -f "$CHROOT/.rw-test"
    echo "entrypoint: $CHROOT is still writable, refusing to start" >&2
    exit 1
fi

exec setpriv --reuid="$USER" --regid="$USER" --init-groups --inh-caps=-all \
    env HOME="$(getent passwd "$USER" | cut -d: -f6)" USER="$USER" "$@"
