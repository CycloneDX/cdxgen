const readInstalled = require("read-installed");

function createComponent(pkg) {
	let component = { 
		"@type" : "framework",
		name    : pkg.name,
		version : pkg.version,
		hashes  : [],
		licenses: [
			{ license : { id: pkg.license && (pkg.license.type || pkg.license) || "" } }
		],
		purl    : `pkg:npm/${pkg.name}@${pkg.version}`,
		modified: false
	};
	if (pkg._shasum) {
			component.hashes.push({ hash: { "@alg":"SHA-1", value: pkg._shasum} });
	}
	if (pkg.dependencies) {
		component.components = Object.keys(pkg.dependencies).map(k => createComponent(pkg.dependencies[k]));
	}
	return { component: component };
}


function createChild(name, value, depth) {
	if (name == "value") return value;
	if (Array.isArray(value)) return `<${name}>${value.map(v => js2Xml(v, depth + 1)).join('')}</${name}>`;
	if (['boolean', 'string', 'number'].includes(typeof value)) return `<${name}>${value}</${name}>`;
	console.log(name, value);
	throw new Error("Unexpected child");
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
		components: [ createComponent(pkgInfo) ]
	}};
	callback(null, `<?xml version="1.0"?>\n${js2Xml(result,0)}`);
});


