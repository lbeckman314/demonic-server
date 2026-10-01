# Node.js image used to build the server's dependencies and to run it. Both
# stages must use the same Node.js major version and Debian release, since
# node-pty is compiled in one and loaded in the other.
ARG NODE_VERSION=24
ARG DEBIAN_RELEASE=bookworm

# ---------------------------------------------------------------------------
# The chroot that every sandbox runs in.
FROM ubuntu:24.04 AS chroot-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    debootstrap \
    && apt-get clean

# minbase: only essential packages and apt; everything else is listed below.
RUN debootstrap --variant=minbase stable /srv/chroot https://deb.debian.org/debian

# Leave out documentation and translations (but keep man pages, since `man`
# is available, and copyright files).
RUN printf '%s\n' \
        'path-exclude /usr/share/doc/*' \
        'path-include /usr/share/doc/*/copyright' \
        'path-exclude /usr/share/info/*' \
        'path-exclude /usr/share/lintian/*' \
        'path-exclude /usr/share/locale/*' \
        > /srv/chroot/etc/dpkg/dpkg.cfg.d/01-demonic-nodoc

# Programs
RUN chroot /srv/chroot /bin/bash -c "apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    cmatrix \
    coreutils \
    cowsay \
    curl \
    fortune-mod \
    fortunes \
    less \
    locales \
    lolcat \
    man-db \
    passwd \
    procps \
    vim"

# pipes.sh; git and make are only needed to install it.
RUN chroot /srv/chroot /bin/bash -c "apt-get install -y --no-install-recommends git make && \
    git clone --depth 1 https://github.com/pipeseroni/pipes.sh.git /tmp/pipes.sh && \
    make -C /tmp/pipes.sh install && \
    rm -rf /tmp/pipes.sh && \
    apt-get purge -y --auto-remove git make"

RUN chroot /srv/chroot /bin/bash -c "echo 'LC_ALL=en_US.UTF-8' >> /etc/environment && \
    echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen && \
    echo 'LANG=en_US.UTF-8' >> /etc/locale.conf && \
    locale-gen en_US.UTF-8"

# Languages
RUN chroot /srv/chroot /bin/bash -c "apt-get install -y --no-install-recommends \
    g++ \
    gcc \
    golang-go \
    libc6-dev \
    nodejs \
    python3 \
    ruby \
    rustc"

#RUN chroot /srv/chroot /bin/bash -c "curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | BOOTSTRAP_HASKELL_NONINTERACTIVE=1 sh"

#RUN chroot /srv/chroot /bin/bash -c "curl -s https://get.sdkman.io | bash && source "/root/.sdkman/bin/sdkman-init.sh && sdk install java"

RUN chroot /srv/chroot /bin/bash -c "ln -s /usr/bin/python3 /usr/bin/python"

RUN chroot /srv/chroot /bin/bash -c "apt-get clean && rm -rf /var/lib/apt/lists/* /var/cache/debconf/*-old /var/log/*.log"

# Marker checked by the server's startup self-test (see src/process.js) to
# prove sandboxed commands really run inside the chroot.
RUN touch /srv/chroot/etc/demonic-chroot

# Sandboxed processes run as one of a pool of unprivileged users, one per
# running sandbox, so that per-user limits such as RLIMIT_NPROC are not shared
# between visitors. The pool must match the one created in the final stage
# below, and its home directory must exist in the chroot (Firejail mounts a
# private tmpfs over it).
ARG SANDBOX_USERS=32
COPY docker/add-sandbox-users.sh /usr/local/sbin/
RUN /usr/local/sbin/add-sandbox-users.sh /srv/chroot ${SANDBOX_USERS}

# ---------------------------------------------------------------------------
# The server's Node.js dependencies (node-pty is compiled here, so the final
# image needs no compiler), and downloads for the chroot.
FROM node:${NODE_VERSION}-${DEBIAN_RELEASE} AS server-builder

