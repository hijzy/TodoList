import React from 'react';
import ReactDOM from 'react-dom/client';
import TodoList from './TodoList';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<TodoList />
	</React.StrictMode>
);
