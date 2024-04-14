import { createBom, parse } from "./deps.ts";

const args = parse(Deno.args);
const filePath = (args._[0] as string) || ".";

console.log("Invoking createBom with args", filePath, args);
const bomNSData = await createBom(filePath, args);
console.log(bomNSData.bomJson);
