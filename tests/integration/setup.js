/*
 * This file is part of CycloneDX Node Module.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) OWASP Foundation. All Rights Reserved.
 */

const { spawnSync } = require('child_process')
const path = require('path')

const REQUIRES_INSTALL = [
  'with-packages',
  'with-dev-dependencies',
  'no-name'
]

process.exitCode = 0

let done
for (const DIR of REQUIRES_INSTALL) {
  console.log('>>> setup:', DIR)
  done = spawnSync(
    'npm', ['ci'], {
      cwd: path.join(__dirname, DIR),
      stdio: 'inherit',
      shell: true
    }
  )
  if (done.status !== 0) {
    ++process.exitCode
    console.error(done)
  }
}
