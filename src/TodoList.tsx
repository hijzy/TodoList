import { DragEvent, FormEvent, useEffect, useState, useRef } from 'react';
import './TodoList.css';
import TodoItem from './TodoItem';

type Todo = {
	id: string;
	text: string;
	completed: boolean;
	editing: boolean;
	important?: boolean;
};

type AuthScreen = 'checking' | 'setup' | 'login' | 'ready';

const PRIVATE_TODOS_KEY = 'todos_local_private';
const CLOUD_CACHE_TODOS_KEY = 'todos_cloud_cache';
const LEGACY_TODOS_KEY = 'todos';
const PRIVACY_MODE_KEY = 'privacy_mode';
const GROUP_IMPORTANT = 'important';
const GROUP_TASKS = 'tasks';
const GROUP_COMPLETED = 'completed';
type GroupName = typeof GROUP_IMPORTANT | typeof GROUP_TASKS | typeof GROUP_COMPLETED;

function createTodoId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTodos(rawTodos: Todo[]) {
	return rawTodos.map(todo => {
		if (todo.id) {
			return todo;
		}
		return {
			...todo,
			id: createTodoId()
		};
	});
}

function readTodosByKey(key: string) {
	const saved = localStorage.getItem(key);
	if (!saved) {
		return [];
	}
	try {
		return normalizeTodos(JSON.parse(saved) as Todo[]);
	} catch {
		return [];
	}
}

function readPrivateTodos() {
	const privateTodos = readTodosByKey(PRIVATE_TODOS_KEY);
	if (privateTodos.length > 0) {
		return privateTodos;
	}
	return readTodosByKey(LEGACY_TODOS_KEY);
}

function readCloudCacheTodos() {
	return readTodosByKey(CLOUD_CACHE_TODOS_KEY);
}

