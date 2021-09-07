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
const CycloneDXObject = require('./CycloneDXObject');

class Dependency extends CycloneDXObject {

    constructor(ref, dependencies) {
        super();
        this._ref = ref;
        this._dependencies = dependencies;
    }

    get ref() {
        return this._ref;
    }

    set ref(value) {
        this._ref = value;
    }

    get dependencies() {
        return this._dependencies;
    }

    set dependencies(value) {
        this._dependencies = value;
    }

    addDependency(dependency) {
        if (! this._dependencies) this._dependencies = [];
        this._dependencies.push(dependency);
    }

    toJSON() {
        let dependencyArray = undefined;
        if (this._dependencies && this._dependencies.length > 0) {
            dependencyArray = [];
            for (let d of this._dependencies) {
                dependencyArray.push(d.ref);
            }
        }
        return {
            'ref': this._ref,
            'dependsOn': dependencyArray
        };
    }

    toXML() {
        let dependencyArray = undefined;
        if (this._dependencies && this._dependencies.length > 0) {
            dependencyArray = [];
            for (let d of this._dependencies) {
                dependencyArray.push({'@ref': d.ref});
            }
        }
        return {
            'dependency': {
                '@ref': this.ref,
                'dependency': dependencyArray
            }
        };
    }
}

module.exports = Dependency;
