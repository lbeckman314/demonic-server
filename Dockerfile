FROM ubuntu:24.04 AS chroot-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    debootstrap \
    && apt-get clean

RUN debootstrap stable /srv/chroot https://deb.debian.org/debian

# Programs
RUN chroot /srv/chroot /bin/bash -c "apt-get update && apt-get install -y \
    bash \
    cmatrix \
    cowsay \
    coreutils \
    fortune \
    fortunes \
    git \
    lolcat \
    locales\ 
    make \
    vim"

RUN chroot /srv/chroot /bin/bash -c "git clone https://github.com/pipeseroni/pipes.sh.git && \
    cd pipes.sh && \
    make install"

RUN chroot /srv/chroot /bin/bash -c "echo 'LC_ALL=en_US.UTF-8' >> /etc/environment && \
    echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen && \
    echo 'LANG=en_US.UTF-8' >> /etc/locale.conf && \
    locale-gen en_US.UTF-8"

# Languages
RUN chroot /srv/chroot /bin/bash -c "DEBIAN_FRONTEND=noninteractive apt-get install -y \
  gcc \
  g++ \
  golang-go \
  nodejs \
  npm \
  python3 \
  racket \
  ruby \
  rustc"

RUN chroot /srv/chroot /bin/bash -c "apt-get install -y curl"

#RUN chroot /srv/chroot /bin/bash -c "curl --proto '=https' --tlsv1.2 -sSf https://get-ghcup.haskell.org | BOOTSTRAP_HASKELL_NONINTERACTIVE=1 sh"

#RUN chroot /srv/chroot /bin/bash -c "curl -s https://get.sdkman.io | bash && source "/root/.sdkman/bin/sdkman-init.sh && sdk install java"

RUN chroot /srv/chroot /bin/bash -c "ln -s /usr/bin/python3 /usr/bin/python"

RUN chroot /srv/chroot /bin/bash -c "apt-get clean"

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

FROM node:lts

ENV DEBIAN_FRONTEND=noninteractive

# Without this, Firejail 0.9.72 mistakes the Docker container for an existing
# sandbox and runs every command on the container's root filesystem with no
# sandboxing at all (the warning is hidden by --quiet).
ENV container=docker

RUN apt-get update && apt-get install -y \
    firejail \
    g++ \
    iproute2 \
    make \
    nftables \
    sudo \
    tini \
    tinyproxy

COPY --from=chroot-builder /srv/chroot /srv/chroot

# pokeductor, a terminal Pokédex (https://github.com/Huseynteymurzade28/pokeductor,
# MIT). Pinned release binary, verified against its SHA-256.
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
    install -m 755 /tmp/$name/pokeductor /srv/chroot/usr/local/bin/pokeductor; \
    install -D -m 644 /tmp/$name/man/pokeductor.1 /srv/chroot/usr/local/share/man/man1/pokeductor.1; \
    install -D -m 644 /tmp/$name/LICENSE /srv/chroot/usr/local/share/doc/pokeductor/LICENSE; \
    rm -rf /tmp/$name /tmp/$name.tar.gz

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

COPY . .

RUN npm install

COPY docker/entrypoint.sh /usr/local/bin/demonic-entrypoint

EXPOSE 8181

# The entrypoint starts as root only to mount the chroot read-only, then
# drops to the demonic user to run the server. tini runs as PID 1 to reap
# processes orphaned when a sandbox is killed; otherwise they would stay as
# zombies, since the server would be PID 1.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/demonic-entrypoint"]
CMD ["node", "src/demonic-server.js"]
