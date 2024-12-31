import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.scss';
import App from './App';
import reportWebVitals from './reportWebVitals';

declare namespace CSS {
    interface PropertyDefinition {
        name: string
        syntax?: string
        inherits: boolean
        initialValue?: string
    }
    function registerProperty (propertyDefinition: PropertyDefinition): undefined
}

CSS.registerProperty({
    name: "--_c",
    syntax: "<color>",
    inherits: true,
    initialValue: '#fff',
});

CSS.registerProperty({
    name: "--_c1",
    syntax: "<color>",
    inherits: true,
    initialValue: '#fff',
});

CSS.registerProperty({
    name: "--_c2",
    syntax: "<color>",
    inherits: true,
    initialValue: '#fff',
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
    <App />
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals(console.log);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/service-worker.js')  // Path to your service worker file
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(err => {
                console.error('Service Worker registration failed:', err);
            });
    });
}
