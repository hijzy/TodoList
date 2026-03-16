import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Todo = {
	text: string;
	completed: boolean;
	editing: boolean;
	important?: boolean;
};

type AuthConfig = {
	salt: string;
	passwordHash: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const dataDir = join(projectRoot, 'data');
const dataFile = join(dataDir, 'Todos.json');
const authFile = join(dataDir, 'Auth.json');
const distDir = join(projectRoot, 'dist');
const port = Number(process.env.TODO_SERVER_PORT || 8081);
const sessionCookieName = 'todo_session';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const sessions = new Map<string, number>();

async function ensureStorage() {
	await mkdir(dataDir, { recursive: true });
	if (!existsSync(dataFile)) {
		await writeFile(dataFile, '[]', 'utf-8');
	}
	if (!existsSync(authFile)) {
		await writeFile(authFile, 'null', 'utf-8');
	}
}

async function readTodos() {
	try {
		const content = await readFile(dataFile, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		return Array.isArray(parsed) ? (parsed as Todo[]) : [];
	} catch {
		return [];
	}
}

async function writeTodos(todos: Todo[]) {
	await writeFile(dataFile, JSON.stringify(todos, null, 2), 'utf-8');
}

async function readAuthConfig() {
	try {
		const content = await readFile(authFile, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}
		const salt = (parsed as AuthConfig).salt;
		const passwordHash = (parsed as AuthConfig).passwordHash;
		if (typeof salt !== 'string' || typeof passwordHash !== 'string') {
			return null;
		}
		if (!salt || !passwordHash) {
			return null;
		}
		return { salt, passwordHash };
	} catch {
		return null;
	}
}

async function writeAuthConfig(config: AuthConfig | null) {
	await writeFile(authFile, JSON.stringify(config), 'utf-8');
}

function hashPassword(password: string, salt: string) {
	return scryptSync(password, salt, 64).toString('hex');
}

function createSessionToken() {
	const token = randomBytes(32).toString('hex');
	const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
	sessions.set(token, expiresAt);
	return token;
}

function cleanExpiredSessions() {
	const now = Date.now();
	for (const [token, expiresAt] of sessions.entries()) {
		if (expiresAt <= now) {
			sessions.delete(token);
		}
	}
}

function readCookie(request: import('node:http').IncomingMessage, key: string) {
	const cookieHeader = request.headers.cookie;
	if (!cookieHeader) {
		return '';
	}
	const parts = cookieHeader.split(';');
	for (const part of parts) {
		const [name, ...rest] = part.trim().split('=');
		if (name === key) {
			return decodeURIComponent(rest.join('='));
		}
	}
	return '';
}

function isAuthenticated(request: import('node:http').IncomingMessage) {
	cleanExpiredSessions();
	const token = readCookie(request, sessionCookieName);
	if (!token) {
		return false;
	}
	const expiresAt = sessions.get(token);
	if (!expiresAt || expiresAt <= Date.now()) {
		sessions.delete(token);
		return false;
	}
	return true;
}

function buildSessionCookie(token: string) {
	return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`;
}

function buildSessionClearCookie() {
	return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function sendJson(
	response: import('node:http').ServerResponse,
	statusCode: number,
	data: unknown,
	extraHeaders: Record<string, string | string[]> = {}
) {
	response.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8',
		...extraHeaders
	});
	response.end(JSON.stringify(data));
}

function sendText(response: import('node:http').ServerResponse, statusCode: number, data: string | Buffer, contentType: string) {
	response.writeHead(statusCode, {
		'Content-Type': contentType
	});
	response.end(data);
}

function getContentType(filePath: string) {
	const extension = extname(filePath).toLowerCase();
	if (extension === '.html') {
		return 'text/html; charset=utf-8';
	}
	if (extension === '.js') {
		return 'application/javascript; charset=utf-8';
	}
	if (extension === '.css') {
		return 'text/css; charset=utf-8';
	}
	if (extension === '.json') {
		return 'application/json; charset=utf-8';
	}
	if (extension === '.png') {
		return 'image/png';
	}
	if (extension === '.jpg' || extension === '.jpeg') {
		return 'image/jpeg';
	}
	if (extension === '.svg') {
		return 'image/svg+xml';
	}
	if (extension === '.ico') {
		return 'image/x-icon';
	}
	if (extension === '.woff2') {
		return 'font/woff2';
	}
	if (extension === '.woff') {
		return 'font/woff';
	}
	if (extension === '.ttf') {
		return 'font/ttf';
	}
	if (extension === '.otf') {
		return 'font/otf';
	}
	return 'application/octet-stream';
}

async function parseRequestBody(request: import('node:http').IncomingMessage) {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	const raw = Buffer.concat(chunks).toString('utf-8');
	return raw ? (JSON.parse(raw) as unknown) : [];
}

async function readStaticFile(pathname: string) {
	const normalizedPath = pathname === '/' ? '/index.html' : pathname;
	const decodedPath = decodeURIComponent(normalizedPath);
	const filePath = resolve(distDir, `.${decodedPath}`);
	if (!filePath.startsWith(distDir)) {
		return null;
	}
	try {
		const content = await readFile(filePath);
		return { content, contentType: getContentType(filePath) };
	} catch {
		return null;
	}
}

await ensureStorage();

const server = createServer(async (request, response) => {
	const url = new URL(request.url || '/', `http://${request.headers.host}`);
	const authConfig = await readAuthConfig();

	if (url.pathname === '/api/auth/status' && request.method === 'GET') {
		sendJson(response, 200, {
			initialized: Boolean(authConfig),
			authenticated: isAuthenticated(request)
		});
		return;
	}

	if (url.pathname === '/api/auth/setup' && request.method === 'POST') {
		if (authConfig) {
			sendJson(response, 409, { message: 'Password already set' });
			return;
		}
		try {
			const body = await parseRequestBody(request);
			const password = typeof (body as { password?: unknown }).password === 'string' ? (body as { password: string }).password : '';
			const safePassword = password.trim();
			if (!safePassword) {
				sendJson(response, 400, { message: 'Password is required' });
				return;
			}
			const salt = randomBytes(16).toString('hex');
			const passwordHash = hashPassword(safePassword, salt);
			await writeAuthConfig({ salt, passwordHash });
			const token = createSessionToken();
			sendJson(response, 200, { success: true }, { 'Set-Cookie': buildSessionCookie(token) });
			return;
		} catch {
			sendJson(response, 400, { message: 'Invalid request body' });
			return;
		}
	}

	if (url.pathname === '/api/auth/login' && request.method === 'POST') {
		if (!authConfig) {
			sendJson(response, 400, { message: 'Password not initialized' });
			return;
		}
		try {
			const body = await parseRequestBody(request);
			const password = typeof (body as { password?: unknown }).password === 'string' ? (body as { password: string }).password : '';
			const safePassword = password.trim();
			if (!safePassword) {
				sendJson(response, 400, { message: 'Password is required' });
				return;
			}
			const passwordHash = hashPassword(safePassword, authConfig.salt);
			const expected = Buffer.from(authConfig.passwordHash, 'hex');
			const actual = Buffer.from(passwordHash, 'hex');
			if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
				sendJson(response, 401, { message: 'Wrong password' });
				return;
			}
			const token = createSessionToken();
			sendJson(response, 200, { success: true }, { 'Set-Cookie': buildSessionCookie(token) });
			return;
		} catch {
			sendJson(response, 400, { message: 'Invalid request body' });
			return;
		}
	}

	if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
		const token = readCookie(request, sessionCookieName);
		if (token) {
			sessions.delete(token);
		}
		sendJson(response, 200, { success: true }, { 'Set-Cookie': buildSessionClearCookie() });
		return;
	}

	if (url.pathname.startsWith('/api/') && !isAuthenticated(request)) {
		sendJson(response, 401, { message: 'Authentication required' });
		return;
	}

	if (url.pathname === '/api/todos' && request.method === 'GET') {
		const todos = await readTodos();
		sendJson(response, 200, todos);
		return;
	}

	if (url.pathname === '/api/todos' && request.method === 'PUT') {
		try {
			const body = await parseRequestBody(request);
			if (!Array.isArray(body)) {
				sendJson(response, 400, { message: 'Body must be an array' });
				return;
			}
			await writeTodos(body as Todo[]);
			sendJson(response, 200, { success: true });
			return;
		} catch {
			sendJson(response, 400, { message: 'Invalid JSON' });
			return;
		}
	}

	if (!existsSync(distDir)) {
		sendText(response, 503, 'Frontend build not found. Run npm run build first.', 'text/plain; charset=utf-8');
		return;
	}

	const staticFile = await readStaticFile(url.pathname);
	if (staticFile) {
		sendText(response, 200, staticFile.content, staticFile.contentType);
		return;
	}

	const htmlFallback = await readStaticFile('/index.html');
	if (htmlFallback) {
		sendText(response, 200, htmlFallback.content.toString('utf-8'), htmlFallback.contentType);
		return;
	}

	sendJson(response, 404, { message: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
	console.log(`Todo server listening at http://localhost:${port}`);
});