function TodoList() {
	const [todos, setTodos] = useState<Todo[]>(() => readPrivateTodos());
	const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => localStorage.getItem(PRIVACY_MODE_KEY) === 'true');
	const [isSwitchingMode, setIsSwitchingMode] = useState(false);
	const [isHydratingRemote, setIsHydratingRemote] = useState(false);
	const [isRemoteAvailable, setIsRemoteAvailable] = useState(true);
	const [authScreen, setAuthScreen] = useState<AuthScreen>('checking');
	const [authPassword, setAuthPassword] = useState('');
	const [authError, setAuthError] = useState('');
	const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
	const [draggingTodoId, setDraggingTodoId] = useState('');
	const [draggingGroup, setDraggingGroup] = useState<GroupName | ''>('');
	const [dropBeforeTodoId, setDropBeforeTodoId] = useState('');
	const [recentlyMovedTodoId, setRecentlyMovedTodoId] = useState('');
	// Store drag state in ref to avoid re-renders during rapid drag over events
	const dragStateRef = useRef({
		dropBeforeTodoId: '',
		lastUpdateTime: 0
	});
	const [isDropping, setIsDropping] = useState(false);
	const isAuthorized = authScreen === 'ready';

	function getGroupName(todo: Todo): GroupName {
		if (todo.completed) {
			return GROUP_COMPLETED;
		}
		if (todo.important) {
			return GROUP_IMPORTANT;
		}
		return GROUP_TASKS;
	}

	function reorderTodoInGroup(movedTodoId: string, targetGroup: GroupName, beforeTodoId?: string) {
		setTodos(previousTodos => {
			const movedTodo = previousTodos.find(todo => todo.id === movedTodoId);
			if (!movedTodo) {
				return previousTodos;
			}
			if (getGroupName(movedTodo) !== targetGroup) {
				return previousTodos;
			}
			const todoWithoutMoved = previousTodos.filter(todo => todo.id !== movedTodoId);
			const nextMovedTodo: Todo = movedTodo;
			const grouped = {
				[GROUP_IMPORTANT]: todoWithoutMoved.filter(todo => getGroupName(todo) === GROUP_IMPORTANT),
				[GROUP_TASKS]: todoWithoutMoved.filter(todo => getGroupName(todo) === GROUP_TASKS),
				[GROUP_COMPLETED]: todoWithoutMoved.filter(todo => getGroupName(todo) === GROUP_COMPLETED)
			};
			const targetTodos = grouped[targetGroup];
			if (beforeTodoId) {
				const targetIndex = targetTodos.findIndex(todo => todo.id === beforeTodoId);
				if (targetIndex >= 0) {
					targetTodos.splice(targetIndex, 0, nextMovedTodo);
				} else {
					targetTodos.push(nextMovedTodo);
				}
			} else {
				targetTodos.push(nextMovedTodo);
			}
			return [...grouped[GROUP_IMPORTANT], ...grouped[GROUP_TASKS], ...grouped[GROUP_COMPLETED]];
		});
		setRecentlyMovedTodoId(movedTodoId);
	}

	function clearDragState() {
		setDraggingTodoId('');
		setDraggingGroup('');
		setDropBeforeTodoId('');
		dragStateRef.current.dropBeforeTodoId = '';
	}

	function getShiftDirection(todoId: string, groupTodos: Todo[], groupName: GroupName): 'up' | 'down' | '' {
		if (draggingGroup !== groupName || !draggingTodoId) {
			return '';
		}
		// The dragging item itself is collapsed (height: 0), so no shift needed for it
		if (todoId === draggingTodoId) {
			return '';
		}
		
		// Find the index where the drop would happen
		// Since the dragging item is visually "gone" (collapsed), 
		// we consider the list as if the dragging item isn't there.
		const visibleTodos = groupTodos.filter(t => t.id !== draggingTodoId);
		let targetIndex = -1;
		
		if (dropBeforeTodoId) {
			targetIndex = visibleTodos.findIndex(t => t.id === dropBeforeTodoId);
		} else {
			// Dropping at the end
			targetIndex = visibleTodos.length;
		}

		// If we couldn't find the target (e.g. cross-group drag edge cases), default to end
		if (targetIndex < 0) {
			targetIndex = visibleTodos.length;
		}

		// Current item's index in the "visible" list (excluding the dragging item)
		const currentIndex = visibleTodos.findIndex(t => t.id === todoId);
		
		// If current item is at or after the insertion point, shift it down to make room
		if (currentIndex >= targetIndex) {
			return 'down';
		}

		return '';
	}

	function getDropBeforeId(event: DragEvent<HTMLDivElement>) {
		// Use document.elementsFromPoint to find the todo item under the cursor,
		// because dragging to the left might be outside the text area but still on the row.
		// Since we only care about Y axis for ordering, we can just check all items in the list.
		// We pass activeGroupElement to scope the search to the correct list.
		return ''; // We moved this logic directly into the global drag over handler
	}

	function handleGroupDragOver(event: DragEvent<HTMLDivElement>, groupName: GroupName) {
		// This is now handled globally
	}

	function handleGroupDrop(event: DragEvent<HTMLDivElement>, groupName: GroupName) {
		// This is now handled globally
	}

	function separateTodos() {
		const importantTodos = todos.filter(todo => getGroupName(todo) === GROUP_IMPORTANT);
		const taskTodos = todos.filter(todo => getGroupName(todo) === GROUP_TASKS);
		const completedTodos = todos.filter(todo => getGroupName(todo) === GROUP_COMPLETED);
		return { importantTodos, taskTodos, completedTodos };
	}

	function handleAddTodo(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const input = event.currentTarget.elements.namedItem('todo');
		if (!(input instanceof HTMLInputElement)) {
			return;
		}
		const value = input.value.trim();
		if (!value) {
			return;
		}
		const todo: Todo = {
			id: createTodoId(),
			text: value,
			completed: false,
			editing: false
		};
		setTodos([todo, ...todos]);
		input.value = '';
	}

	function handleCompleteTodo(todo: Todo) {
		const newTodos = todos.map(t => (t.id === todo.id ? { ...t, completed: !t.completed } : t));
		setTodos(newTodos);
	}

	function handleDeleteTodo(todo: Todo) {
		const newTodos = todos.filter(t => t.id !== todo.id);
		setTodos(newTodos);
	}

	function handleClear() {
		setTodos([]);
	}

	useEffect(() => {
		let cancelled = false;
		fetch('/api/auth/status')
			.then(response => {
				if (!response.ok) {
					throw new Error('auth status failed');
				}
				return response.json() as Promise<{ initialized: boolean; authenticated: boolean }>;
			})
			.then(result => {
				if (cancelled) {
					return;
				}
				if (!result.initialized) {
					setAuthScreen('setup');
					return;
				}
				if (result.authenticated) {
					setAuthScreen('ready');
					return;
				}
				setAuthScreen('login');
			})
			.catch(() => {
				if (cancelled) {
					return;
				}
				setAuthScreen('login');
				setAuthError('Server unavailable, please retry.');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!recentlyMovedTodoId) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			setRecentlyMovedTodoId('');
		}, 320);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [recentlyMovedTodoId]);

	function submitAuthForm(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (authScreen !== 'setup' && authScreen !== 'login') {
			return;
		}
		const safePassword = authPassword.trim();
		if (!safePassword) {
			setAuthError('Password is required.');
			return;
		}
		setAuthError('');
		setIsAuthSubmitting(true);
		const endpoint = authScreen === 'setup' ? '/api/auth/setup' : '/api/auth/login';
		fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ password: safePassword })
		})
			.then(async response => {
				if (!response.ok) {
					let message = authScreen === 'setup' ? 'Setup failed.' : 'Wrong password.';
					try {
						const payload = (await response.json()) as { message?: unknown };
						if (typeof payload.message === 'string' && payload.message) {
							message = payload.message;
						}
					} catch {
						if (response.status >= 500) {
							message = 'Server unavailable, please retry.';
						}
					}
					throw new Error(message);
				}
				setAuthPassword('');
				setAuthScreen('ready');
				setIsRemoteAvailable(true);
			})
			.catch(error => {
				if (error instanceof Error) {
					setAuthError(error.message);
					return;
				}
				setAuthError('Server unavailable, please retry.');
			})
			.finally(() => {
				setIsAuthSubmitting(false);
			});
	}

	function handleLogout() {
		fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
			setAuthScreen('login');
			setAuthPassword('');
			setAuthError('');
		});
	}

	useEffect(() => {
		if (!isAuthorized) {
			return;
		}
		if (isSwitchingMode) {
			return;
		}
		if (isPrivacyMode) {
			localStorage.setItem(PRIVATE_TODOS_KEY, JSON.stringify(todos));
			return;
		}
		localStorage.setItem(CLOUD_CACHE_TODOS_KEY, JSON.stringify(todos));
	}, [todos, isPrivacyMode, isSwitchingMode, isAuthorized]);

	useEffect(() => {
		if (!isAuthorized) {
			return;
		}
		let cancelled = false;
		if (isPrivacyMode) {
			setTodos(readPrivateTodos());
			setIsHydratingRemote(false);
			setIsSwitchingMode(false);
			return;
		}
		setIsHydratingRemote(true);
		fetch('/api/todos')
			.then(response => {
				if (response.status === 401) {
					setAuthScreen('login');
					setAuthError('Session expired, please sign in again.');
					throw new Error('unauthorized');
				}
				if (!response.ok) {
					throw new Error('remote read failed');
				}
				return response.json() as Promise<Todo[]>;
			})
			.then(remoteTodos => {
				if (cancelled) {
					return;
				}
				const safeTodos = Array.isArray(remoteTodos) ? remoteTodos : [];
				const normalized = normalizeTodos(safeTodos);
				setTodos(normalized);
				localStorage.setItem(CLOUD_CACHE_TODOS_KEY, JSON.stringify(normalized));
				setIsRemoteAvailable(true);
			})
			.catch(() => {
				if (cancelled) {
					return;
				}
				setTodos(readCloudCacheTodos());
				setIsRemoteAvailable(false);
			})
			.finally(() => {
				if (cancelled) {
					return;
				}
				setIsHydratingRemote(false);
				setIsSwitchingMode(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isPrivacyMode, isAuthorized]);

	useEffect(() => {
		if (!isAuthorized) {
			return;
		}
		if (isPrivacyMode || isHydratingRemote || isSwitchingMode) {
			return;
		}
		fetch('/api/todos', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(todos)
		})
			.then(response => {
				if (response.status === 401) {
					setAuthScreen('login');
					setAuthError('Session expired, please sign in again.');
					throw new Error('unauthorized');
				}
				if (!response.ok) {
					throw new Error('remote write failed');
				}
				setIsRemoteAvailable(true);
			})
			.catch(() => {
				setIsRemoteAvailable(false);
			});
	}, [todos, isPrivacyMode, isHydratingRemote, isSwitchingMode, isAuthorized]);

	function handleEditTodo(todo: Todo) {
		const newTodos = todos.map(t => (t.id === todo.id ? { ...t, editing: true } : t));
		setTodos(newTodos);
	}

	function handleSaveTodo(todo: Todo, event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const input = event.currentTarget.elements.namedItem('editTodo');
		if (!(input instanceof HTMLInputElement)) {
			return;
		}
		const value = input.value.trim();
		if (!value) {
			return;
		}
		const newTodos = todos.map(t => (t.id === todo.id ? { ...t, text: value, editing: false } : t));
		setTodos(newTodos);
	}

	function handleMarkImportant(todo: Todo) {
		const newTodos = todos.map(t => (t.id === todo.id ? { ...t, important: !t.important } : t));
		setTodos(newTodos);
	}

	function toggleAddTodoVisibility() {
		const addTodoContainer = document.querySelector('.add-todo-container');
		if (!(addTodoContainer instanceof HTMLElement)) {
			return;
		}
		addTodoContainer.classList.toggle('show');
	}

	function togglePrivacyMode() {
		setIsSwitchingMode(true);
		const next = !isPrivacyMode;
		if (!next) {
			setIsHydratingRemote(true);
		}
		localStorage.setItem(PRIVACY_MODE_KEY, String(next));
		setIsPrivacyMode(next);
	}

	const { importantTodos, taskTodos, completedTodos } = separateTodos();

	if (authScreen !== 'ready') {
		return (
			<div className="main auth-main">
				<div className="auth-card">
					<h1>{authScreen === 'setup' ? 'Set Access Password' : authScreen === 'login' ? 'Enter Access Password' : 'Checking Access'}</h1>
					{authScreen === 'checking' ? (
						<p className="sync-state">Checking authentication status...</p>
					) : (
						<form className="auth-form" onSubmit={submitAuthForm}>
							<input
								type="password"
								name="authPassword"
								value={authPassword}
								onChange={event => setAuthPassword(event.target.value)}
								autoComplete={authScreen === 'setup' ? 'new-password' : 'current-password'}
								placeholder={authScreen === 'setup' ? 'Create password' : 'Input password'}
								className="auth-input"
							/>
							<button type="submit" disabled={isAuthSubmitting}>
								{isAuthSubmitting ? 'Please wait...' : authScreen === 'setup' ? 'Set Password' : 'Unlock'}
							</button>
						</form>
					)}
					{authError && <p className="sync-state">{authError}</p>}
				</div>
			</div>
		);
	}

	return (
		<>
			{/* Add a full-screen background overlay that catches drag events everywhere */}
			<div 
				className="drag-wrapper"
				onDragOver={event => {
					// Global drag over handler for the entire window to support edge dragging
					if (!draggingTodoId || !draggingGroup) {
						return;
					}
					event.preventDefault();
					
					// Throttle calculations
					const now = Date.now();
					if (now - dragStateRef.current.lastUpdateTime < 30) {
						return;
					}
					dragStateRef.current.lastUpdateTime = now;

					// We need to find which group we are currently hovering over
					// and what the drop target should be based on Y coordinate
					
					// Get all possible groups (Important, Tasks, Completed)
					const listElements = Array.from(document.querySelectorAll<HTMLUListElement>('ul'));
					let activeGroupElement = null;
					let targetGroupName = draggingGroup; // Default to current group

					// Find the closest list vertically
					let minDistance = Infinity;
					for (const ul of listElements) {
						const rect = ul.getBoundingClientRect();
						// If mouse is within the vertical bounds of this list (with some padding)
						if (event.clientY >= rect.top - 20 && event.clientY <= rect.bottom + 20) {
							activeGroupElement = ul;
							break;
						}
						
						// Otherwise track the closest one
						const distance = Math.min(
							Math.abs(event.clientY - rect.top),
							Math.abs(event.clientY - rect.bottom)
						);
						if (distance < minDistance) {
							minDistance = distance;
							activeGroupElement = ul;
						}
					}

					if (!activeGroupElement) return;

					// Determine group name based on previous sibling h2 or structure
					let newTargetGroupName = draggingGroup;
					
					// Search specifically for headers related to the active list
					if (activeGroupElement.previousElementSibling?.tagName === 'H2') {
						const text = activeGroupElement.previousElementSibling.textContent;
						if (text === 'Important') newTargetGroupName = GROUP_IMPORTANT;
						else if (text === 'Tasks') newTargetGroupName = GROUP_TASKS;
						else if (text === 'Completed') newTargetGroupName = GROUP_COMPLETED;
					} else {
						// Traverse up to see if it's within a specific section
						const parentText = activeGroupElement.parentElement?.querySelector('h2')?.textContent;
						if (parentText === 'Important') newTargetGroupName = GROUP_IMPORTANT;
						else if (parentText === 'Completed') newTargetGroupName = GROUP_COMPLETED;
						else newTargetGroupName = GROUP_TASKS;
					}

					// Only allow dragging within the same group
					if (newTargetGroupName !== draggingGroup) {
						return;
					}

					// Calculate beforeId using the active list element
					const todoElements = Array.from(activeGroupElement.querySelectorAll<HTMLLIElement>('.todo-item:not(.dragging)'));
					let beforeId = '';
					
					// Sort the items to ensure we check them in visual order
					const sortedElements = todoElements.sort((a, b) => {
						return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
					});
					
					for (const todoElement of sortedElements) {
						const rect = todoElement.getBoundingClientRect();
						// Only check Y coordinate. 
						// If mouse Y is above the middle of this item, it should be dropped before it
						if (event.clientY < rect.top + rect.height * 0.5) {
							beforeId = todoElement.dataset.todoId || '';
							break;
						}
					}

					if (beforeId !== dragStateRef.current.dropBeforeTodoId) {
						dragStateRef.current.dropBeforeTodoId = beforeId;
						setDropBeforeTodoId(beforeId);
					}
				}}
				onDrop={event => {
					if (!draggingTodoId || !draggingGroup) {
						return;
					}
					event.preventDefault();
					
					// Handle global drop using current ref state
				setIsDropping(true);
				
				// Reorder only if we're dropping in a valid state
				// The actual group being dropped into is determined by draggingGroup 
				// (since we restrict dragging to the same group in onDragOver)
				reorderTodoInGroup(draggingTodoId, draggingGroup, dragStateRef.current.dropBeforeTodoId || undefined);
				
				clearDragState();
				
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						setIsDropping(false);
					});
				});
			}}
		/>
		<div 
			className={`main ${isDropping ? 'is-dropping' : ''}`}
			style={{ minHeight: '100vh', width: '100%', paddingBottom: '200px' }} // Ensure it takes up space for drag events
			onDragOver={event => {
				// Forward drag over events to the global handler
				if (!draggingTodoId || !draggingGroup) return;
				event.preventDefault();
				
				// We manually trigger the drag-wrapper logic here to ensure
				// hovering over actual todo items still triggers the layout updates.
				// Since pointer-events: auto on child elements will intercept the drag,
				// the wrapper underneath won't get it while hovering the actual cards.
				
				// Throttle calculations
				const now = Date.now();
				if (now - dragStateRef.current.lastUpdateTime < 30) return;
				dragStateRef.current.lastUpdateTime = now;

				const listElements = Array.from(document.querySelectorAll<HTMLUListElement>('ul'));
				let activeGroupElement = null;

				let minDistance = Infinity;
				for (const ul of listElements) {
					const rect = ul.getBoundingClientRect();
					if (event.clientY >= rect.top - 20 && event.clientY <= rect.bottom + 20) {
						activeGroupElement = ul;
						break;
					}
					const distance = Math.min(
						Math.abs(event.clientY - rect.top),
						Math.abs(event.clientY - rect.bottom)
					);
					if (distance < minDistance) {
						minDistance = distance;
						activeGroupElement = ul;
					}
				}

				if (!activeGroupElement) return;

				let newTargetGroupName = draggingGroup;
				if (activeGroupElement.previousElementSibling?.tagName === 'H2') {
					const text = activeGroupElement.previousElementSibling.textContent;
					if (text === 'Important') newTargetGroupName = GROUP_IMPORTANT;
					else if (text === 'Tasks') newTargetGroupName = GROUP_TASKS;
					else if (text === 'Completed') newTargetGroupName = GROUP_COMPLETED;
				} else {
					const parentText = activeGroupElement.parentElement?.querySelector('h2')?.textContent;
					if (parentText === 'Important') newTargetGroupName = GROUP_IMPORTANT;
					else if (parentText === 'Completed') newTargetGroupName = GROUP_COMPLETED;
					else newTargetGroupName = GROUP_TASKS;
				}

				if (newTargetGroupName !== draggingGroup) return;

				const todoElements = Array.from(activeGroupElement.querySelectorAll<HTMLLIElement>('.todo-item:not(.dragging)'));
				let beforeId = '';
				
				const sortedElements = todoElements.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
				
				for (const todoElement of sortedElements) {
					const rect = todoElement.getBoundingClientRect();
					if (event.clientY < rect.top + rect.height * 0.5) {
						beforeId = todoElement.dataset.todoId || '';
						break;
					}
				}

				if (beforeId !== dragStateRef.current.dropBeforeTodoId) {
					dragStateRef.current.dropBeforeTodoId = beforeId;
					setDropBeforeTodoId(beforeId);
				}
			}}
			onDrop={event => {
				if (!draggingTodoId || !draggingGroup) return;
				event.preventDefault();
				setIsDropping(true);
				reorderTodoInGroup(draggingTodoId, draggingGroup, dragStateRef.current.dropBeforeTodoId || undefined);
				clearDragState();
				requestAnimationFrame(() => requestAnimationFrame(() => setIsDropping(false)));
			}}
		>
			<div className="top">
				<button
					className={`cloud-toggle ${isPrivacyMode ? 'privacy' : 'cloud'} ${isSwitchingMode ? 'is-switching' : ''}`}
					onClick={togglePrivacyMode}
					type="button"
					disabled={isSwitchingMode}
					aria-busy={isSwitchingMode}
				>
					<svg width="24" height="24" viewBox="0 0 24 24">
						<path d="M19 18.5H6.5a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 19 11a3.75 3.75 0 0 1 0 7.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
						{isPrivacyMode && <path d="M5 19L19 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
					</svg>
				</button>
				<h1 className="top-title">Todo List</h1>
				<div className="top-spacer" />
				<button className="logout-button" onClick={handleLogout} type="button">
					Lock
				</button>
			</div>
			{isSwitchingMode && <p className="sync-state">Syncing mode, please wait...</p>}
			{!isPrivacyMode && !isRemoteAvailable && <p className="sync-state">Server unavailable, currently showing local cache.</p>}
			{isPrivacyMode && <p className="sync-state">Privacy mode enabled, using browser cache only.</p>}

			{importantTodos.length > 0 && (
				<>
					<h2>Important</h2>
					<ul>
						{importantTodos.map(todo => (
							<TodoItem
								key={todo.id}
								todo={todo}
								handleCompleteTodo={() => handleCompleteTodo(todo)}
								handleEditTodo={() => handleEditTodo(todo)}
								handleSaveTodo={event => handleSaveTodo(todo, event)}
								handleDeleteTodo={() => handleDeleteTodo(todo)}
								handleMarkImportant={() => handleMarkImportant(todo)}
								onDragStart={() => {
									setDraggingTodoId(todo.id);
									setDraggingGroup(GROUP_IMPORTANT);
								}}
								onDragEnd={() => {
									clearDragState();
								}}
								onDragOver={event => {
									event.preventDefault(); // Keep to allow drop target
								}}
								onDrop={event => {
									event.preventDefault(); // Keep to allow drop target
								}}
								isDropTarget={dropBeforeTodoId === todo.id}
								isDragging={draggingTodoId === todo.id}
								shiftDirection={getShiftDirection(todo.id, importantTodos, GROUP_IMPORTANT)}
								isRecentlyMoved={recentlyMovedTodoId === todo.id}
							/>
						))}
					</ul>
				</>
			)}

			<h2>Tasks</h2>

			<ul>
				{taskTodos.map(todo => (
					<TodoItem
						key={todo.id}
						todo={todo}
						handleCompleteTodo={() => handleCompleteTodo(todo)}
						handleEditTodo={() => handleEditTodo(todo)}
						handleSaveTodo={event => handleSaveTodo(todo, event)}
						handleDeleteTodo={() => handleDeleteTodo(todo)}
						handleMarkImportant={() => handleMarkImportant(todo)}
						onDragStart={() => {
							setDraggingTodoId(todo.id);
							setDraggingGroup(GROUP_TASKS);
						}}
						onDragEnd={() => {
							clearDragState();
						}}
						onDragOver={event => {
							event.preventDefault();
						}}
						onDrop={event => {
							event.preventDefault();
						}}
						isDropTarget={dropBeforeTodoId === todo.id}
						isDragging={draggingTodoId === todo.id}
						shiftDirection={getShiftDirection(todo.id, taskTodos, GROUP_TASKS)}
						isRecentlyMoved={recentlyMovedTodoId === todo.id}
					/>
				))}
			</ul>

			{completedTodos.length > 0 && (
				<>
					<h2>Completed</h2>
					<ul>
						{completedTodos.map(todo => (
							<TodoItem
								key={todo.id}
								todo={todo}
								handleCompleteTodo={() => handleCompleteTodo(todo)}
								handleEditTodo={() => handleEditTodo(todo)}
								handleSaveTodo={event => handleSaveTodo(todo, event)}
								handleDeleteTodo={() => handleDeleteTodo(todo)}
								handleMarkImportant={() => handleMarkImportant(todo)}
								onDragStart={() => {
									setDraggingTodoId(todo.id);
									setDraggingGroup(GROUP_COMPLETED);
								}}
								onDragEnd={() => {
									clearDragState();
								}}
								onDragOver={event => {
									event.preventDefault();
								}}
								onDrop={event => {
									event.preventDefault();
								}}
								isDropTarget={dropBeforeTodoId === todo.id}
								isDragging={draggingTodoId === todo.id}
								shiftDirection={getShiftDirection(todo.id, completedTodos, GROUP_COMPLETED)}
								isRecentlyMoved={recentlyMovedTodoId === todo.id}
							/>
						))}
					</ul>
				</>
			)}

			{importantTodos.length === 0 && taskTodos.length === 0 && completedTodos.length === 0 && (
				<div className="done">
					<p className="empty-state">No todo items yet.</p>
				</div>
			)}

			<form onSubmit={handleAddTodo} className="add-todo-container">
				<button type="button" onClick={toggleAddTodoVisibility} className="no-fill-icon-button">
					<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
						<title>Close</title>
						<path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M368 368L144 144M368 144L144 368" />
					</svg>
				</button>

				<input type="text" name="todo" id="todo-input" autoComplete="off" className="add-input" placeholder="What do you need to do?" />
				<button type="submit" className="add-button" onClick={toggleAddTodoVisibility}>
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="none">
						<path d="M8 3.5V12.5M12.5 8H3.5" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
					<span>Add</span>
				</button>
			</form>

			<button onClick={toggleAddTodoVisibility} className="mobile-toggle-drawer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path d="M8 3.5V12.5M12.5 8H3.5" stroke="white" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</button>

			{todos.length > 0 && !draggingTodoId && (
				<button onClick={handleClear} className="clear-button">
					Clear All
				</button>
			)}
		</div>
		</>
	);
}

export default TodoList;
