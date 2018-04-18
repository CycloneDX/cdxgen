const readInstalled = require("read-installed");
const spdxLicenses = require("./spdx-licenses.json");


function getLicenses(pkg) {
	var license = pkg.license && (pkg.license.type || pkg.license); 
	if (license) {
		if (!Array.isArray(license)) {
			license = [license];
		}
		return license.map(l => {
			if (spdxLicenses.includes(license)) {
				return { id : l };
			} else {
				return { name : l };
			}
		}).map(l => ({license: l}));
	}
	return [ { license: {} }];
}


function listComponents(pkg) {
	var list = {};
	addComponent(pkg, list);
	return Object.keys(list).map(k => ({ component: list[k] }));
}
function addComponent(pkg, list) {
	let component = { 
		"@type" : "library",
		name    : pkg.name,
		version : pkg.version,
		hashes  : [],
		licenses: getLicenses(pkg),
		purl    : `pkg:npm/${pkg.name}@${pkg.version}`,
		modified: false
	};
	if (pkg._shasum) {
			component.hashes.push({ hash: { "@alg":"SHA-1", value: pkg._shasum} });
	}
	if (list[component.purl]) return;
	list[component.purl] = component;
	if (pkg.dependencies) {
		Object.keys(pkg.dependencies).map(x => addComponent(pkg.dependencies[x], list));
	}
}


function createChild(name, value, depth) {
	if (name == "value") return value;
	if (Array.isArray(value)) return `<${name}>${value.map(v => js2Xml(v, depth + 1)).join('')}</${name}>`;
	if (['boolean', 'string', 'number'].includes(typeof value)) return `<${name}>${value}</${name}>`;
	//console.log(name, value);
	throw new Error("Unexpected child: " + name + " " + (typeof value) );
}


function js2Xml(obj, depth) {
	return Object.keys(obj).map(key => {
		let attrs = Object.keys(obj[key])
			.filter(x => x.indexOf('@') == 0)
			.map(x => ` ${x.slice(1)}="${obj[key][x]}"`)
			.join('') || '';
		let children = Object.keys(obj[key])
			.filter(x => x.indexOf('@') == -1)
			.map(x => createChild(x, obj[key][x], depth + 1))
			.join('');		
		return `<${key}${attrs}>${children}</${key}>`
	}).join("\n");
}



exports.createbom = (path, callback) => readInstalled(path, (err, pkgInfo) => {
	let result = { bom: { 
		"@xmlns"  :"http://cyclonedx.org/schema/bom/1.0",
		"@version": 1,
		components: listComponents(pkgInfo)
	}};
	callback(null, `<?xml version="1.0"?>\n${js2Xml(result,0)}`);
});