WORKDIR /var/www/demonic-server/
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# pokeductor, a terminal Pokédex (https://github.com/Huseynteymurzade28/pokeductor,
# MIT). Pinned release binary, verified against its SHA-256. Installed into
# the chroot's /usr/local in the final stage.
ARG TARGETARCH
ARG POKEDUCTOR_VERSION=v0.6.0
RUN set -eu; \
    case "$TARGETARCH" in \
        amd64) triple=x86_64-unknown-linux-musl; \
               sha256=dc032ad7c44d459237275273421f4b7c568478c43dc18422bf3168092b60a8a6 ;; \
        arm64) triple=aarch64-unknown-linux-musl; \
               sha256=dcf6fa86a28a93481b96909aecce1a8be4ec0a2e6c94917e317903b1f8edac01 ;; \
        *) echo "pokeductor: unsupported architecture $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    name=pokeductor-$POKEDUCTOR_VERSION-$triple; \
    curl -fsSL -o /tmp/$name.tar.gz \
        https://github.com/Huseynteymurzade28/pokeductor/releases/download/$POKEDUCTOR_VERSION/$name.tar.gz; \
    echo "$sha256  /tmp/$name.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/$name.tar.gz -C /tmp; \
    install -D -m 755 /tmp/$name/pokeductor /out/local/bin/pokeductor; \
    install -D -m 644 /tmp/$name/man/pokeductor.1 /out/local/share/man/man1/pokeductor.1; \
    install -D -m 644 /tmp/$name/LICENSE /out/local/share/doc/pokeductor/LICENSE; \
    rm -rf /tmp/$name /tmp/$name.tar.gz

# ---------------------------------------------------------------------------
# The server.
FROM node:${NODE_VERSION}-${DEBIAN_RELEASE}-slim

ENV DEBIAN_FRONTEND=noninteractive

# Without this, Firejail 0.9.72 mistakes the Docker container for an existing
# sandbox and runs every command on the container's root filesystem with no
# sandboxing at all (the warning is hidden by --quiet).
ENV container=docker

RUN apt-get update && apt-get install -y --no-install-recommends \
    firejail \
    iproute2 \
    iptables \
    nftables \
    procps \
    sudo \
    tini \
    tinyproxy \
    && rm -rf /var/lib/apt/lists/*

COPY --from=chroot-builder /srv/chroot /srv/chroot
COPY --from=server-builder /out/local /srv/chroot/usr/local

# Enable --chroot, and let the (non-root) sandbox users join the network
# bridges of programs that opt in to network access (src/network.js).
RUN sed -i -e 's/# chroot no/chroot yes/g' \
        -e 's/^restricted-network yes/restricted-network no/' \
        /etc/firejail/firejail.config

# The server runs as the unprivileged demonic user, and each sandbox as one
# of the pool of sandbox users. The server may only start Firejail as a pool
# user (docker/sudoers). The chroot and the server's own files stay owned by
# root, so neither the server nor a visitor can modify them.
ARG SANDBOX_USERS=32
COPY docker/add-sandbox-users.sh /usr/local/sbin/
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin demonic && \
    /usr/local/sbin/add-sandbox-users.sh / ${SANDBOX_USERS}
COPY docker/sudoers /etc/sudoers.d/demonic
RUN chmod 440 /etc/sudoers.d/demonic && visudo -c

WORKDIR /var/www/demonic-server/

COPY --from=server-builder /var/www/demonic-server/node_modules ./node_modules
COPY package.json LICENSE.md ./
COPY src ./src

COPY docker/entrypoint.sh /usr/local/bin/demonic-entrypoint

EXPOSE 8181

# The entrypoint starts as root only to mount the chroot read-only, then
# drops to the demonic user to run the server. tini runs as PID 1 to reap
# processes orphaned when a sandbox is killed; otherwise they would stay as
# zombies, since the server would be PID 1.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/demonic-entrypoint"]
CMD ["node", "src/demonic-server.js"]
