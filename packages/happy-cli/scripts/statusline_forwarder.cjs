#!/usr/bin/env node
/**
 * Claude statusLine forwarder.
 *
 * Claude Code pipes statusLine JSON into this script. Happy forwards that JSON
 * to the per-session hook server, then delegates to the user's original
 * statusLine command when one exists.
 */

const http = require('http');
const { spawn } = require('child_process');

const port = Number.parseInt(process.argv[2], 10);
const originalCommand = process.argv[3]
    ? Buffer.from(process.argv[3], 'base64url').toString('utf-8')
    : null;

if (!port || Number.isNaN(port)) {
    process.exit(1);
}

const chunks = [];

process.stdin.on('data', (chunk) => {
    chunks.push(chunk);
});

function postStatusLine(body) {
    return new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/hook/status-line',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length,
            },
            timeout: 1000,
        }, (res) => {
            res.resume();
            res.on('end', resolve);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve();
        });
        req.on('error', resolve);
        req.end(body);
    });
}

function runOriginalStatusLine(command, body) {
    return new Promise((resolve) => {
        const child = spawn(command, {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        child.stdout.on('data', (chunk) => process.stdout.write(chunk));
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));
        child.on('error', () => resolve(1));
        child.on('close', (code) => resolve(code ?? 0));
        child.stdin.end(body);
    });
}

process.stdin.on('end', async () => {
    const body = Buffer.concat(chunks);
    await postStatusLine(body);

    if (!originalCommand) {
        process.exit(0);
    }

    const exitCode = await runOriginalStatusLine(originalCommand, body);
    process.exit(exitCode);
});

process.stdin.resume();
