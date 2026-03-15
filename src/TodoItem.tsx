import { DragEvent, FormEvent, useEffect, useState } from 'react';

type Todo = {
	id: string;
	text: string;
	completed: boolean;
	editing: boolean;
	important?: boolean;
};

type TodoItemProps = {
	todo: Todo;
	handleCompleteTodo: () => void;
	handleEditTodo: () => void;
	handleSaveTodo: (event: FormEvent<HTMLFormElement>) => void;
	handleDeleteTodo: () => void;
	handleMarkImportant: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDragOver: (event: DragEvent<HTMLLIElement>) => void;
	onDrop: (event: DragEvent<HTMLLIElement>) => void;
	isDragging: boolean;
	isDropTarget: boolean;
};

function TodoItem(props: TodoItemProps) {
	const [dropdownOpen, setDropdownOpen] = useState(false);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			if (!target.closest('.dropdown')) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	return (
		<li
			className={`${props.todo.completed ? 'todo-item completed' : props.todo.editing ? 'todo-item is-editing' : 'todo-item'} ${props.isDragging ? 'dragging' : ''} ${props.isDropTarget ? 'drop-before' : ''}`}
			data-todo-id={props.todo.id}
			onDragOver={props.onDragOver}
			onDrop={props.onDrop}
		>
			<button
				type="button"
				className="drag-handle"
				draggable
				onDragStart={event => {
					event.dataTransfer.setData('text/plain', props.todo.id);
					event.dataTransfer.effectAllowed = 'move';
					props.onDragStart();
				}}
				onDragEnd={props.onDragEnd}
				aria-label="Drag todo"
			>
				<svg viewBox="0 0 24 24" width="16" height="16">
					<circle cx="8" cy="6" r="1.5" />
					<circle cx="16" cy="6" r="1.5" />
					<circle cx="8" cy="12" r="1.5" />
					<circle cx="16" cy="12" r="1.5" />
					<circle cx="8" cy="18" r="1.5" />
					<circle cx="16" cy="18" r="1.5" />
				</svg>
			</button>
			{props.todo.completed ? (
				<div className="tooltip-wrapper">
					<button onClick={props.handleCompleteTodo} className="complete-button">
						<svg width="12" height="12" viewBox="0 0 24 24">
							<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
						</svg>
					</button>
					<div className="tooltip mark-uncompleted">
						<span>Mark as uncompleted</span>
					</div>
				</div>
			) : (
				<div className="tooltip-wrapper">
					<button onClick={props.handleCompleteTodo} className="complete-button">
						<svg width="12" height="12" viewBox="0 0 24 24">
							<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
						</svg>
					</button>
					<div className="tooltip mark-complete">
						<span>Mark as completed</span>
					</div>
				</div>
			)}

			{props.todo.editing ? (
				<form onSubmit={props.handleSaveTodo} className="edit-form">
					<input
						type="text"
						name="editTodo"
						defaultValue={props.todo.text}
						className="edit-input"
						autoComplete="off"
						autoFocus={props.todo.editing}
					/>
					<div className="tooltip-wrapper">
						<button type="submit" className="no-fill-icon-button">
							<svg width="12" height="12" viewBox="0 0 24 24">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
							</svg>
						</button>
						<div className="tooltip">
							<span>Save changes</span>
						</div>
					</div>
				</form>
			) : (
				<span className="todo-text">{props.todo.text}</span>
			)}

			<div className="right">
				{props.todo.important ? (
					<div className="tooltip-wrapper">
						<button className="no-fill-icon-button star-button" onClick={props.handleMarkImportant}>
							<svg xmlns="http://www.w3.org/2000/svg" className="ionicon important-star" viewBox="0 0 512 512">
								<title>Star</title>
								<path d="M394 480a16 16 0 01-9.39-3L256 383.76 127.39 477a16 16 0 01-24.55-18.08L153 310.35 23 221.2a16 16 0 019-29.2h160.38l48.4-148.95a16 16 0 0130.44 0l48.4 149H480a16 16 0 019.05 29.2L359 310.35l50.13 148.53A16 16 0 01394 480z" />
							</svg>
						</button>
						<div className="tooltip">
							<span>Remove importance</span>
						</div>
					</div>
				) : (
					<div className="tooltip-wrapper">
						<button className="no-fill-icon-button star-button" onClick={props.handleMarkImportant}>
							<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
								<title>Star</title>
								<path d="M480 208H308L256 48l-52 160H32l140 96-54 160 138-100 138 100-54-160z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="32" />
							</svg>
						</button>
						<div className="tooltip">
							<span>Mark as important</span>
						</div>
					</div>
				)}

				<div className="dropdown">
					<div className="tooltip-wrapper">
						<button className="no-fill-icon-button" onClick={() => setDropdownOpen(!dropdownOpen)}>
							<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
								<title>Ellipsis Horizontal</title>
								<circle cx="256" cy="256" r="48" />
								<circle cx="416" cy="256" r="48" />
								<circle cx="96" cy="256" r="48" />
							</svg>
						</button>
						<div className="tooltip more-options">
							<span>More options</span>
						</div>
					</div>

					<div className={`dropdown-content ${dropdownOpen ? 'show' : ''} ${props.todo.important ? 'important' : ''}`}>
						<button
							tabIndex={dropdownOpen ? 0 : -1}
							onClick={() => {
								setDropdownOpen(false);
								props.handleEditTodo();
							}}
							className="dropdown-item"
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
								<title>Pencil</title>
								<path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="44" d="M358.62 129.28L86.49 402.08 70 442l39.92-16.49 272.8-272.13-24.1-24.1zM413.07 74.84l-11.79 11.78 24.1 24.1 11.79-11.79a16.51 16.51 0 000-23.34l-.75-.75a16.51 16.51 0 00-23.35 0z" />
							</svg>
							<span>Edit task</span>
						</button>

						<button
							tabIndex={dropdownOpen ? 0 : -1}
							onClick={() => {
								setDropdownOpen(false);
								props.handleCompleteTodo();
							}}
							className="dropdown-item"
						>
							{props.todo.completed ? (
								<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none" className="no-fill-svg">
									<path d="M448 256C448 150 362 64 256 64C150 64 64 150 64 256C64 362 150 448 256 448C362 448 448 362 448 256Z" stroke="black" strokeWidth="32" strokeMiterlimit="10" />
								</svg>
							) : (
								<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
									<title>Checkmark Circle</title>
									<path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke="currentColor" strokeMiterlimit="10" strokeWidth="32" />
									<path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M352 176L217.6 336 160 272" />
								</svg>
							)}
							<span>{props.todo.completed ? 'Mark as uncompleted' : 'Mark as completed'}</span>
						</button>

						<button
							tabIndex={dropdownOpen ? 0 : -1}
							onClick={() => {
								setDropdownOpen(false);
								props.handleMarkImportant();
							}}
							className="dropdown-item"
						>
							{props.todo.important ? (
								<>
									<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
										<title>Star</title>
										<path d="M394 480a16 16 0 01-9.39-3L256 383.76 127.39 477a16 16 0 01-24.55-18.08L153 310.35 23 221.2a16 16 0 019-29.2h160.38l48.4-148.95a16 16 0 0130.44 0l48.4 149H480a16 16 0 019.05 29.2L359 310.35l50.13 148.53A16 16 0 01394 480z" />
									</svg>
									<span>Remove importance</span>
								</>
							) : (
								<>
									<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
										<title>Star</title>
										<path d="M480 208H308L256 48l-52 160H32l140 96-54 160 138-100 138 100-54-160z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="32" />
									</svg>
									<span>Mark as important</span>
								</>
							)}
						</button>

						<button
							tabIndex={dropdownOpen ? 0 : -1}
							onClick={() => {
								setDropdownOpen(false);
								props.handleDeleteTodo();
							}}
							className="dropdown-item danger"
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="ionicon" viewBox="0 0 512 512">
								<title>Trash</title>
								<path d="M296 64h-80a7.91 7.91 0 00-8 8v24h96V72a7.91 7.91 0 00-8-8z" fill="none" />
								<path d="M432 96h-96V72a40 40 0 00-40-40h-80a40 40 0 00-40 40v24H80a16 16 0 000 32h17l19 304.92c1.42 26.85 22 47.08 48 47.08h184c26.13 0 46.3-19.78 48-47l19-305h17a16 16 0 000-32zM192.57 416H192a16 16 0 01-16-15.43l-8-224a16 16 0 1132-1.14l8 224A16 16 0 01192.57 416zM272 400a16 16 0 01-32 0V176a16 16 0 0132 0zm32-304h-96V72a7.91 7.91 0 018-8h80a7.91 7.91 0 018 8zm32 304.57A16 16 0 01320 416h-.58A16 16 0 01304 399.43l8-224a16 16 0 1132 1.14z" />
							</svg>
							<span>Delete task</span>
						</button>
					</div>
				</div>
			</div>
		</li>
	);
}

export default TodoItem;
