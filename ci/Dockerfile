FROM almalinux:9.4-minimal

LABEL maintainer="cyclonedx" \
      org.opencontainers.image.authors="Prabhu Subramanian <prabhu@appthreat.com>" \
      org.opencontainers.image.source="https://github.com/cyclonedx/cdxgen" \
      org.opencontainers.image.url="https://github.com/cyclonedx/cdxgen" \
      org.opencontainers.image.version="10.7.x" \
      org.opencontainers.image.vendor="cyclonedx" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="cdxgen" \
      org.opencontainers.image.description="Container image for cdxgen SBOM generator packing latest build tools." \
      org.opencontainers.docker.cmd="docker run --rm -v /tmp:/tmp -p 9090:9090 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen -r /app --server"

ARG SWIFT_SIGNING_KEY=A62AE125BBBFBB96A6E042EC925CC1CCED3D1561
ARG SWIFT_PLATFORM=ubi9
ARG SWIFT_BRANCH=swift-5.8-release
ARG SWIFT_VERSION=swift-5.8-RELEASE
ARG SWIFT_WEBROOT=https://download.swift.org
ARG JAVA_VERSION=22.0.1-tem
ARG SBT_VERSION=1.9.8
ARG MAVEN_VERSION=3.9.6
ARG GRADLE_VERSION=8.7
ARG GO_VERSION=1.22.3
ARG NODE_VERSION=22.2.0
ARG PYTHON_VERSION=3.12

ENV GOPATH=/opt/app-root/go \
    JAVA_VERSION=$JAVA_VERSION \
    SBT_VERSION=$SBT_VERSION \
    MAVEN_VERSION=$MAVEN_VERSION \
    GRADLE_VERSION=$GRADLE_VERSION \
    GRADLE_OPTS="-Dorg.gradle.daemon=false" \
    JAVA_HOME="/opt/java/${JAVA_VERSION}" \
    MAVEN_HOME="/opt/maven/${MAVEN_VERSION}" \
    GRADLE_HOME="/opt/gradle/${GRADLE_VERSION}" \
    SBT_HOME="/opt/sbt/${SBT_VERSION}" \
    PYTHON_CMD=python3 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING="utf-8" \
    COMPOSER_ALLOW_SUPERUSER=1 \
    ANDROID_HOME=/opt/android-sdk-linux \
    JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8" \
    SWIFT_SIGNING_KEY=$SWIFT_SIGNING_KEY \
    SWIFT_PLATFORM=$SWIFT_PLATFORM \
    SWIFT_BRANCH=$SWIFT_BRANCH \
    SWIFT_VERSION=$SWIFT_VERSION \
    SWIFT_WEBROOT=$SWIFT_WEBROOT \
    LC_ALL=en_US.UTF-8 \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US.UTF-8 \
    NVM_DIR="/root/.nvm" \
    TMPDIR=/tmp \
    NODE_COMPILE_CACHE="/opt/cdxgen-node-cache"
ENV PATH=${PATH}:/root/.nvm/versions/node/v${NODE_VERSION}/bin:${JAVA_HOME}/bin:${MAVEN_HOME}/bin:${GRADLE_HOME}/bin:${SBT_HOME}/bin:${GOPATH}/bin:/usr/local/go/bin:/usr/local/bin/:/root/.local/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/tools:${ANDROID_HOME}/tools/bin:${ANDROID_HOME}/platform-tools:/root/.cargo/bin:

