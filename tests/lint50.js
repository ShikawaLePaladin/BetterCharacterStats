const fs = require('fs');
const luaparse = require('luaparse');
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const issues = [];
let ast;
try { ast = luaparse.parse(src, { luaVersion: '5.1', locations: true, comments: false }); }
catch (e) { console.log('PARSE ERROR', e.message); process.exit(1); }
const BAD_FN = ['match', 'gmatch', 'select', 'unpack_', 'rawlen', 'xpcall_'];
function fnUpvalues(fn) {
  // count distinct outer-local names referenced inside function
  const declared = [new Set()];
  const outerLocals = new Set();
  return null;
}
function walk(n, scopeStack, fnStack) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(x => walk(x, scopeStack, fnStack)); return; }
  const line = n.loc ? n.loc.start.line : '?';
  if (n.type === 'UnaryExpression' && n.operator === '#') issues.push(`line ${line}: '#' length operator (5.0 unsupported)`);
  if (n.type === 'BinaryExpression' && n.operator === '%') issues.push(`line ${line}: '%' operator (5.0 unsupported)`);
  if (n.type === 'VarargLiteral') issues.push(`line ${line}: '...' vararg (5.0 unsupported)`);
  if (n.type === 'MemberExpression' && n.base && n.base.type === 'Identifier' && n.base.name === 'string' && BAD_FN.includes(n.identifier.name)) issues.push(`line ${line}: string.${n.identifier.name} (not in 5.0)`);
  if (n.type === 'CallExpression' && n.base.type === 'Identifier' && ['select', 'rawlen'].includes(n.base.name)) issues.push(`line ${line}: ${n.base.name}() (not in 5.0)`);
  if (n.type === 'StringCallExpression' || n.type === 'TableCallExpression') {}
  for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k], scopeStack, fnStack);
}
walk(ast, [], []);

// upvalue count per function (locals declared in enclosing functions, referenced inside)
function analyze(fn, chain) {
  const own = new Set();
  (fn.parameters || []).forEach(p => p.name && own.add(p.name));
  const used = new Set();
  const nested = [];
  function w(n, scopes) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => w(x, scopes)); return; }
    if (n.type === 'FunctionDeclaration') { nested.push(n); if (n.identifier && n.isLocal) scopes[scopes.length - 1].add(n.identifier.name); return; }
    if (n.type === 'LocalStatement') { w(n.init, scopes); n.variables.forEach(v => scopes[scopes.length - 1].add(v.name)); return; }
    if (n.type === 'ForNumericStatement') { const s = new Set([n.variable.name]); w([n.start, n.end, n.step], scopes); w(n.body, scopes.concat([s])); return; }
    if (n.type === 'ForGenericStatement') { const s = new Set(n.variables.map(v => v.name)); w(n.iterators, scopes); w(n.body, scopes.concat([s])); return; }
    if (n.type === 'DoStatement' || n.type === 'WhileStatement' || n.type === 'RepeatStatement') { w(n.condition, scopes); w(n.body, scopes.concat([new Set()])); return; }
    if (n.type === 'IfClause' || n.type === 'ElseifClause' || n.type === 'ElseClause') { w(n.condition, scopes); w(n.body, scopes.concat([new Set()])); return; }
    if (n.type === 'Identifier') { if (!scopes.some(s => s.has(n.name))) used.add(n.name); return; }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') w(n[k], scopes);
  }
  w(fn.body, [own]);
  const ups = [...used].filter(nm => chain.some(s => s.has(nm)));
  const line = fn.loc ? fn.loc.start.line : '?';
  if (ups.length > 20) issues.push(`line ${line}: function has ${ups.length} upvalues (limit 32; warn>20): ${ups.join(',')}`);
  nested.forEach(nf => analyze(nf, chain.concat([own])));
}
// top-level locals
const top = new Set();
ast.body.forEach(s => { if (s.type === 'LocalStatement') s.variables.forEach(v => top.add(v.name)); if (s.type === 'FunctionDeclaration' && s.isLocal) top.add(s.identifier.name); });
ast.body.forEach(s => {
  const fns = [];
  (function f(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(f); return; } if (n.type === 'FunctionDeclaration') { fns.push(n); return; } for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') f(n[k]); })(s);
  fns.forEach(fn => analyze(fn, [top]));
});
console.log(issues.length ? issues.join('\n') : 'LINT OK (no 5.0-incompatible constructs, upvalues <=20)');
console.log('top-level locals:', top.size, '(limit 200)');
