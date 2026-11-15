import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {test} from "node:test";

const repo = path.resolve(import.meta.dirname, "..");
test("demo provenance covers every embedded pack and bootstrap, and script text is escaped", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "chronos-demo-build-"));
  try {
    const html = fs.readFileSync(path.join(repo, "chronos-2.0/chronos.html"), "utf8");
    const inputs = ["LICENSE", "tools/build-standalone.mjs", "chronos-2.0/chronos.html",
      "demo/bootstrap.js", "demo/demo.css",
      ...[...html.matchAll(/(?:href|src)="((?:styles|scripts)\/[^" ]+)"/g)].map(match => `chronos-2.0/${match[1]}`),
      ...["themes", "locales"].flatMap(folder => fs.readdirSync(path.join(repo, "chronos-2.0", folder))
        .map(name => `chronos-2.0/${folder}/${name}`))];
    for (const name of inputs) {
      const target = path.join(temporary, name);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(path.join(repo, name), target);
    }
    const run = (command, args) => {
      const result = spawnSync(command, args, {cwd: temporary, encoding: "utf8", windowsHide: true});
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const build = () => {
      run(process.execPath, ["tools/build-standalone.mjs", "--demo", "index.html"]);
      return fs.readFileSync(path.join(temporary, "index.html"), "utf8");
    };
    assert.doesNotMatch(build(), /<meta name="chronos-build"/);
    run("git", ["init", "-q"]);
    run("git", ["config", "user.name", "Chronos build test"]);
    run("git", ["config", "user.email", "build-test@example.invalid"]);
    run("git", ["config", "core.autocrlf", "false"]);
    run("git", ["config", "core.hooksPath", path.join(temporary, "no-hooks")]);
    run("git", ["add", "--", ...inputs]);
    run("git", ["-c", "commit.gpgSign=false", "commit", "-qm", "Fixture"]);
    const sha = run("git", ["rev-parse", "HEAD"]);
    const clean = build();
    assert.ok(clean.includes(`content="${sha}"`));
    assert.ok(clean.includes("globalThis.CHRONOS_DEMO = true"));
    for (const input of ["demo/bootstrap.js", "demo/demo.css", "chronos-2.0/themes/focus.css",
      "chronos-2.0/locales/russian.locale.js", "LICENSE"]) {
      const file = path.join(temporary, input), original = fs.readFileSync(file, "utf8");
      fs.appendFileSync(file, "\n/* provenance test */\n");
      assert.ok(build().includes(`content="${sha}+modified"`), input);
      fs.writeFileSync(file, original);
    }
    const theme = path.join(temporary, "chronos-2.0/themes/focus.css");
    fs.appendFileSync(theme, "\n/* </script><script>throw Error('unsafe pack') */\n");
    const malicious = build();
    assert.ok(malicious.includes("\\u003c/script>\\u003cscript>"));
    assert.ok(!malicious.includes("</script><script>throw Error('unsafe pack')"));
    for (const match of malicious.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(match[1]));
    }
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
});
