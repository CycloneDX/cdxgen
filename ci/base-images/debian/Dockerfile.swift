FROM debian:12

ARG SWIFT_SIGNING_KEY=52BB7E3DE28A71BE22EC05FFEF80A866B47A981F
ARG SWIFT_PLATFORM=debian12
ARG SWIFT_BRANCH=swift-6.0.3-release
ARG SWIFT_VERSION=swift-6.0.3-RELEASE
ARG SWIFT_WEBROOT=https://download.swift.org
ARG SWIFT_STATIC_SDK_CHECKSUM=67f765e0030e661a7450f7e4877cfe008db4f57f177d5a08a6e26fd661cdd0bd
ARG JAVA_VERSION=23.0.2-tem
ARG NODE_VERSION=22.14.0

ENV JAVA_VERSION=$JAVA_VERSION \
    JAVA_HOME="/opt/java/${JAVA_VERSION}" \
    SWIFT_SIGNING_KEY=$SWIFT_SIGNING_KEY \
    SWIFT_PLATFORM=$SWIFT_PLATFORM \
    SWIFT_BRANCH=$SWIFT_BRANCH \
    SWIFT_VERSION=$SWIFT_VERSION \
    SWIFT_WEBROOT=$SWIFT_WEBROOT \
    NVM_DIR="/root/.nvm"

ENV PATH=${PATH}:/root/.nvm/versions/node/v${NODE_VERSION}/bin:${JAVA_HOME}/bin:/usr/local/bin:/root/.local/bin:

COPY ci/base-images/debian/install.sh /tmp/

RUN set -e; \
    ARCH_NAME="$(dpkg --print-architecture)"; \
    url=; \
    case "${ARCH_NAME##*-}" in \
        'amd64') \
            OS_ARCH_SUFFIX=''; \
            ;; \
        'arm64') \
            OS_ARCH_SUFFIX='-aarch64'; \
            ;; \
        *) echo >&2 "error: unsupported architecture: '$ARCH_NAME'"; exit 1 ;; \
    esac; \
    export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true && apt-get -q update && \
    apt-get -q install -y \
        build-essential python3 python3-pip python3-dev locales bash bzip2 git-core zip unzip make gawk \
        curl gpg \
        binutils-gold \
        libicu-dev \
        libcurl4-openssl-dev \
        libedit-dev \
        libsqlite3-dev \
        libncurses-dev \
        libpython3-dev \
        libxml2-dev \
        pkg-config \
        uuid-dev \
        tzdata \
        git \
        gcc \
    && SWIFT_WEBDIR="$SWIFT_WEBROOT/$SWIFT_BRANCH/$(echo $SWIFT_PLATFORM | tr -d .)$OS_ARCH_SUFFIX" \
    && SWIFT_BIN_URL="$SWIFT_WEBDIR/$SWIFT_VERSION/$SWIFT_VERSION-$SWIFT_PLATFORM$OS_ARCH_SUFFIX.tar.gz" \
    && SWIFT_SIG_URL="$SWIFT_BIN_URL.sig" \
    && export DEBIAN_FRONTEND=noninteractive \
    && export GNUPGHOME="$(mktemp -d)" \
    && curl -fsSL "$SWIFT_BIN_URL" -o swift.tar.gz "$SWIFT_SIG_URL" -o swift.tar.gz.sig \
    && gpg --batch --quiet --keyserver keyserver.ubuntu.com --recv-keys "$SWIFT_SIGNING_KEY" \
    && gpg --batch --verify swift.tar.gz.sig swift.tar.gz \
    && tar -xzf swift.tar.gz --directory / --strip-components=1 \
    && chmod -R o+r /usr/lib/swift \
    && rm -rf "$GNUPGHOME" swift.tar.gz.sig swift.tar.gz \
    && rm -rf /var/lib/apt/lists/* \
    && swift --version \
    && swift sdk install ${SWIFT_WEBROOT}/${SWIFT_BRANCH}/static-sdk/${SWIFT_VERSION}/${SWIFT_VERSION}_static-linux-0.0.1.artifactbundle.tar.gz --checksum ${SWIFT_STATIC_SDK_CHECKSUM} \
    && swift sdk list \
    && chmod +x /tmp/install.sh \
    && ./tmp/install.sh && rm /tmp/install.sh \
    && node -v \
    && npm -v \
    && apt-get purge -y --auto-remove -o APT::AutoRemove::RecommendsImportant=false \
    && rm -rf /var/lib/apt/lists/*
CMD ["/bin/bash"]
