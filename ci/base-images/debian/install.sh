#! /usr/bin/env bash
set -e

git clone https://github.com/rbenv/rbenv.git --depth=1 ~/.rbenv
echo 'export PATH="/root/.rbenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(/root/.rbenv/bin/rbenv init - bash)"' >> ~/.bashrc
source ~/.bashrc
mkdir -p "$(rbenv root)/plugins"
git clone https://github.com/rbenv/ruby-build.git --depth=1 "$(rbenv root)/plugins/ruby-build"

if [ x"${ATOM_RUBY_VERSION}" != "x" ]; then
  rbenv install $ATOM_RUBY_VERSION
fi

curl -s "https://get.sdkman.io" | bash
chmod +x /root/.sdkman/bin/sdkman-init.sh
source $HOME/.sdkman/bin/sdkman-init.sh
echo -e "sdkman_auto_answer=true\nsdkman_selfupdate_feature=false\nsdkman_auto_env=true\nsdkman_curl_connect_timeout=20\nsdkman_curl_max_time=0" >> $HOME/.sdkman/etc/config
if [ x"${JAVA_VERSION}" != "x" ]; then
  sdk install java ${JAVA_VERSION}
fi
if [ x"${MAVEN_VERSION}" != "x" ]; then
  sdk install maven ${MAVEN_VERSION}
fi
sdk offline enable
mv /root/.sdkman/candidates/* /opt/
rm -rf /root/.sdkman

if [ x"${SKIP_PYTHON}" != "xyes" ]; then
  python3 --version
  python3 -m pip install --no-cache-dir --upgrade pip virtualenv --break-system-packages
  python3 -m pip install --no-cache-dir --upgrade pipenv poetry uv --target /opt/pypi
fi

if [ x"${SKIP_NODEJS}" != "xyes" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  chmod +x /root/.nvm/nvm.sh
  source /root/.nvm/nvm.sh
  nvm install ${NODE_VERSION}
  npm install --global corepack@latest
fi
