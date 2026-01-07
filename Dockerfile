FROM ubuntu:latest AS chroot-builder

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
  default-jdk \
  gcc \
  g++ \
  ghc \
  golang-go \
  nodejs \
  npm \
  python3 \
  racket \
  ruby \
  rustc"

RUN chroot /srv/chroot /bin/bash -c "ln -s /usr/bin/python3 /usr/bin/python"

RUN chroot /srv/chroot /bin/bash -c "apt-get clean"

FROM node:lts

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    firejail \
    g++ \
    make

COPY --from=chroot-builder /srv/chroot /srv/chroot

RUN sed -i -e 's/# chroot no/chroot yes/g' /etc/firejail/firejail.config

WORKDIR /var/www/demonic-server/

COPY . .

RUN RUN NODE_OPTIONS=--openssl-legacy-provider npm install

EXPOSE 8181

CMD ["npm", "run", "start"]

