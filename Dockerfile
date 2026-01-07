FROM ubuntu:latest AS chroot-builder

# Set environment variables to prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update package list and install essential packages, including debootstrap if needed
RUN apt-get update && apt-get install -y \
    debootstrap \
    && apt-get clean

# Optional: Set up chroot environment if needed (depending on your use case)
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
RUN chroot /srv/chroot /bin/bash -c "apt-get install -y \
    gcc \
    g++ \
    golang-go \
    nodejs \
    npm \
    python3 \
    racket \
    ruby \
    rustc"

# RUN chroot /srv/chroot /bin/bash -c "apt-get install -y \
#     ghc \
#     default-jdk"

RUN chroot /srv/chroot /bin/bash -c "ln -s /usr/bin/python3 /usr/bin/python"

RUN chroot /srv/chroot /bin/bash -c "apt-get clean"

# Stage 2: Use Node.js runtime for the final container
FROM node:lts

# Set environment variables to prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    firejail \
    g++ \
    make

# Copy application code and chroot environment from the previous stage
COPY --from=chroot-builder /srv/chroot /srv/chroot

# Enable Chroot in Firejail
RUN sed -i -e 's/# chroot no/chroot yes/g' /etc/firejail/firejail.config

# Create a working directory
WORKDIR /var/www/demonic-server/

# Copy the application code into the container
COPY . .

# Install npm dependencies
RUN npm install

# Expose the port your server runs on
EXPOSE 8181

# Use CMD to run the server on container startup
CMD ["npm", "run", "start"]

