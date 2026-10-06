import { mountApp } from './app.tsx';

mountApp(document.getElementById('app')!, { fetch: (input, init) => fetch(input, init) });
