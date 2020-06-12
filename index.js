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
 * Copyright (c) Steve Springett. All Rights Reserved.
 */
const readInstalled = require('read-installed');
const Bom = require('./model/Bom');


exports.createbom = (includeSerialNumber, includeLicenseText, path, options, callback) => readInstalled(path, options, (err, pkgInfo) => {
    let bom = new Bom(pkgInfo, includeSerialNumber, includeLicenseText);
    callback(null, bom);
});

exports.mergebom = function mergebom(doc, additionalDoc) {
    let additionalDocComponents = additionalDoc.getElementsByTagName("component");
    // appendChild actually removes the element from additionalDocComponents
    // which is why we use a while loop instead of a for loop
    while (additionalDocComponents.length > 0) {
        doc.getElementsByTagName("components")[0].appendChild(
          additionalDocComponents[0]
        );
    }
    return true;
};