RUN set -e; \
    ARCH_NAME="$(rpm --eval '%{_arch}')"; \
    url=; \
    case "${ARCH_NAME##*-}" in \
        'x86_64') \
            OS_ARCH_SUFFIX=''; \
            GOBIN_VERSION='amd64'; \
            ;; \
        'aarch64') \
            OS_ARCH_SUFFIX='-aarch64'; \
            GOBIN_VERSION='arm64'; \
            ;; \
        *) echo >&2 "error: unsupported architecture: '$ARCH_NAME'"; exit 1 ;; \
    esac \
    && microdnf install -y php php-curl php-zip php-bcmath php-json php-pear php-mbstring php-devel make gcc git-core \
    python${PYTHON_VERSION} python${PYTHON_VERSION}-devel python${PYTHON_VERSION}-pip ruby ruby-devel glibc-common glibc-all-langpacks \
        pcre2 which tar gzip zip unzip bzip2 sudo ncurses sqlite-devel dotnet-sdk-8.0 \
    && alternatives --install /usr/bin/python3 python /usr/bin/python${PYTHON_VERSION} 1 \
    && alternatives --install /usr/bin/python3 python3 /usr/bin/python${PYTHON_VERSION} 1 \
    && python${PYTHON_VERSION} --version \
    && python${PYTHON_VERSION} -m pip install --upgrade pip virtualenv \
    && python${PYTHON_VERSION} -m pip install --user pipenv poetry blint \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && cargo --version \
    && rustc --version \
    && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && source /root/.nvm/nvm.sh \
    && nvm install ${NODE_VERSION} \
    && node --version \
    && curl -s "https://get.sdkman.io" | bash \
    && source "$HOME/.sdkman/bin/sdkman-init.sh" \
    && echo -e "sdkman_auto_answer=true\nsdkman_selfupdate_feature=false\nsdkman_auto_env=true\nsdkman_curl_connect_timeout=20\nsdkman_curl_max_time=0" >> $HOME/.sdkman/etc/config \
    && sdk install java $JAVA_VERSION \
    && sdk install maven $MAVEN_VERSION \
    && sdk install gradle $GRADLE_VERSION \
    && sdk install sbt $SBT_VERSION \
    && sdk offline enable \
    && mv /root/.sdkman/candidates/* /opt/ \
    && rm -rf /root/.sdkman \
    && SWIFT_WEBDIR="$SWIFT_WEBROOT/$SWIFT_BRANCH/$(echo $SWIFT_PLATFORM | tr -d .)$OS_ARCH_SUFFIX" \
    && SWIFT_BIN_URL="$SWIFT_WEBDIR/$SWIFT_VERSION/$SWIFT_VERSION-$SWIFT_PLATFORM$OS_ARCH_SUFFIX.tar.gz" \
    && SWIFT_SIG_URL="$SWIFT_BIN_URL.sig" \
    && export GNUPGHOME="$(mktemp -d)" \
    && curl -fsSL "$SWIFT_BIN_URL" -o swift.tar.gz "$SWIFT_SIG_URL" -o swift.tar.gz.sig \
    && gpg --batch --quiet --keyserver keyserver.ubuntu.com --recv-keys "$SWIFT_SIGNING_KEY" \
    && gpg --batch --verify swift.tar.gz.sig swift.tar.gz \
    && tar -xzf swift.tar.gz --directory / --strip-components=1 \
    && chmod -R o+r /usr/lib/swift \
    && chmod +x /usr/bin/swift \
    && rm -rf "$GNUPGHOME" swift.tar.gz.sig swift.tar.gz \
    && swift --version \
    && microdnf install -y epel-release \
    && mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && curl -L https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o ${ANDROID_HOME}/cmdline-tools/android_tools.zip \
    && unzip ${ANDROID_HOME}/cmdline-tools/android_tools.zip -d ${ANDROID_HOME}/cmdline-tools/ \
    && rm ${ANDROID_HOME}/cmdline-tools/android_tools.zip \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager --licenses --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'platform-tools' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'platforms;android-34' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'build-tools;34.0.0' --sdk_root=/opt/android-sdk-linux \
    && curl -LO "https://dl.google.com/go/go${GO_VERSION}.linux-${GOBIN_VERSION}.tar.gz" \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-${GOBIN_VERSION}.tar.gz \
    && rm go${GO_VERSION}.linux-${GOBIN_VERSION}.tar.gz \
    && curl -LO "https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein" \
    && chmod +x lein \
    && mv lein /usr/local/bin/ \
    && /usr/local/bin/lein \
    && curl -L -O https://github.com/clojure/brew-install/releases/latest/download/linux-install.sh \
    && chmod +x linux-install.sh \
    && sudo ./linux-install.sh \
    && useradd -ms /bin/bash cyclonedx \
    && npm install --unsafe-perm -g node-gyp @microsoft/rush --omit=dev \
    && npx node-gyp install \
    && pecl channel-update pecl.php.net \
    && pecl install timezonedb \
    && echo 'extension=timezonedb.so' >> /etc/php.ini \
    && php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');" && php composer-setup.php \
    && mv composer.phar /usr/local/bin/composer \
    && gem install bundler \
    && gem --version \
    && bundler --version
COPY . /opt/cdxgen
RUN cd /opt/cdxgen && corepack enable && corepack pnpm install --prod \
    && mkdir -p /opt/cdxgen-node-cache \
    && chown -R cyclonedx:cyclonedx /opt/cdxgen /opt/cdxgen-node-cache \
    && chmod a-w -R /opt \
    && node /opt/cdxgen/bin/cdxgen.js --help \
    && rm -rf /var/cache/yum \
    && microdnf clean all

ENTRYPOINT ["node", "/opt/cdxgen/bin/cdxgen.js"]