FROM almalinux/9-minimal:latest

LABEL maintainer="cyclonedx" \
      org.opencontainers.image.authors="Prabhu Subramanian <prabhu@appthreat.com>" \
      org.opencontainers.image.source="https://github.com/cyclonedx/cdxgen" \
      org.opencontainers.image.url="https://github.com/cyclonedx/cdxgen" \
      org.opencontainers.image.version="7.0.0" \
      org.opencontainers.image.vendor="cyclonedx" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="cdxgen" \
      org.opencontainers.image.description="Container image for cyclonedx cdxgen SBoM generator" \
      org.opencontainers.docker.cmd="docker run --rm -v /tmp:/tmp -p 9090:9090 -v $(pwd):/app:rw --cpus=2 --memory=4g -t ghcr.io/cyclonedx/cdxgen -r /app --server"

ENV GOPATH=/opt/app-root/go \
    GO_VERSION=1.20.2 \
    SBT_VERSION=1.8.2 \
    GRADLE_VERSION=8.0.2 \
    GRADLE_HOME=/opt/gradle-8.0.2 \
    COMPOSER_ALLOW_SUPERUSER=1 \
    ANDROID_HOME=/opt/android-sdk-linux \
    PATH=${PATH}:${GRADLE_HOME}/bin:${GOPATH}/bin:/usr/local/go/bin:/usr/local/bin/:/root/.local/bin:/opt/sbt/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/tools:${ANDROID_HOME}/tools/bin:${ANDROID_HOME}/platform-tools:

COPY . /opt/cdxgen

RUN echo -e "[nodejs]\nname=nodejs\nstream=18\nprofiles=\nstate=enabled\n" > /etc/dnf/modules.d/nodejs.module \
    && microdnf install -y php php-curl php-zip php-bcmath php-json php-pear php-mbstring php-devel make gcc git-core python3 python3-pip ruby ruby-devel \
        pcre2 which tar zip unzip maven sudo java-17-openjdk-headless nodejs ncurses \
    && cd /opt/cdxgen && npm install --omit=dev \
    && curl https://download.swift.org/experimental-use-only/repo/centos/releases/7/swiftlang.repo > /etc/dnf/modules.d/swiftlang.module \
    && microdnf install -y epel-release \
    && microdnf install -y swiftlang \
    && curl -LO "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    && unzip -q gradle-${GRADLE_VERSION}-bin.zip -d /opt/ \
    && chmod +x /opt/gradle-${GRADLE_VERSION}/bin/gradle \
    && rm gradle-${GRADLE_VERSION}-bin.zip \
    && curl -LO "https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.zip" \
    && unzip -q sbt-${SBT_VERSION}.zip -d /opt/ \
    && chmod +x /opt/sbt/bin/sbt \
    && rm sbt-${SBT_VERSION}.zip \
    && mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && curl -L https://dl.google.com/android/repository/commandlinetools-linux-8092744_latest.zip -o ${ANDROID_HOME}/cmdline-tools/android_tools.zip \
    && unzip ${ANDROID_HOME}/cmdline-tools/android_tools.zip -d ${ANDROID_HOME}/cmdline-tools/ \
    && rm ${ANDROID_HOME}/cmdline-tools/android_tools.zip \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager --licenses --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'platform-tools' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'platforms;android-32' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'build-tools;32.0.0' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'extras;m2repository;com;android;support;constraint;constraint-layout-solver;1.0.2' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'extras;m2repository;com;android;support;constraint;constraint-layout;1.0.2' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'extras;google;m2repository' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'extras;android;m2repository' --sdk_root=/opt/android-sdk-linux \
    && /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'extras;google;google_play_services' --sdk_root=/opt/android-sdk-linux \
    && curl -LO "https://dl.google.com/go/go${GO_VERSION}.linux-amd64.tar.gz" \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz \
    && curl -LO "https://raw.githubusercontent.com/technomancy/leiningen/stable/bin/lein" \
    && chmod +x lein \
    && mv lein /usr/local/bin/ \
    && /usr/local/bin/lein \
    && curl -O https://download.clojure.org/install/linux-install-1.11.1.1208.sh \
    && chmod +x linux-install-1.11.1.1208.sh \
    && sudo ./linux-install-1.11.1.1208.sh \
    && useradd -ms /bin/bash cyclonedx \
    && chown -R cyclonedx:cyclonedx /opt/cdxgen \
    && npm install --unsafe-perm -g @microsoft/rush \
    && pecl channel-update pecl.php.net \
    && pecl install timezonedb \
    && echo 'extension=timezonedb.so' >> /etc/php.ini \
    && php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');" && php composer-setup.php \
    && mv composer.phar /usr/local/bin/composer \
    && pip3 install --user pipenv \
    && rm -rf /var/cache/yum \
    && microdnf clean all

ENTRYPOINT ["node", "/opt/cdxgen/bin/cdxgen"]
