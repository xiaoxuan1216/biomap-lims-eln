import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
const entries: { key: string; file: string }[] = [];
function collect(file: string, exportedName: string) {
 const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
 const imports = new Map<string, string>();
 source.forEachChild(node => { if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) for (const element of node.importClause.namedBindings.elements) imports.set(element.name.text, resolve(dirname(file), `${node.moduleSpecifier.text}.ts`)); });
 source.forEachChild(node => { if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.name.text === exportedName && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) for (const property of declaration.initializer.properties) {
   if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression) && imports.has(property.expression.text)) collect(imports.get(property.expression.text)!, property.expression.text);
   else if (ts.isPropertyAssignment(property) && (ts.isStringLiteral(property.name) || ts.isIdentifier(property.name))) entries.push({ key: property.name.text, file });
 } });
}
collect(resolve("src/i18n/en.ts"), "en");
const seen = new Map<string, string>(); const collisions: string[] = [];
for (const entry of entries) { if (seen.has(entry.key) && /taskWorkspaceEn|runExecutionEn|antibodyWorkflowEn|stepRecordsEn|sampleIdentityEn/.test(`${entry.file} ${seen.get(entry.key)}`)) collisions.push(entry.key); seen.set(entry.key, entry.file); }
console.log(JSON.stringify({ newDictionaryDuplicateKeys: collisions }, null, 2));
if (collisions.length) process.exitCode = 1;
