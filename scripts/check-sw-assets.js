'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const assetMatch = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
assert.ok(assetMatch, 'sw.js must define ASSETS');
const assets = [];
assetMatch[1].replace(/'([^']+)'|"([^"]+)"/g, function (_, a, b) {
    assets.push(a || b);
});
assert.ok(assets.length > 0, 'ASSETS must not be empty');

function diskPath(asset) {
    let clean = asset.replace(/^\.\//, '').split('?')[0];
    if (clean === '/') {
        return null;
    }
    if (clean.charAt(0) === '/') {
        clean = clean.slice(1);
    }
    return path.join(root, clean);
}

assets.forEach(function (asset) {
    const p = diskPath(asset);
    if (!p) {
        return;
    }
    assert.ok(fs.existsSync(p), 'missing cached asset: ' + asset + ' (' + p + ')');
});

const cacheMatch = sw.match(/const CACHE_NAME = '([^']+)'/);
assert.ok(cacheMatch, 'sw.js must define CACHE_NAME');
assert.match(cacheMatch[1], /^eternal-timer-v\d+$/, 'CACHE_NAME should be versioned');

const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const buildMatch = app.match(/const APP_BUILD_ID = '([^']+)'/);
assert.ok(buildMatch, 'js/app.js must define APP_BUILD_ID');
assert.equal(buildMatch[1], cacheMatch[1], 'APP_BUILD_ID must match sw.js CACHE_NAME');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const htmlBuild = html.match(/data-app-version="([^"]+)"/);
assert.ok(htmlBuild, 'index.html must set data-app-version');
assert.equal(htmlBuild[1], cacheMatch[1], 'data-app-version must match CACHE_NAME');

const release = cacheMatch[1];
const versionQuery = 'v=' + release;
['css/style.css', 'js/app.js'].forEach(function (base) {
    const pattern = new RegExp(base.replace('/', '\\/') + '\\?' + versionQuery.replace('=', '\\='));
    assert.ok(pattern.test(html), 'index.html must reference ' + base + '?' + versionQuery);
    const inSw = assets.some(function (asset) {
        return asset.split('?')[0] === '/' + base && asset.indexOf(versionQuery) !== -1;
    });
    assert.ok(inSw, 'sw.js ASSETS must list ' + base + '?' + versionQuery);
});

console.log('service worker asset checks passed (' + assets.length + ' assets, release ' + release + ')');
