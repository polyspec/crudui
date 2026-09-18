// The PHP record server (docs/spec/form-comparison.md, "Record servers"): PHP-FPM runs api.php and
// nginx in front of it accepts the connections, limits a request body to 2 MiB before PHP reads
// it and forwards `/api/` requests over FastCGI.
//   node servers/php/main.mjs {host:port} {run directory} -- {php-fpm arguments}
// The server name, data directory and the other FORM_* settings reach api.php through the
// environment. The line `CRUDUI_READY {server}` follows once both processes accept requests.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exampleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const separator = process.argv.indexOf('--');
const [address, runArgument] = process.argv.slice(2, separator === -1 ? undefined : separator);
const fpmArguments = separator === -1 ? [] : process.argv.slice(separator + 1);
const server = process.env.FORM_PHP_SERVER;
if (!address || !runArgument || !['php', 'php-ext'].includes(server)) {
  throw new Error('Usage: FORM_PHP_SERVER={php|php-ext} node servers/php/main.mjs {host:port} {run directory} -- {php-fpm arguments}');
}
const runDirectory = path.resolve(runArgument);
// A Unix socket path holds at most 104 bytes on macOS, so the socket gets a short directory of its own.
const socketDirectory = await mkdtemp(path.join(tmpdir(), 'crudui-fpm-'));
const socket = path.join(socketDirectory, 'fpm.sock');
/** The request body limit of every record server. */
const bodyLimit = '2m';
/** Starting PHP-FPM and nginx measured under 0.2 s; each holds this limit. */
const startLimitMs = 10_000;

const json = value => JSON.stringify(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");

async function configure() {
  await rm(runDirectory, { recursive: true, force: true });
  await mkdir(path.join(runDirectory, 'nginx'), { recursive: true });
  await writeFile(path.join(runDirectory, 'fpm.conf'), [
    '[global]',
    // A container's standard error is a pipe /dev/stderr cannot reopen; the log file stays in the
    // run directory and `-O` copies every message to standard error.
    `error_log = ${path.join(runDirectory, 'fpm.log')}`,
    'daemonize = no',
    '[api]',
    `listen = ${socket}`,
    'pm = static',
    'pm.max_children = 4',
    'clear_env = no',
    'catch_workers_output = yes',
    'decorate_workers_output = no',
    '',
  ].join('\n'));
  const [host, port] = [address.slice(0, address.lastIndexOf(':')), address.slice(address.lastIndexOf(':') + 1)];
  // Every benchmark response of a PHP server names its JSON processor; record responses do not.
  const failure = (status, message, benchmark) => `default_type 'application/json; charset=utf-8'; `
    + `add_header Cache-Control no-store always; return ${status} '${json({
      error: message, server, ...(benchmark ? { nativeJson: server === 'php-ext' } : {}),
    })}';`;
  await writeFile(path.join(runDirectory, 'nginx.conf'), `
daemon off;
worker_processes 1;
pid ${runDirectory}/nginx.pid;
error_log stderr warn;
events { worker_connections 256; }
http {
  access_log off;
  client_body_temp_path ${runDirectory}/nginx/body;
  fastcgi_temp_path ${runDirectory}/nginx/fastcgi;
  proxy_temp_path ${runDirectory}/nginx/proxy;
  uwsgi_temp_path ${runDirectory}/nginx/uwsgi;
  scgi_temp_path ${runDirectory}/nginx/scgi;
  server {
    listen ${host}:${port};
    client_max_body_size ${bodyLimit};
    # An oversized body is answered at once; nginx then reads and discards what the client still
    # sends, within these limits, so the client receives the answer instead of a reset connection.
    lingering_close always;
    lingering_time 10s;
    lingering_timeout 5s;
    location /api/records { error_page 413 = @record_too_large; ${fastcgi()} }
    location /api/ { error_page 413 = @too_large; ${fastcgi()} }
    location @record_too_large { ${failure(413, 'Request body exceeds 2 MiB', false)} }
    location @too_large { ${failure(413, 'Request body exceeds 2 MiB', true)} }
    location / { ${failure(404, 'Unknown endpoint', false)} }
  }
}
`);
}

/** The FastCGI directives that pass one request to api.php. */
function fastcgi() {
  return [
    `fastcgi_pass unix:${socket};`,
    `fastcgi_param SCRIPT_FILENAME ${path.join(exampleDirectory, 'api.php')};`,
    'fastcgi_param REQUEST_METHOD $request_method;',
    'fastcgi_param REQUEST_URI $request_uri;',
    'fastcgi_param QUERY_STRING $query_string;',
    'fastcgi_param CONTENT_TYPE $content_type;',
    'fastcgi_param CONTENT_LENGTH $content_length;',
    'fastcgi_param SERVER_PROTOCOL $server_protocol;',
    'fastcgi_param REMOTE_ADDR $remote_addr;',
  ].join(' ');
}

/** Resolve once `probe` succeeds, polling every 20 ms; fail after the start limit. */
async function waitFor(name, probe) {
  const started = performance.now();
  for (;;) {
    if (await probe()) return;
    if (performance.now() - started > startLimitMs) throw new Error(`${name} did not accept connections within ${startLimitMs} ms`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

const accepts = target => new Promise(resolve => {
  const connection = connect(target);
  connection.once('connect', () => { connection.destroy(); resolve(true); });
  connection.once('error', () => resolve(false));
});

const children = [];
let stopping = false;

function run(name, command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  child.once('error', error => stop(`${name} failed to start: ${error.message}`));
  child.once('exit', (code, signal) => { if (!stopping) stop(`${name} exited: ${signal ?? code}`); });
  children.push(child);
  return child;
}

/** Stop both processes; a reason means the server failed and exits with status 1. */
function stop(reason) {
  if (stopping) return;
  stopping = true;
  if (reason) process.stderr.write(`[${server}] ${reason}\n`);
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 2_000);
  Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null
    ? null : new Promise(resolve => child.once('exit', resolve))))
    .then(() => rm(socketDirectory, { recursive: true, force: true }))
    .then(() => { clearTimeout(deadline); process.exit(reason ? 1 : 0); });
}

process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());

try {
  await configure();
  run('php-fpm', 'php-fpm', ['-F', '-O', '-y', path.join(runDirectory, 'fpm.conf'), ...fpmArguments]);
  await waitFor('php-fpm', () => accepts(socket));
  run('nginx', 'nginx', ['-e', 'stderr', '-p', runDirectory, '-c', path.join(runDirectory, 'nginx.conf')]);
  const port = Number(address.slice(address.lastIndexOf(':') + 1));
  const host = address.slice(0, address.lastIndexOf(':'));
  await waitFor('nginx', () => accepts({ host, port }));
  process.stdout.write(`CRUDUI_READY ${server}\n`);
} catch (error) {
  stop(error.message);
}
