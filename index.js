const readInstalled = require("read-installed");
const crypto = require("crypto");



function createComponent(pkg) {
	let component = { 
		"@type" : "framework",
		name: pkg.name,
		version: pkg.version,
		hashes: [],
		licenses: [
			{license : { id: pkg.license } }
		],
		purl: `pkg:npm/${pkg.name}@${pkg.version}`,
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

function createChild(name, value) {
	if (name == "value") return value;
	if (Array.isArray(value)) return `<${name}>${value.map(js2Xml).join('')}</${name}>`;
	if (['boolean', 'string', 'number'].includes(typeof value)) return `<${name}>${value}</${name}>`;
	throw new Error("Unexpected child");
}


function js2Xml(obj, depth) {
	return Object.keys(obj).map(k => {
		let attrs = Object.keys(obj[k]).filter(x => x.indexOf('@') == 0).map(x => ` ${x.slice(1)}="${obj[k][x]}"`).join('') || '';
		let children = Object.keys(obj[k]).filter(x => x.indexOf('@') == -1).map(x => createChild(x, obj[k][x])).join('');		
		return `<${k}${attrs}>${children}</${k}>`
	}).join("\n");
}



exports.createbom = path => readInstalled(path, (err, pkgInfo) => {
	let result = { bom: { 
		"@xmlns"  :"http://cyclonedx.org/schema/bom/1.0",
		"@version": 1,
		components: [ createComponent(pkgInfo) ]
	}};
	//console.log(result);
	//js2Xml(result,0)
	console.log(`<?xml version="1.0"?>\n${js2Xml(result,0)}`);
});


