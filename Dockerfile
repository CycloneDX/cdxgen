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
    GO_VERSION=1.19.5 \
    SBT_VERSION=1.8.2 \
    GRADLE_VERSION=7.2 \
    GRADLE_HOME=/opt/gradle-${GRADLE_VERSION} \
    COMPOSER_ALLOW_SUPERUSER=1 \
    PATH=${PATH}:${GRADLE_HOME}/bin:${GOPATH}/bin:/usr/local/go/bin:/usr/local/bin/:/root/.local/bin:/root/.bun/bin:

COPY . /opt/cdxgen

RUN echo -e "[nodejs]\nname=nodejs\nstream=18\nprofiles=\nstate=enabled\n" > /etc/dnf/modules.d/nodejs.module \
    && microdnf install -y php php-curl php-zip php-bcmath php-json php-pear php-mbstring php-devel make gcc git-core python3 python3-pip ruby ruby-devel \
        pcre2 which tar zip unzip maven sudo java-11-openjdk-headless nodejs ncurses \
    && curl -fsSL https://bun.sh/install | bash \
    && cd /opt/cdxgen && bun install --production \
    && curl -LO "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    && unzip -q gradle-${GRADLE_VERSION}-bin.zip -d /opt/ \
    && chmod +x /opt/gradle-${GRADLE_VERSION}/bin/gradle \
    && rm gradle-${GRADLE_VERSION}-bin.zip \
    && curl -LO "https://github.com/sbt/sbt/releases/download/v${SBT_VERSION}/sbt-${SBT_VERSION}.zip" \
    && unzip -q sbt-${SBT_VERSION}.zip -d /opt/ \
    && chmod +x /opt/sbt/bin/sbt \
    && rm sbt-${SBT_VERSION}.zip \
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
    && npm install --unsafe-perm -g @microsoft/rush \
    && pecl channel-update pecl.php.net \
    && pecl install timezonedb \
    && echo 'extension=timezonedb.so' >> /etc/php.ini \
    && php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');" && php composer-setup.php \
    && mv composer.phar /usr/local/bin/composer \
    && pip3 install --user pipenv \
    && rm -rf /var/cache/yum \
    && microdnf clean all

ENTRYPOINT ["bun", "run", "/opt/cdxgen/bin/cdxgen"]
