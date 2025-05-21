#!/usr/bin/env bash
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


#
# The Azure provided machines typically have the following disk allocation:
# Total space: 85GB
# Allocated: 67 GB
# Free: 17 GB
# This script frees up 28 GB of disk space by deleting unneeded packages and 
# large directories.
# The Flink end to end tests download and generate more than 17 GB of files,
# causing unpredictable behavior and build failures.
#
echo "=============================================================================="
echo "Freeing up disk space on CI system"
echo "=============================================================================="

echo "Listing 100 largest packages"
dpkg-query -Wf '${Installed-Size}\t${Package}\n' | sort -nr | head -n 100
df -h
echo "Removing large packages"
sudo apt-get remove --purge -y '^azure-.*'
sudo apt-get remove --purge -y '^dotnet-.*'
sudo apt-get remove --purge -y '^google-cloud-.*'
sudo apt-get remove --purge -y '^libllvm.*'
sudo apt-get remove --purge -y '^linux-.*-headers-.*'
sudo apt-get remove --purge -y '^llvm-.*'
sudo apt-get remove --purge -y '^microsoft-.*'
sudo apt-get remove --purge -y '^mongodb-.*'
sudo apt-get remove --purge -y '^mysql-.*'
sudo apt-get remove --purge -y '^openjdk.*' 'temurin-.*'
sudo apt-get remove --purge -y '^php.*'
sudo apt-get remove --purge -y '^postgresql.*'
sudo apt-get remove --purge -y firefox
sudo apt-get remove --purge -y google-chrome-stable
sudo apt-get remove --purge -y hhvm
sudo apt-get remove --purge -y libgl1-mesa-dri
sudo apt-get remove --purge -y mono-devel
sudo apt-get remove --purge -y powershell
sudo apt-get remove --purge -y snapd
sudo apt-get autoremove -y
sudo apt-get clean
dpkg-query -Wf '${Installed-Size}\t${Package}\n' | sort -nr | head -n 100
df -h
echo "Removing large directories"

sudo rm -rf /usr/share/dotnet/
sudo rm -rf /usr/local/graalvm/
sudo rm -rf /usr/local/.ghcup/
sudo rm -rf /usr/local/share/powershell
sudo rm -rf /usr/local/share/chromium
df -h
